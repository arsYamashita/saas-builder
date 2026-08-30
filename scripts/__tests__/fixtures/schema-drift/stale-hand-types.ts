// SAFE (but stale) drift direction: real "widgets" table has a "color"
// column (see good-generated.ts) that this hand type doesn't declare.
// Not dangerous by itself (nothing reads a field that doesn't exist), but
// flagged as a warning so the type doesn't quietly fall behind the schema.
export type Widget = {
  id: string;
  name: string;
};
