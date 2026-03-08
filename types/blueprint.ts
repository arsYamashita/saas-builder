export type BlueprintField = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
};

export type BlueprintEntity = {
  name: string;
  description: string;
  main_fields: BlueprintField[];
};

export type BlueprintScreen = {
  name: string;
  purpose: string;
  role_access: string[];
};

export type BlueprintRole = {
  name: string;
  description?: string;
};

export type BlueprintPermission = {
  role: string;
  allowed_actions: string[];
};

export type BlueprintBilling = {
  enabled: boolean;
  model: "subscription" | "one_time" | "hybrid" | "none";
  products?: string[];
  notes?: string;
};

export type BlueprintAffiliate = {
  enabled: boolean;
  commission_type?: "fixed" | "percentage";
  commission_value?: number;
  notes?: string;
};

export type BlueprintProductSummary = {
  name?: string;
  problem?: string;
  target?: string;
  category?: string;
};

export type Blueprint = {
  product_summary: BlueprintProductSummary;
  entities: BlueprintEntity[];
  screens: BlueprintScreen[];
  roles: BlueprintRole[];
  permissions: BlueprintPermission[];
  billing: BlueprintBilling;
  affiliate: BlueprintAffiliate;
  events: string[];
  kpis: string[];
  assumptions: string[];
  mvp_scope: string[];
  future_scope: string[];
};
