import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * artifact-check.sh: forbidden filename + zip-inner-content gate.
 * gitleaks does not look inside archives, so a `terraform plan -out=tfplan`
 * (a zip holding terraform.tfstate) sails past it. These tests build real
 * files in a throwaway git repo and run the real script.
 */

const SCRIPT = path.resolve(__dirname, "../../ci/artifact-check.sh");

let repo: string;

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function makeZip(name: string, inner: Record<string, string>) {
  const stage = mkdtempSync(path.join(tmpdir(), "ac-stage-"));
  try {
    for (const [rel, body] of Object.entries(inner)) {
      mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
      writeFileSync(path.join(stage, rel), body);
    }
    const dest = path.join(repo, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    // zip appends ".zip" to extension-less targets, so build under a
    // .zip name and rename to get a true extension-less archive.
    const tmpZip = path.join(stage, "__out.zip");
    execFileSync("zip", ["-q", "-r", tmpZip, ...Object.keys(inner)], {
      cwd: stage,
    });
    renameSync(tmpZip, dest);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function writeRepoFile(rel: string, body: string) {
  const dest = path.join(repo, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, body);
}

function run(args: string[]) {
  return spawnSync("bash", [SCRIPT, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "ac-repo-"));
  git("init", "-q");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("artifact-check.sh", () => {
  it("FAILS on envs/dev/tfplan (zip containing terraform.tfstate)", () => {
    makeZip("envs/dev/tfplan", { "terraform.tfstate": '{"secret":"x"}' });
    const r = run(["envs/dev/tfplan"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("envs/dev/tfplan");
    // never echo contents
    expect(r.stderr + r.stdout).not.toContain('"secret"');
  });

  it("FAILS on an extension-less zip that contains .env inside", () => {
    makeZip("bundle", { ".env": "KEY=value" });
    const r = run(["bundle"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("bundle");
    expect(r.stderr + r.stdout).not.toContain("KEY=value");
  });

  it("FAILS on x.tfstate.backup", () => {
    writeRepoFile("x.tfstate.backup", "{}");
    const r = run(["x.tfstate.backup"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("x.tfstate.backup");
  });

  it("PASSES on .env.example", () => {
    writeRepoFile(".env.example", "KEY=\n");
    const r = run([".env.example"]);
    expect(r.status).toBe(0);
  });

  it("PASSES on a harmless zip containing only README.md", () => {
    makeZip("docs.zip", { "README.md": "hello" });
    const r = run(["docs.zip"]);
    expect(r.status).toBe(0);
  });

  it("PASSES on an empty file list (git ls-files of an empty repo)", () => {
    const r = run([]);
    expect(r.status).toBe(0);
  });

  it("reports every offender in one run (single exit, no early die)", () => {
    writeRepoFile("a.pem", "x");
    writeRepoFile("b.tfstate", "{}");
    const r = run(["a.pem", "b.tfstate"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("a.pem");
    expect(r.stderr).toContain("b.tfstate");
  });

  it("P1-a: --staged inspects the staged blob, not the swapped working tree", () => {
    makeZip("bundle", { ".env": "KEY=value" });
    git("add", "bundle");
    // swap the working copy for something harmless after staging
    writeRepoFile("bundle", "harmless");
    const r = run(["--staged"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("bundle");
    // and deleting the path from the working tree does not hide it either
    rmSync(path.join(repo, "bundle"));
    expect(run(["--staged"]).status).toBe(1);
  });

  it("P1-a: --staged passes a clean index", () => {
    writeRepoFile("ok.txt", "fine");
    git("add", "ok.txt");
    expect(run(["--staged"]).status).toBe(0);
  });

  it("P1-b: rejects a nested archive (bundle.zip > inner.zip > .env)", () => {
    makeZip("inner.zip", { ".env": "KEY=value" });
    const innerBytes = readFileSync(path.join(repo, "inner.zip"));
    rmSync(path.join(repo, "inner.zip"));
    const stage = mkdtempSync(path.join(tmpdir(), "ac-nest-"));
    writeFileSync(path.join(stage, "inner.zip"), innerBytes);
    execFileSync("zip", ["-q", path.join(repo, "bundle.zip"), "inner.zip"], {
      cwd: stage,
    });
    rmSync(stage, { recursive: true, force: true });
    const r = run(["bundle.zip"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("nested archive not allowed");
  });

  it("P1-b: rejects a nested zip disguised with a plain name", () => {
    makeZip("inner.zip", { ".env": "KEY=value" });
    const innerBytes = readFileSync(path.join(repo, "inner.zip"));
    rmSync(path.join(repo, "inner.zip"));
    const stage = mkdtempSync(path.join(tmpdir(), "ac-nest-"));
    writeFileSync(path.join(stage, "notes.txt"), innerBytes);
    execFileSync("zip", ["-q", path.join(repo, "bundle.zip"), "notes.txt"], {
      cwd: stage,
    });
    rmSync(stage, { recursive: true, force: true });
    const r = run(["bundle.zip"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("nested archive not allowed");
  });

  it("P1-c: detects a zip with prepended data (no PK header)", () => {
    makeZip("tmp.zip", { ".env": "KEY=value" });
    const zipBytes = readFileSync(path.join(repo, "tmp.zip"));
    rmSync(path.join(repo, "tmp.zip"));
    writeFileSync(
      path.join(repo, "sfx.bin"),
      Buffer.concat([Buffer.from("#!/bin/sh\nexit 0\n"), zipBytes]),
    );
    const r = run(["sfx.bin"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("sfx.bin");
  });

  it("P1-c: an unreadable file fails closed", () => {
    writeRepoFile("secret.bin", "x");
    chmodSync(path.join(repo, "secret.bin"), 0o000);
    try {
      if (process.getuid && process.getuid() === 0) return; // root reads anyway
      expect(run(["secret.bin"]).status).toBe(1);
    } finally {
      chmodSync(path.join(repo, "secret.bin"), 0o600);
    }
  });

  it("P2-a: a name with a newline is never exempted by the allowlist", () => {
    const evil = ".env.example\n.env";
    writeRepoFile(evil, "KEY=1");
    const r = run([evil]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("line break");
  });

  it("P2-a: a zip entry name with a newline fails closed", () => {
    const stage = mkdtempSync(path.join(tmpdir(), "ac-nl-"));
    const py =
      "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');" +
      "z.writestr('.env.example\\n.env','x');z.writestr('b','y');z.close()";
    const r0 = spawnSync("python3", ["-c", py, path.join(repo, "nl.zip")]);
    rmSync(stage, { recursive: true, force: true });
    if (r0.status !== 0) return; // python3 unavailable
    const r = run(["nl.zip"]);
    expect(r.status).toBe(1);
    // unzip escapes the newline as ^J; either way the entry is rejected
    expect(r.stderr).toContain("FORBIDDEN ZIP ENTRY");
  });

  it("P2-b: outside a git repo, enumeration failure fails closed", () => {
    const nogit = mkdtempSync(path.join(tmpdir(), "ac-nogit-"));
    try {
      const r = spawnSync("bash", [SCRIPT], {
        cwd: nogit,
        encoding: "utf8",
        env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(nogit) },
      });
      expect(r.status).toBe(1);
      expect(r.stdout).not.toContain("OK");
      const s = spawnSync("bash", [SCRIPT, "--staged"], {
        cwd: nogit,
        encoding: "utf8",
        env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(nogit) },
      });
      expect(s.status).toBe(1);
    } finally {
      rmSync(nogit, { recursive: true, force: true });
    }
  });

  it("P1-b: rejects an inner.txt that is a zip WITH prepended data", () => {
    makeZip("tmp.zip", { ".env": "KEY=value" });
    const z = readFileSync(path.join(repo, "tmp.zip"));
    rmSync(path.join(repo, "tmp.zip"));
    const stage = mkdtempSync(path.join(tmpdir(), "ac-pre-"));
    writeFileSync(
      path.join(stage, "inner.txt"),
      Buffer.concat([Buffer.from("JUNKJUNK"), z]),
    );
    execFileSync("zip", ["-q", path.join(repo, "bundle.zip"), "inner.txt"], {
      cwd: stage,
    });
    rmSync(stage, { recursive: true, force: true });
    const r = run(["bundle.zip"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("nested archive not allowed");
  });

  it("P1-b: rejects an encrypted (unreadable) inner entry, fail-closed", () => {
    const stage = mkdtempSync(path.join(tmpdir(), "ac-enc-"));
    writeFileSync(path.join(stage, "data.txt"), "hello");
    execFileSync(
      "zip",
      ["-q", "-P", "pw", path.join(repo, "enc.zip"), "data.txt"],
      { cwd: stage },
    );
    rmSync(stage, { recursive: true, force: true });
    const r = run(["enc.zip"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("nested archive not allowed");
    expect(r.stderr).not.toContain("hello");
  });

  it("P1-b: a harmless non-archive inner file (README.md) still passes", () => {
    makeZip("ok.zip", { "README.md": "hello", "docs/a.txt": "x" });
    expect(run(["ok.zip"]).status).toBe(0);
  });
});
