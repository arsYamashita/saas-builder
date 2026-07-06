import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadWatcherConfigFromYaml } from "./config-loader";

const here = dirname(fileURLToPath(import.meta.url));
const sourcesYamlPath = join(here, "sources.yaml");

describe("loadWatcherConfigFromYaml", () => {
  it("parses the shipped sources.yaml into the 3 MVP monitored sources", () => {
    const yamlText = readFileSync(sourcesYamlPath, "utf8");
    const config = loadWatcherConfigFromYaml(yamlText);

    expect(config.sources).toHaveLength(3);
    const ids = config.sources.map((s) => s.id).sort();
    expect(ids).toEqual(["jnet21-subsidy-info", "mhlw-subsidy-notice", "mirasapo-plus-subsidy-search"].sort());

    for (const source of config.sources) {
      expect(source.url.startsWith("https://")).toBe(true);
      expect(source.selector.length).toBeGreaterThan(0);
      expect(source.checkIntervalMinutes).toBeGreaterThan(0);
      expect(source.category).toBe("subsidy");
    }
  });

  it("rejects a config with an invalid URL", () => {
    const bad = `version: 1\nsources:\n  - id: x\n    name: x\n    agency: x\n    url: not-a-url\n    selector: "#a"\n`;
    expect(() => loadWatcherConfigFromYaml(bad)).toThrow();
  });

  it("rejects a config with zero sources", () => {
    const bad = `version: 1\nsources: []\n`;
    expect(() => loadWatcherConfigFromYaml(bad)).toThrow();
  });

  it("rejects an unsupported config version", () => {
    const bad = `version: 2\nsources:\n  - id: x\n    name: x\n    agency: x\n    url: "https://example.test"\n    selector: "#a"\n`;
    expect(() => loadWatcherConfigFromYaml(bad)).toThrow();
  });
});
