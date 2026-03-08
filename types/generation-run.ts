export type GenerationStepStatus = "pending" | "running" | "completed" | "failed";

export type GenerationStep = {
  key:
    | "blueprint"
    | "implementation"
    | "schema"
    | "api_design"
    | "split_files"
    | "export_files";
  label: string;
  status: GenerationStepStatus;
};

export type GenerationRunRecord = {
  id: string;
  project_id: string;
  template_key: string;
  status: "running" | "completed" | "failed";
  current_step?: string | null;
  steps_json: GenerationStep[];
  error_message?: string | null;
  started_at: string;
  finished_at?: string | null;
};
