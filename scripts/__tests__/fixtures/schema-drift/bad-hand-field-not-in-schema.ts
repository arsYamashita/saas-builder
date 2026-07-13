// DANGEROUS drift direction: `discontinued_flag` does not exist on the
// real "widgets" table (see good-generated.ts) — reading
// `widget.discontinued_flag` at runtime silently returns `undefined`,
// exactly [[daycare_dashboard_type_schema_drift]]'s failure mode.
export type Widget = {
  id: string;
  name: string;
  color: string | null;
  discontinued_flag: boolean;
};
