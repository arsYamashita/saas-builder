/**
 * Thin wrapper around the vault-hosted canonical checklist generator.
 *
 * 2026-07-06: the actual generation logic (buildChecklist, CLI arg
 * parsing, `.kb-checklist.json` / `--stack` resolution) was extracted to
 * `~/Documents/my-vault/_scripts/kb_checklist/generate-error-checklist.mjs`
 * (plain, dependency-free Node ESM) so every active repo can consume it,
 * not just saas-builder
 * (50_M5_Instructions/2026-07-03_016_kb_checklist_rollout_daycare_navigator.md).
 * This file just resolves VAULT_PATH and delegates to that module.
 *
 * Usage (unchanged):
 *   npm run kb:checklist
 *   npm run kb:checklist -- --stack nextjs,supabase,stripe
 *   VAULT_PATH=/custom/path/to/vault npm run kb:checklist
 *
 * `scripts/error-checklist-core.ts` (the pure logic, unit-tested by
 * scripts/__tests__/error-checklist-core.test.ts) stays in this repo,
 * behaviorally identical to the vault copy -- see that file's header
 * comment for why (CI never has the vault mounted).
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
  const scriptPath = path.join(
    vaultPath,
    "_scripts",
    "kb_checklist",
    "generate-error-checklist.mjs"
  );

  try {
    await import(pathToFileURL(scriptPath).href);
  } catch (err) {
    console.error(
      `[kb:checklist] could not load the vault script at "${scriptPath}": ` +
        `${(err as Error).message}\n` +
        "This command requires the M2 Obsidian vault to be present locally " +
        "(set VAULT_PATH to override the default ~/Documents/my-vault)."
    );
    process.exit(1);
  }
}

main();
