import { z } from "zod";

export const blueprintFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  description: z.string().optional(),
});

export const blueprintEntitySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  main_fields: z.array(blueprintFieldSchema).min(1),
});

export const blueprintScreenSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  role_access: z.array(z.string()).min(1),
});

export const blueprintRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const blueprintPermissionSchema = z.object({
  role: z.string().min(1),
  allowed_actions: z.array(z.string()).min(1),
});

export const blueprintBillingSchema = z.object({
  enabled: z.boolean(),
  model: z.enum(["subscription", "one_time", "hybrid", "none"]),
  products: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const blueprintAffiliateSchema = z.object({
  enabled: z.boolean(),
  commission_type: z.enum(["fixed", "percentage"]).optional(),
  commission_value: z.number().optional(),
  notes: z.string().optional(),
});

export const blueprintSchema = z.object({
  product_summary: z.object({
    name: z.string().optional(),
    problem: z.string().optional(),
    target: z.string().optional(),
    category: z.string().optional(),
  }),

  entities: z.array(blueprintEntitySchema).min(1),
  screens: z.array(blueprintScreenSchema).min(1),
  roles: z.array(blueprintRoleSchema).min(1),
  permissions: z.array(blueprintPermissionSchema).min(1),

  billing: blueprintBillingSchema,
  affiliate: blueprintAffiliateSchema,

  events: z.array(z.string()),
  kpis: z.array(z.string()),
  assumptions: z.array(z.string()),
  mvp_scope: z.array(z.string()).min(1),
  future_scope: z.array(z.string()),
});

export type BlueprintSchemaInput = z.infer<typeof blueprintSchema>;
