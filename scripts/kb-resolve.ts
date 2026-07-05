/**
 * Marks a single vault KB error-pattern file as resolved.
 *
 * Usage:
 *   npm run kb:resolve -- <error-file>.md --pr <number> --project <name>
 *   npm run kb:resolve -- <error-file>.md --resolved-by "<free text>"
 *   VAULT_PATH=/custom/path npm run kb:resolve -- <error-file>.md --pr 27 --project saas-builder
 *
 * Writes `resolved: true`, `resolved_by: "<project>#<pr>"` (or the
 * `--resolved-by` string verbatim), and `resolved_at: <date>` into the
 * file's frontmatter. The Markdown body is never touched. See
 * scripts/kb-resolve-core.ts for the frontmatter-rewrite logic.
 *
 * Exits 1 (without writing) if the file can't be read, or has no
 * frontmatter block to update — an unreadable/malformed KB file should
 * fail loudly, not be silently skipped, since the whole point of this
 * tool is to make "did we actually record the fix" trustworthy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateFrontmatterResolved } from "./kb-resolve-core";

interface CliArgs {
  file: string;
  pr?: string;
  project?: string;
  resolvedBy?: string;
  date?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`missing value for --${key}`);
      }
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(
      "usage: kb:resolve -- <error-file>.md --pr <number> --project <name> " +
        "(or --resolved-by \"<free text>\")"
    );
  }

  return {
    file: positional[0],
    pr: flags.pr,
    project: flags.project,
    resolvedBy: flags["resolved-by"],
    date: flags.date,
  };
}

function resolveVaultPath(): string {
  const raw = process.env.VAULT_PATH || "~/Documents/my-vault";
  return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
}

/** Local (not UTC) calendar date as YYYY-MM-DD — matches the vault's convention
 * of dating entries by the author's local day, and avoids `resolved_at`
 * silently landing on "yesterday" for anyone west of UTC in the evening. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[kb:resolve] ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const resolvedBy =
    args.resolvedBy ?? (args.project && args.pr ? `${args.project}#${args.pr}` : undefined);

  if (!resolvedBy) {
    console.error(
      "[kb:resolve] must supply either --resolved-by \"<text>\" or both --project <name> and --pr <number>"
    );
    process.exit(1);
    return;
  }

  const vaultPath = resolveVaultPath();
  const fileName = args.file.endsWith(".md") ? args.file : `${args.file}.md`;
  const fullPath = path.join(vaultPath, "30_Knowledge", "errors", fileName);

  let content: string;
  try {
    content = fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? String(err);
    console.error(`[kb:resolve] cannot read "${fullPath}": ${code}`);
    process.exit(1);
    return;
  }

  const resolvedAt = args.date ?? todayISO();

  let result;
  try {
    result = updateFrontmatterResolved(content, { resolvedBy, resolvedAt });
  } catch (err) {
    console.error(`[kb:resolve] ${fileName}: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  if (!result.changed) {
    console.log(
      `[kb:resolve] ${fileName}: already resolved_by=${resolvedBy} resolved_at=${resolvedAt} — no changes.`
    );
    return;
  }

  fs.writeFileSync(fullPath, result.content, "utf8");

  if (result.previousResolvedBy && result.previousResolvedBy !== resolvedBy) {
    console.log(
      `[kb:resolve] ${fileName}: was previously resolved_by="${result.previousResolvedBy}", now "${resolvedBy}"`
    );
  }
  console.log(
    `[kb:resolve] ${fileName}: resolved=true resolved_by="${resolvedBy}" resolved_at=${resolvedAt}`
  );
}

main();
