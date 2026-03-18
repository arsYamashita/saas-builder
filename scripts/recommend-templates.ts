#!/usr/bin/env tsx
/**
 * CLI: Template Recommendation Engine
 *
 * Usage:
 *   npx tsx scripts/recommend-templates.ts
 *   npx tsx scripts/recommend-templates.ts --domain reservation
 *   npx tsx scripts/recommend-templates.ts --use-case booking
 *   npx tsx scripts/recommend-templates.ts --type derivation
 *   npx tsx scripts/recommend-templates.ts --type underused
 *   npx tsx scripts/recommend-templates.ts --type production
 *   npx tsx scripts/recommend-templates.ts --type rising
 *   npx tsx scripts/recommend-templates.ts --json
 */

import {
  recommendTemplatesByDomain,
  recommendTemplatesByUseCase,
  recommendBestDerivationParents,
  recommendUnderusedHighQualityTemplates,
  recommendSafestProductionTemplates,
  recommendRisingTemplates,
  buildTemplateRecommendationReport,
  formatRecommendationReport,
  formatRecommendationRecord,
  ALL_USE_CASES,
  type UseCaseCategory,
} from "../lib/factory/template-recommendation-engine";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/recommend-templates.ts [options]

Options:
  --domain <domain>       Recommend by domain (e.g., reservation, crm, community)
  --use-case <useCase>    Recommend by use case (${ALL_USE_CASES.join(", ")})
  --type <type>           Recommendation type:
                            derivation   — best derivation parents
                            underused    — underused high-quality templates
                            production   — safest production templates
                            rising       — rising trend templates
  --json                  Output as JSON
  --help                  Show this help

Examples:
  npx tsx scripts/recommend-templates.ts
  npx tsx scripts/recommend-templates.ts --domain reservation
  npx tsx scripts/recommend-templates.ts --use-case booking
  npx tsx scripts/recommend-templates.ts --use-case crm --json
  npx tsx scripts/recommend-templates.ts --type derivation
  npx tsx scripts/recommend-templates.ts --type underused
  npx tsx scripts/recommend-templates.ts --type production
  npx tsx scripts/recommend-templates.ts --type rising
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  let domain: string | undefined;
  let useCase: UseCaseCategory | undefined;
  let type: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--domain":
        domain = args[++i];
        break;
      case "--use-case":
        useCase = args[++i] as UseCaseCategory;
        break;
      case "--type":
        type = args[++i];
        break;
    }
  }

  // Specific domain
  if (domain) {
    const recs = recommendTemplatesByDomain(domain);
    if (json) {
      console.log(JSON.stringify(recs, null, 2));
    } else {
      if (recs.length === 0) {
        console.log(`ドメイン "${domain}" に該当するテンプレートはありません。`);
      } else {
        console.log(`RECOMMENDATIONS FOR DOMAIN: ${domain}\n`);
        for (const rec of recs) {
          console.log(formatRecommendationRecord(rec));
          console.log();
        }
      }
    }
    return;
  }

  // Specific use case
  if (useCase) {
    if (!ALL_USE_CASES.includes(useCase)) {
      console.error(`Error: --use-case must be one of: ${ALL_USE_CASES.join(", ")}`);
      process.exit(1);
    }
    const recs = recommendTemplatesByUseCase(useCase);
    if (json) {
      console.log(JSON.stringify(recs, null, 2));
    } else {
      if (recs.length === 0) {
        console.log(`ユースケース "${useCase}" に該当するテンプレートはありません。`);
      } else {
        console.log(`RECOMMENDATIONS FOR USE CASE: ${useCase}\n`);
        for (const rec of recs) {
          console.log(formatRecommendationRecord(rec));
          console.log();
        }
      }
    }
    return;
  }

  // Specific type
  if (type) {
    let recs;
    let title: string;
    switch (type) {
      case "derivation":
        recs = recommendBestDerivationParents();
        title = "BEST DERIVATION PARENTS";
        break;
      case "underused":
        recs = recommendUnderusedHighQualityTemplates();
        title = "UNDERUSED HIGH-QUALITY TEMPLATES";
        break;
      case "production":
        recs = recommendSafestProductionTemplates();
        title = "SAFEST PRODUCTION TEMPLATES";
        break;
      case "rising":
        recs = recommendRisingTemplates();
        title = "RISING TEMPLATES";
        break;
      default:
        console.error(
          `Error: --type must be one of: derivation, underused, production, rising`,
        );
        process.exit(1);
    }

    if (json) {
      console.log(JSON.stringify(recs, null, 2));
    } else {
      if (recs.length === 0) {
        console.log(`${title}: 該当なし`);
      } else {
        console.log(`${title}\n`);
        for (const rec of recs) {
          console.log(formatRecommendationRecord(rec));
          console.log();
        }
      }
    }
    return;
  }

  // Full report (default)
  const report = buildTemplateRecommendationReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatRecommendationReport(report));
  }
}

main();
