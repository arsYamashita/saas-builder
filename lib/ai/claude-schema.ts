import { generateWithClaude } from "@/lib/ai/claude-request";

type ClaudeSchemaInput = {
  blueprintJson: string;
  promptTemplate: string;
};

export async function runClaudeSchema({
  blueprintJson,
  promptTemplate,
}: ClaudeSchemaInput) {
  const prompt = promptTemplate.replace(
    "{{blueprint_json}}",
    blueprintJson
  );

  const result = await generateWithClaude({
    prompt,
    system:
      "You are a PostgreSQL and SaaS schema expert. Return production-grade schema output.",
  });

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    outputText: result.text,
  };
}
