/**
 * Extracts a readable summary from blueprint JSON columns.
 * Handles missing/malformed data gracefully.
 */

export interface BlueprintSummary {
  version: number;
  product: {
    name: string;
    problem: string;
    target: string;
    category: string;
  };
  entities: {
    name: string;
    description: string;
    fields: { name: string; type: string; required: boolean }[];
  }[];
  roles: { name: string; description: string }[];
  screens: { name: string; path: string; role_access: string[] }[];
  billingEnabled: boolean;
  affiliateEnabled: boolean;
}

export function extractBlueprintSummary(blueprint: {
  version: number;
  prd_json: unknown;
  entities_json: unknown;
  screens_json: unknown;
  roles_json: unknown;
  billing_json: unknown;
  affiliate_json: unknown;
}): BlueprintSummary {
  const prd = asObj(blueprint.prd_json);
  const ps = asObj(prd.product_summary ?? prd);

  return {
    version: blueprint.version,
    product: {
      name: str(ps.name ?? ps.product_name),
      problem: str(ps.problem ?? ps.problem_to_solve),
      target: str(ps.target ?? ps.target_users),
      category: str(ps.category ?? ps.service_category),
    },
    entities: asArr(blueprint.entities_json).map((e) => {
      const o = asObj(e);
      return {
        name: str(o.name ?? o.entity_name),
        description: str(o.description ?? o.purpose ?? ""),
        fields: asArr(o.main_fields ?? o.fields).map((f) => {
          const fo = asObj(f);
          return {
            name: str(fo.name ?? fo.field_name),
            type: str(fo.type ?? fo.data_type ?? "text"),
            required: !!(fo.required ?? false),
          };
        }),
      };
    }),
    roles: asArr(blueprint.roles_json).map((r) => {
      const o = asObj(r);
      return {
        name: str(o.name ?? o.role_name),
        description: str(o.description ?? o.permissions ?? ""),
      };
    }),
    screens: asArr(blueprint.screens_json).map((s) => {
      const o = asObj(s);
      return {
        name: str(o.name ?? o.screen_name),
        path: str(o.path ?? o.route ?? ""),
        role_access: asArr(o.role_access).map(str),
      };
    }),
    billingEnabled: toBool(blueprint.billing_json),
    affiliateEnabled: toBool(blueprint.affiliate_json),
  };
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const o = asObj(v);
  return !!(o.enabled ?? o.is_enabled ?? false);
}
