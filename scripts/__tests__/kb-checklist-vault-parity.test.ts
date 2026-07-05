/**
 * Drift tripwire: cross-checks this repo's scripts/*-core.ts (used by
 * saas-builder's own CI-run unit tests) against the vault-hosted
 * canonical copy at ~/Documents/my-vault/_scripts/kb_checklist/*.mjs
 * (used by every other repo). See scripts/error-checklist-core.ts's
 * header comment for why the two copies exist side by side instead of
 * saas-builder importing the vault module directly.
 *
 * Deliberately runs only when the vault is present on the machine
 * executing the test (true on this dev machine, false on any CI runner
 * -- ci.yml's ubuntu-latest checkout never has ~/Documents/my-vault).
 * When the vault is absent this suite reports 0 tests, not a failure, so
 * it can never break CI; it exists purely as a local safety net against
 * the two copies silently diverging.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildChecklist as buildChecklistLocal } from "../error-checklist-core";
import { updateFrontmatterResolved as updateFrontmatterResolvedLocal } from "../kb-resolve-core";
import { parseResolvesKbTrailers as parseResolvesKbTrailersLocal } from "../kb-reconcile-core";

function resolveVaultPath(): string {
  const raw = process.env.VAULT_PATH || "~/Documents/my-vault";
  return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
}

const vaultKbDir = path.join(resolveVaultPath(), "_scripts", "kb_checklist");
const vaultAvailable = fs.existsSync(path.join(vaultKbDir, "error-checklist-core.mjs"));

describe.skipIf(!vaultAvailable)("vault parity (local-only, skipped in CI)", () => {
  it("buildChecklist: local TS and vault .mjs agree on fixture input", async () => {
    const { buildChecklist: buildChecklistVault } = await import(
      pathToFileURL(path.join(vaultKbDir, "error-checklist-core.mjs")).href
    );

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-test-"));
    fs.mkdirSync(path.join(dir, "30_Knowledge", "errors"), { recursive: true });
    try {
      const errorsDir = path.join(dir, "30_Knowledge", "errors");
      fs.writeFileSync(
        path.join(errorsDir, "stripe_webhook_signature_missing.md"),
        `---
type: error_pattern
severity: critical
projects: [saas-builder]
resolved: false
created: 2026-04-03
tags: [error, pattern, stripe, webhook, security]
---

# エラーパターン: Stripe Webhook 署名検証未実装
`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(errorsDir, "ios_swift_cert.md"),
        `---
type: error_pattern
severity: medium
projects: [KokkoPay_iOS]
resolved: false
created: 2026-05-01
tags: [error, pattern, ios, swift, xcode]
---

# エラーパターン: Swift 証明書ハンドリング不備
`,
        "utf8"
      );

      const local = buildChecklistLocal(dir, () => {}, { stacks: ["nextjs"] });
      const vault = buildChecklistVault(dir, () => {}, { stacks: ["nextjs"] });

      // Compare parsing/categorization/filtering results (the actual
      // drift risk), not the rendered prose: the vault copy's markdown
      // deliberately uses repo-agnostic wording (e.g. "kb:resolve"
      // instead of "npm run kb:resolve", since not every consuming repo
      // is an npm project) so it is not expected to be byte-identical.
      expect(vault.items).toEqual(local.items);
      expect(vault.ignoredNonPattern).toBe(local.ignoredNonPattern);
      expect(vault.filteredByStack).toBe(local.filteredByStack);
      expect(vault.skipped).toEqual(local.skipped);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updateFrontmatterResolved: local TS and vault .mjs agree on fixture input", async () => {
    const { updateFrontmatterResolved: updateFrontmatterResolvedVault } = await import(
      pathToFileURL(path.join(vaultKbDir, "kb-resolve-core.mjs")).href
    );

    const content = `---
type: error_pattern
severity: high
projects: [saas-builder]
resolved: false
created: 2026-05-25
tags: [error, pattern, stripe]
---

# some pattern
`;
    const opts = { resolvedBy: "saas-builder#27", resolvedAt: "2026-07-06" };

    const local = updateFrontmatterResolvedLocal(content, opts);
    const vault = updateFrontmatterResolvedVault(content, opts);

    expect(vault.content).toBe(local.content);
    expect(vault.changed).toBe(local.changed);
  });

  it("parseResolvesKbTrailers: local TS and vault .mjs agree on fixture input", async () => {
    const { parseResolvesKbTrailers: parseResolvesKbTrailersVault } = await import(
      pathToFileURL(path.join(vaultKbDir, "kb-reconcile-core.mjs")).href
    );

    const body = `Resolves-KB: a.md, b.md\n<!-- Resolves-KB: fake.md -->\n`;

    expect(parseResolvesKbTrailersVault(body)).toEqual(parseResolvesKbTrailersLocal(body));
  });
});
