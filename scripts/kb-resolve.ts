/**
 * Thin wrapper around the vault-hosted canonical `kb:resolve` script.
 *
 * 2026-07-06: extracted to
 * `~/Documents/my-vault/_scripts/kb_checklist/kb-resolve.mjs` (plain,
 * dependency-free Node ESM) alongside the checklist generator -- see
 * scripts/generate-error-checklist.ts for the rationale.
 *
 * Usage (unchanged):
 *   npm run kb:resolve -- <error-file>.md --pr <number> --project <name>
 *   npm run kb:resolve -- <error-file>.md --resolved-by "<free text>"
 *   VAULT_PATH=/custom/path npm run kb:resolve -- <error-file>.md --pr 27 --project saas-builder
 *
 * `scripts/kb-resolve-core.ts` (the pure frontmatter-rewrite logic,
 * unit-tested by scripts/__tests__/kb-resolve-core.test.ts) stays in this
 * repo, behaviorally identical to the vault copy, for the same
 * CI-never-has-the-vault reason documented in error-checklist-core.ts.
 */
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function resolveVaultPath(): string {
  const raw = process.env.VAULT_PATH || "~/Documents/my-vault";
  return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
}

async function main(): Promise<void> {
  const vaultPath = resolveVaultPath();
  const scriptPath = path.join(vaultPath, "_scripts", "kb_checklist", "kb-resolve.mjs");

  try {
    await import(pathToFileURL(scriptPath).href);
  } catch (err) {
    console.error(
      `[kb:resolve] could not load the vault script at "${scriptPath}": ` +
        `${(err as Error).message}\n` +
        "This command requires the M2 Obsidian vault to be present locally " +
        "(set VAULT_PATH to override the default ~/Documents/my-vault)."
    );
    process.exit(1);
  }
}

main();
