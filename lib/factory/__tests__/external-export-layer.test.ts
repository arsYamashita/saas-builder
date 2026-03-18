import { describe, it, expect } from "vitest";
import {
  exportMarketplaceCatalog,
  exportMarketplaceCatalogCsv,
  exportTemplateReleaseCatalog,
  exportTemplateReleaseCatalogCsv,
  exportTemplateRanking,
  exportTemplateRankingCsv,
  exportTemplateRecommendations,
  exportPortfolioStrategy,
  exportScenarioPlans,
  exportStrategicKpis,
  exportStrategicKpisCsv,
  buildExportManifest,
  executeExport,
  recordsToCsv,
  type ExportInputs,
  type ExportResult,
} from "../external-export-layer";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("External Export Layer", () => {
  // 1. JSON exports are deterministic
  describe("JSON determinism", () => {
    it("marketplace export produces same result on repeated calls", () => {
      const a = exportMarketplaceCatalog();
      const b = exportMarketplaceCatalog();
      expect(a.records).toEqual(b.records);
      expect(a.recordCount).toBe(b.recordCount);
    });

    it("ranking export produces same result on repeated calls", () => {
      const a = exportTemplateRanking();
      const b = exportTemplateRanking();
      expect(a.records).toEqual(b.records);
      expect(a.recordCount).toBe(b.recordCount);
    });

    it("KPI export produces same result on repeated calls", () => {
      const a = exportStrategicKpis();
      const b = exportStrategicKpis();
      expect(a.records).toEqual(b.records);
      expect(a.recordCount).toBe(b.recordCount);
    });
  });

  // 2. CSV exports are deterministic
  describe("CSV determinism", () => {
    it("marketplace CSV produces same result on repeated calls", () => {
      const a = exportMarketplaceCatalogCsv();
      const b = exportMarketplaceCatalogCsv();
      expect(a).toBe(b);
    });

    it("ranking CSV produces same result on repeated calls", () => {
      const a = exportTemplateRankingCsv();
      const b = exportTemplateRankingCsv();
      expect(a).toBe(b);
    });

    it("KPI CSV produces same result on repeated calls", () => {
      const a = exportStrategicKpisCsv();
      const b = exportStrategicKpisCsv();
      expect(a).toBe(b);
    });

    it("release catalog CSV produces same result on repeated calls", () => {
      const a = exportTemplateReleaseCatalogCsv();
      const b = exportTemplateReleaseCatalogCsv();
      expect(a).toBe(b);
    });
  });

  // 3. Marketplace export works
  describe("marketplace export", () => {
    it("returns valid ExportResult structure", () => {
      const result = exportMarketplaceCatalog();
      expect(result.target).toBe("marketplace");
      expect(result.format).toBe("json");
      expect(result.recordCount).toBe(result.records.length);
      expect(result.generatedAt).toBeTruthy();
    });

    it("CSV has header row", () => {
      const csv = exportMarketplaceCatalogCsv();
      const firstLine = csv.split("\n")[0];
      expect(firstLine).toContain("templateId");
      expect(firstLine).toContain("domain");
      expect(firstLine).toContain("status");
    });

    it("CSV has correct number of lines", () => {
      const result = exportMarketplaceCatalog();
      const csv = exportMarketplaceCatalogCsv();
      const lines = csv.split("\n");
      expect(lines.length).toBe(result.recordCount + 1); // header + records
    });
  });

  // 4. Ranking export works
  describe("ranking export", () => {
    it("returns valid ExportResult structure", () => {
      const result = exportTemplateRanking();
      expect(result.target).toBe("ranking");
      expect(result.recordCount).toBe(result.records.length);
    });

    it("CSV has expected headers", () => {
      const csv = exportTemplateRankingCsv();
      const firstLine = csv.split("\n")[0];
      expect(firstLine).toContain("templateId");
      expect(firstLine).toContain("healthScore");
      expect(firstLine).toContain("overallRankScore");
      expect(firstLine).toContain("trend");
    });
  });

  // 5. KPI export works
  describe("KPI export", () => {
    it("returns 25 KPIs without filters", () => {
      const result = exportStrategicKpis();
      expect(result.target).toBe("kpis");
      expect(result.recordCount).toBe(25);
    });

    it("CSV has expected headers", () => {
      const csv = exportStrategicKpisCsv();
      const firstLine = csv.split("\n")[0];
      expect(firstLine).toContain("kpiKey");
      expect(firstLine).toContain("category");
      expect(firstLine).toContain("status");
      expect(firstLine).toContain("value");
    });
  });

  // 6. Filters work correctly
  describe("filters", () => {
    it("marketplace: domain filter narrows results", () => {
      const all = exportMarketplaceCatalog();
      const filtered = exportMarketplaceCatalog({ domain: "reservation" });
      expect(filtered.recordCount).toBeLessThanOrEqual(all.recordCount);
      for (const item of filtered.records) {
        expect(item.domain).toBe("reservation");
      }
      expect(filtered.filters.domain).toBe("reservation");
    });

    it("ranking: domain filter works", () => {
      const filtered = exportTemplateRanking({ domain: "reservation" });
      for (const r of filtered.records) {
        expect(r.domain).toBe("reservation");
      }
    });

    it("KPI: category filter works", () => {
      const filtered = exportStrategicKpis({ category: "portfolio" });
      expect(filtered.recordCount).toBe(5);
      for (const kpi of filtered.records) {
        expect(kpi.category).toBe("portfolio");
      }
    });

    it("scenarios: scenarioType filter works", () => {
      const all = exportScenarioPlans();
      const filtered = exportScenarioPlans({ scenarioType: "expand_domain" });
      expect(filtered.recordCount).toBeLessThanOrEqual(all.recordCount);
      for (const s of filtered.records) {
        expect(s.type).toBe("expand_domain");
      }
    });

    it("recommendations: recommendationType filter works", () => {
      const filtered = exportTemplateRecommendations({ recommendationType: "best_derivation_parent" });
      for (const r of filtered.records) {
        expect(r.recommendationType).toBe("best_derivation_parent");
      }
    });

    it("releases: stage filter works", () => {
      const filtered = exportTemplateReleaseCatalog({ stage: "prod" });
      for (const entry of filtered.records) {
        expect(entry.stage).toBe("prod");
      }
    });

    it("portfolio: domain filter works", () => {
      const filtered = exportPortfolioStrategy({ domain: "reservation" });
      for (const s of filtered.records) {
        expect(s.domain).toBe("reservation");
      }
    });
  });

  // 7. Manifest output is correct
  describe("manifest", () => {
    it("lists all 7 export targets", () => {
      const manifest = buildExportManifest();
      expect(manifest.targets).toHaveLength(7);
      const targetNames = manifest.targets.map((t) => t.target);
      expect(targetNames).toContain("marketplace");
      expect(targetNames).toContain("releases");
      expect(targetNames).toContain("ranking");
      expect(targetNames).toContain("recommendations");
      expect(targetNames).toContain("portfolio");
      expect(targetNames).toContain("scenarios");
      expect(targetNames).toContain("kpis");
    });

    it("each target has formats and filters", () => {
      const manifest = buildExportManifest();
      for (const t of manifest.targets) {
        expect(t.formats.length).toBeGreaterThan(0);
        expect(t.supportedFilters.length).toBeGreaterThan(0);
        expect(t.label).toBeTruthy();
        expect(t.description).toBeTruthy();
      }
    });

    it("CSV targets include marketplace, releases, ranking, kpis", () => {
      const manifest = buildExportManifest();
      const csvTargets = manifest.targets
        .filter((t) => t.formats.includes("csv"))
        .map((t) => t.target);
      expect(csvTargets).toContain("marketplace");
      expect(csvTargets).toContain("releases");
      expect(csvTargets).toContain("ranking");
      expect(csvTargets).toContain("kpis");
    });
  });

  // 8. executeExport dispatcher works
  describe("executeExport", () => {
    it("dispatches marketplace JSON", () => {
      const result = executeExport({ target: "marketplace", format: "json" });
      expect(result.json).toBeDefined();
      expect(result.json!.target).toBe("marketplace");
    });

    it("dispatches marketplace CSV", () => {
      const result = executeExport({ target: "marketplace", format: "csv" });
      expect(result.csv).toBeDefined();
      expect(result.csv!.split("\n")[0]).toContain("templateId");
    });

    it("dispatches ranking CSV", () => {
      const result = executeExport({ target: "ranking", format: "csv" });
      expect(result.csv).toBeDefined();
    });

    it("dispatches KPI JSON with filters", () => {
      const result = executeExport({
        target: "kpis",
        format: "json",
        filters: { category: "portfolio" },
      });
      expect(result.json).toBeDefined();
      expect(result.json!.recordCount).toBe(5);
    });

    it("dispatches scenarios JSON", () => {
      const result = executeExport({ target: "scenarios", format: "json" });
      expect(result.json).toBeDefined();
      expect(result.json!.target).toBe("scenarios");
    });

    it("throws on unknown target", () => {
      expect(() => executeExport({ target: "unknown" as any, format: "json" })).toThrow();
    });
  });

  // 9. CSV helper
  describe("recordsToCsv", () => {
    it("produces correct CSV from records", () => {
      const csv = recordsToCsv(
        ["name", "score"],
        [{ name: "a", score: 1 }, { name: "b", score: 2 }],
        (r) => [r.name, r.score],
      );
      expect(csv).toBe("name,score\na,1\nb,2");
    });

    it("escapes commas in fields", () => {
      const csv = recordsToCsv(
        ["name"],
        [{ name: "a,b" }],
        (r) => [r.name],
      );
      expect(csv).toContain('"a,b"');
    });

    it("escapes quotes in fields", () => {
      const csv = recordsToCsv(
        ["name"],
        [{ name: 'a"b' }],
        (r) => [r.name],
      );
      expect(csv).toContain('"a""b"');
    });

    it("handles null values", () => {
      const csv = recordsToCsv(
        ["name"],
        [{ name: null as unknown as string }],
        (r) => [r.name],
      );
      const lines = csv.split("\n");
      expect(lines[1]).toBe("");
    });
  });

  // 10. Same inputs yield same export output
  describe("read-only / idempotent", () => {
    it("all targets produce consistent record counts", () => {
      const r1 = exportMarketplaceCatalog();
      const r2 = exportTemplateReleaseCatalog();
      const r3 = exportTemplateRanking();
      const r4 = exportTemplateRecommendations();
      const r5 = exportPortfolioStrategy();
      const r6 = exportScenarioPlans();
      const r7 = exportStrategicKpis();

      // Re-run and verify same counts
      expect(exportMarketplaceCatalog().recordCount).toBe(r1.recordCount);
      expect(exportTemplateReleaseCatalog().recordCount).toBe(r2.recordCount);
      expect(exportTemplateRanking().recordCount).toBe(r3.recordCount);
      expect(exportTemplateRecommendations().recordCount).toBe(r4.recordCount);
      expect(exportPortfolioStrategy().recordCount).toBe(r5.recordCount);
      expect(exportScenarioPlans().recordCount).toBe(r6.recordCount);
      expect(exportStrategicKpis().recordCount).toBe(r7.recordCount);
    });

    it("CSV line counts match JSON record counts", () => {
      const targets = [
        { json: exportMarketplaceCatalog(), csv: exportMarketplaceCatalogCsv() },
        { json: exportTemplateReleaseCatalog(), csv: exportTemplateReleaseCatalogCsv() },
        { json: exportTemplateRanking(), csv: exportTemplateRankingCsv() },
        { json: exportStrategicKpis(), csv: exportStrategicKpisCsv() },
      ];
      for (const { json, csv } of targets) {
        const csvLines = csv.split("\n");
        expect(csvLines.length).toBe(json.recordCount + 1); // header + data
      }
    });
  });
});
