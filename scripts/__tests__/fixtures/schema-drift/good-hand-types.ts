// Hand-written types matching the "widgets" table exactly (see
// good-generated.ts + good-mapping.json). "gadgets" is deliberately left
// unmapped to exercise the "unmapped_schema_table" info finding.
export type Widget = {
  id: string;
  name: string;
  color: string | null;
};
