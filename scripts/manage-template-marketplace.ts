#!/usr/bin/env tsx
/**
 * CLI: Template Marketplace Management
 *
 * Usage:
 *   npx tsx scripts/manage-template-marketplace.ts list
 *   npx tsx scripts/manage-template-marketplace.ts publish --template reservation_saas
 *   npx tsx scripts/manage-template-marketplace.ts unpublish --template reservation_saas
 *   npx tsx scripts/manage-template-marketplace.ts experimental --template reservation_saas
 *   npx tsx scripts/manage-template-marketplace.ts adopt --template reservation_saas
 *   npx tsx scripts/manage-template-marketplace.ts derive --parent reservation_saas --new restaurant_reservation_saas
 *   npx tsx scripts/manage-template-marketplace.ts list --json
 */

import {
  listMarketplaceItems,
  publishTemplate,
  unpublishTemplate,
  markExperimental,
  recordTemplateAdoptionIntent,
  recordTemplateDerivationIntent,
  buildMarketplaceReport,
  formatMarketplaceReport,
  type MarketplaceStatus,
} from "../lib/factory/template-marketplace";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(
  status: MarketplaceStatus | undefined,
  domain: string | undefined,
  json: boolean,
): void {
  if (json) {
    const report = buildMarketplaceReport();
    console.log(JSON.stringify(report, null, 2));
  } else {
    const items = listMarketplaceItems({ status, domain });
    if (items.length === 0) {
      console.log("マーケットプレースアイテムはありません。");
      return;
    }
    const report = buildMarketplaceReport();
    console.log(formatMarketplaceReport(report));
  }
}

function cmdPublish(templateId: string, json: boolean): void {
  const result = publishTemplate(templateId);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(`Published: ${templateId} (${result.reason})`);
    } else {
      console.error(`Failed to publish ${templateId}: ${result.reason}`);
      process.exit(1);
    }
  }
}

function cmdUnpublish(templateId: string, json: boolean): void {
  const result = unpublishTemplate(templateId);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Unpublished: ${templateId}`);
  }
}

function cmdExperimental(templateId: string, json: boolean): void {
  const result = markExperimental(templateId);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(`Marked as experimental: ${templateId}`);
    } else {
      console.error(`Failed: ${result.reason}`);
      process.exit(1);
    }
  }
}

function cmdAdopt(templateId: string, json: boolean): void {
  const intent = recordTemplateAdoptionIntent(templateId, "cli");
  if (json) {
    console.log(JSON.stringify(intent, null, 2));
  } else {
    console.log(`Adoption intent recorded: ${intent.intentId}`);
    console.log(`  template: ${intent.templateId}`);
    console.log(`  at: ${intent.requestedAt}`);
  }
}

function cmdDerive(
  parentId: string,
  newId: string,
  json: boolean,
): void {
  const intent = recordTemplateDerivationIntent(parentId, newId, "cli");
  if (json) {
    console.log(JSON.stringify(intent, null, 2));
  } else {
    console.log(`Derivation intent recorded: ${intent.intentId}`);
    console.log(`  parent: ${intent.parentTemplateId}`);
    console.log(`  new:    ${intent.requestedTemplateId}`);
    console.log(`  at:     ${intent.requestedAt}`);
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/manage-template-marketplace.ts <command> [options]

Commands:
  list                         List marketplace items
  publish                      Publish a template
  unpublish                    Unpublish a template
  experimental                 Mark a template as experimental
  adopt                        Record adoption intent
  derive                       Record derivation intent

Options:
  --template <id>              Target template ID
  --parent <id>                Parent template for derivation
  --new <id>                   New template ID for derivation
  --status <status>            Filter by status (published, unpublished, experimental)
  --domain <domain>            Filter by domain
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/manage-template-marketplace.ts list
  npx tsx scripts/manage-template-marketplace.ts publish --template reservation_saas
  npx tsx scripts/manage-template-marketplace.ts unpublish --template reservation_saas
  npx tsx scripts/manage-template-marketplace.ts experimental --template reservation_saas
  npx tsx scripts/manage-template-marketplace.ts adopt --template reservation_saas
  npx tsx scripts/manage-template-marketplace.ts derive --parent reservation_saas --new restaurant_reservation_saas
  npx tsx scripts/manage-template-marketplace.ts list --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  const json = args.includes("--json");

  let templateId: string | undefined;
  let parentId: string | undefined;
  let newId: string | undefined;
  let status: MarketplaceStatus | undefined;
  let domain: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--template":
        templateId = args[++i];
        break;
      case "--parent":
        parentId = args[++i];
        break;
      case "--new":
        newId = args[++i];
        break;
      case "--status": {
        const val = args[++i];
        if (val === "published" || val === "unpublished" || val === "experimental") {
          status = val;
        }
        break;
      }
      case "--domain":
        domain = args[++i];
        break;
    }
  }

  switch (command) {
    case "list":
      cmdList(status, domain, json);
      break;
    case "publish":
      if (!templateId) {
        console.error("Error: --template is required");
        process.exit(1);
      }
      cmdPublish(templateId, json);
      break;
    case "unpublish":
      if (!templateId) {
        console.error("Error: --template is required");
        process.exit(1);
      }
      cmdUnpublish(templateId, json);
      break;
    case "experimental":
      if (!templateId) {
        console.error("Error: --template is required");
        process.exit(1);
      }
      cmdExperimental(templateId, json);
      break;
    case "adopt":
      if (!templateId) {
        console.error("Error: --template is required");
        process.exit(1);
      }
      cmdAdopt(templateId, json);
      break;
    case "derive":
      if (!parentId || !newId) {
        console.error("Error: --parent and --new are required");
        process.exit(1);
      }
      cmdDerive(parentId, newId, json);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
