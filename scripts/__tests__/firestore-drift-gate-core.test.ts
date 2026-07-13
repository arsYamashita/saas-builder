import { describe, it, expect } from "vitest";
import {
  findUndeclaredCollectionReferences,
  findDeprecatedFieldReferences,
  runFirestoreDriftGate,
  hasBlockingFindings,
  type SourceFile,
  type FirestoreSchemaDeclaration,
} from "../firestore-drift-gate-core";

const schema: FirestoreSchemaDeclaration = {
  collections: {
    templates: ["id", "name"],
    users: ["id", "email"],
  },
  deprecatedFields: {
    proposed_content: "Use suggested_content instead — see [[daycare_dashboard_type_schema_drift]].",
  },
};

describe("firestore-drift-gate-core: undeclared collection references", () => {
  it("does not flag a declared collection reference", () => {
    const files: SourceFile[] = [
      { path: "app/api/templates/route.ts", content: 'db.collection("templates").get();' },
    ];
    expect(findUndeclaredCollectionReferences(files, schema)).toEqual([]);
  });

  it("flags a near-miss undeclared collection name (the recurring aria_app_collection_drift shape)", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/customTemplates/route.ts",
        content: 'const snap = await db.collection("customTemplates").get();',
      },
    ];
    const findings = findUndeclaredCollectionReferences(files, schema);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "undeclared_collection_reference",
      severity: "error",
      file: "app/api/customTemplates/route.ts",
      line: 1,
    });
  });

  it("does not flag a dynamic (non-string-literal) .collection() call — avoids false positives", () => {
    const files: SourceFile[] = [
      { path: "lib/db.ts", content: "db.collection(collectionNameVar).get();" },
    ];
    expect(findUndeclaredCollectionReferences(files, schema)).toEqual([]);
  });

  it("reports the correct 1-indexed line number for a multi-line file", () => {
    const files: SourceFile[] = [
      {
        path: "lib/db.ts",
        content: 'const a = 1;\nconst b = 2;\ndb.collection("universalTemplates").get();\n',
      },
    ];
    const findings = findUndeclaredCollectionReferences(files, schema);
    expect(findings[0].line).toBe(3);
  });
});

describe("firestore-drift-gate-core: deprecated field references", () => {
  it("flags member-access reference to a deprecated field", () => {
    const files: SourceFile[] = [
      { path: "app/review.tsx", content: "const text = suggestion.proposed_content;" },
    ];
    const findings = findDeprecatedFieldReferences(files, schema);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("deprecated_field_reference");
  });

  it("flags bracket-access reference to a deprecated field", () => {
    const files: SourceFile[] = [
      { path: "app/review.tsx", content: 'const text = suggestion["proposed_content"];' },
    ];
    expect(findDeprecatedFieldReferences(files, schema)).toHaveLength(1);
  });

  it("does not flag a comment-only mention of a deprecated field", () => {
    const files: SourceFile[] = [
      { path: "app/review.tsx", content: "// suggestion.proposed_content is deprecated, do not use" },
    ];
    expect(findDeprecatedFieldReferences(files, schema)).toEqual([]);
  });

  it("does not flag an unrelated field with a similar name", () => {
    const files: SourceFile[] = [
      { path: "app/review.tsx", content: "const text = suggestion.suggested_content;" },
    ];
    expect(findDeprecatedFieldReferences(files, schema)).toEqual([]);
  });

  it("returns no findings when the schema declares no deprecatedFields", () => {
    const schemaNoDeprecated: FirestoreSchemaDeclaration = { collections: { templates: ["id"] } };
    const files: SourceFile[] = [
      { path: "app/review.tsx", content: "const text = suggestion.proposed_content;" },
    ];
    expect(findDeprecatedFieldReferences(files, schemaNoDeprecated)).toEqual([]);
  });
});

describe("firestore-drift-gate-core: runFirestoreDriftGate / hasBlockingFindings", () => {
  it("combines both checks and reports all findings as blocking", () => {
    const files: SourceFile[] = [
      {
        path: "app/mixed.ts",
        content: 'db.collection("customTemplates").get();\nconst x = suggestion.proposed_content;',
      },
    ];
    const findings = runFirestoreDriftGate(files, schema);
    expect(findings).toHaveLength(2);
    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it("reports 0 findings (and non-blocking) for fully clean source", () => {
    const files: SourceFile[] = [
      { path: "app/clean.ts", content: 'db.collection("templates").get();\nconst x = doc.id;' },
    ];
    const findings = runFirestoreDriftGate(files, schema);
    expect(findings).toEqual([]);
    expect(hasBlockingFindings(findings)).toBe(false);
  });
});
