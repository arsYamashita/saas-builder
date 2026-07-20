import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  findBalancedKeyBlock,
  splitTopLevelTableBlocks,
  extractFieldNames,
  parseGeneratedSchemaColumns,
  parseHandWrittenTypeColumns,
  diffSchemaAndHandTypes,
  hasBlockingFindings,
} from "../schema-drift-gate-core";

const FIXTURES_DIR = path.join(__dirname, "fixtures", "schema-drift");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

describe("schema-drift-gate-core: generated types parsing", () => {
  const generated = loadFixture("good-generated.ts");

  it("extracts a balanced brace block for a top-level key", () => {
    const block = findBalancedKeyBlock(generated, "public");
    expect(block).not.toBeNull();
    expect(block!.body).toContain("Tables");
  });

  it("returns null for a key that isn't present", () => {
    expect(findBalancedKeyBlock(generated, "private")).toBeNull();
  });

  it("splits Tables body into direct-child table blocks only (no nested Row/Insert leakage)", () => {
    const publicBlock = findBalancedKeyBlock(generated, "public")!;
    const tablesBlock = findBalancedKeyBlock(publicBlock.body, "Tables")!;
    const tables = splitTopLevelTableBlocks(tablesBlock.body);
    expect(Array.from(tables.keys()).sort()).toEqual(["gadgets", "widgets"]);
  });

  it("extracts field names from a Row object literal body", () => {
    const publicBlock = findBalancedKeyBlock(generated, "public")!;
    const tablesBlock = findBalancedKeyBlock(publicBlock.body, "Tables")!;
    const tables = splitTopLevelTableBlocks(tablesBlock.body);
    const rowBlock = findBalancedKeyBlock(tables.get("widgets")!, "Row")!;
    expect(extractFieldNames(rowBlock.body)).toEqual(new Set(["id", "name", "color"]));
  });

  it("parses a full generated-types file into { table -> Set<column> }", () => {
    const schema = parseGeneratedSchemaColumns(generated);
    expect(Array.from(schema.keys()).sort()).toEqual(["gadgets", "widgets"]);
    expect(schema.get("widgets")).toEqual(new Set(["id", "name", "color"]));
    expect(schema.get("gadgets")).toEqual(new Set(["id", "widget_id"]));
  });

  it("throws (does not silently return empty) on a file with no public.Tables block", () => {
    expect(() => parseGeneratedSchemaColumns("export const x = 1;")).toThrow(/public/);
  });
});

describe("schema-drift-gate-core: hand-written type parsing", () => {
  it("parses `export type Name = { ... };` declarations into { Name -> Set<column> }", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("good-hand-types.ts"));
    expect(Array.from(hand.keys())).toEqual(["Widget"]);
    expect(hand.get("Widget")).toEqual(new Set(["id", "name", "color"]));
  });

  it("does not lose track of balance with an inline nested object literal field", () => {
    const src = `export type Weird = {\n  id: string;\n  meta: { nested: string } | null;\n  name: string;\n};\n`;
    const hand = parseHandWrittenTypeColumns(src);
    // Top-level fields only: "meta" itself, not "nested" (which lives one
    // level deeper, inside the inline object type).
    expect(hand.get("Weird")).toEqual(new Set(["id", "meta", "name"]));
  });
});

describe("schema-drift-gate-core: diff", () => {
  const schema = parseGeneratedSchemaColumns(loadFixture("good-generated.ts"));

  it("reports zero findings when hand types exactly match the mapped table columns", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("good-hand-types.ts"));
    const mapping = { Widget: "widgets" };
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    const blocking = findings.filter((f) => f.severity !== "info");
    expect(blocking).toEqual([]);
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it("flags an unmapped real table as info-severity only (non-blocking)", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("good-hand-types.ts"));
    const mapping = { Widget: "widgets" }; // "gadgets" intentionally unmapped
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    const unmapped = findings.filter((f) => f.rule === "unmapped_schema_table");
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].table).toBe("gadgets");
    expect(unmapped[0].severity).toBe("info");
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it("flags THE DANGEROUS DIRECTION — a hand field that doesn't exist in the real schema — as a blocking error", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("bad-hand-field-not-in-schema.ts"));
    const mapping = { Widget: "widgets" };
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    const dangerous = findings.filter((f) => f.rule === "hand_field_missing_from_schema");
    expect(dangerous).toHaveLength(1);
    expect(dangerous[0]).toMatchObject({
      severity: "error",
      table: "widgets",
      handType: "Widget",
      field: "discontinued_flag",
    });
    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it("flags a stale hand type (schema has a column the hand type omits) as warning-severity, non-blocking", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("stale-hand-types.ts"));
    const mapping = { Widget: "widgets" };
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    const stale = findings.filter((f) => f.rule === "schema_field_missing_from_hand");
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ severity: "warning", field: "color" });
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it("flags a mapping entry pointing at a table that doesn't exist in the schema (renamed/dropped table)", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("good-hand-types.ts"));
    const mapping = { Widget: "widgetz" }; // typo/renamed table
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    expect(findings.some((f) => f.rule === "mapped_table_not_in_schema" && f.severity === "error")).toBe(
      true
    );
    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it("flags a mapping entry naming a hand type that isn't actually declared in the hand types file", () => {
    const hand = parseHandWrittenTypeColumns(loadFixture("good-hand-types.ts"));
    const mapping = { Widget: "widgets", Ghost: "gadgets" };
    const findings = diffSchemaAndHandTypes(schema, hand, mapping);
    expect(
      findings.some((f) => f.rule === "mapped_type_not_in_hand_file" && f.severity === "error" && f.handType === "Ghost")
    ).toBe(true);
    expect(hasBlockingFindings(findings)).toBe(true);
  });
});
