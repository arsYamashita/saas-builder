import { generateWithClaude } from "@/lib/ai/claude-request";

type ClaudeApiInput = {
  schemaSql: string;
  blueprintJson: string;
  promptTemplate: string;
};

export async function runClaudeApi({
  schemaSql,
  blueprintJson,
  promptTemplate,
}: ClaudeApiInput) {
  const prompt = promptTemplate
    .replace("{{schema_sql}}", schemaSql)
    .replace("{{blueprint_json}}", blueprintJson);

  const result = await generateWithClaude({
    prompt,
    system:
      "You are a Next.js API route and SaaS backend expert. Return production-grade API design.",
  });

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    outputText: result.text,
  };
}
