export type GeneratedFileCategory =
  | "schema"
  | "migration"
  | "api_route"
  | "api_schema"
  | "page"
  | "component"
  | "layout"
  | "type"
  | "test"
  | "config"
  | "prompt_output";

export type GeneratedFileRecord = {
  id: string;
  project_id: string;
  blueprint_id?: string | null;
  source_run_id?: string | null;
  file_category: GeneratedFileCategory;
  file_path: string;
  language: string;
  status: "generated" | "approved" | "archived";
  title?: string | null;
  description?: string | null;
  content_text: string;
  content_json?: unknown;
  version: number;
  source: "claude" | "lovable" | "manual";
  created_at: string;
  updated_at: string;
};
