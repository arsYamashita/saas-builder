/**
 * Generates docs/error-kb-checklist.md from the M2 vault's
 * 30_Knowledge/errors/ error-pattern KB, categorized by the recurring
 * clusters (Stripe/payments, Supabase RLS, idempotency/race conditions,
 * rate-limit/env). Linked from .github/PULL_REQUEST_TEMPLATE.md.
 *
 * Usage:
 *   npm run kb:checklist
 *   VAULT_PATH=/custom/path/to/vault npm run kb:checklist
 *
 * Exits 1 (without writing docs/error-kb-checklist.md) if zero
 * error-pattern entries were found — an empty checklist is treated as a
 * failure, not a valid (if boring) result, since it almost always means
 * VAULT_PATH is wrong rather than the KB genuinely being empty.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildChecklist } from "./error-checklist-core";

function resolveVaultPath(): string {
  const raw = process.env.VAULT_PATH || "~/Documents/my-vault";
  return raw.startsWith("~")
    ? path.join(os.homedir(), raw.slice(1))
    : path.resolve(raw);
}

function main(): void {
  const vaultPath = resolveVaultPath();
  const result = buildChecklist(vaultPath, (message) => console.warn(message));

  if (result.items.length === 0) {
    console.error(
      `[generate-error-checklist] 0 error-pattern entries found under ` +
        `"${vaultPath}/30_Knowledge/errors" — refusing to write an empty ` +
        `checklist. Check VAULT_PATH (currently ${
          process.env.VAULT_PATH ? "set" : "unset, using default"
        }).`
    );
    process.exit(1);
  }

  const outPath = path.join(process.cwd(), "docs", "error-kb-checklist.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.markdown, "utf8");

  console.log(
    `[generate-error-checklist] ${result.items.length} item(s) written, ` +
      `${result.skipped.length} unreadable file(s) skipped, ` +
      `${result.ignoredNonPattern} non-pattern file(s) ignored -> ` +
      `${path.relative(process.cwd(), outPath)}`
  );
}

main();
