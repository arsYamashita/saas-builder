export type ImplementationRunType =
  | "implementation_plan"
  | "schema_sql"
  | "api_design";

export type ImplementationRunRecord = {
  id: string;
  project_id: string;
  blueprint_id: string;
  run_type: ImplementationRunType;
  version: number;
  status: "completed" | "failed";
  prompt_text?: string | null;
  output_text: string;
  output_json?: unknown;
  source: "claude";
  created_at: string;
};
