import { generateWithClaude } from "@/lib/ai/claude-request";

type ClaudeImplementationInput = {
  blueprintJson: string;
  promptTemplate: string;
};

export async function runClaudeImplementation({
  blueprintJson,
  promptTemplate,
}: ClaudeImplementationInput) {
  const prompt = promptTemplate.replace(
    "{{blueprint_normalized_json}}",
    blueprintJson
  );

  const result = await generateWithClaude({
    prompt,
    system:
      "You are a senior SaaS architect and tech lead. Return structured implementation guidance.",
  });

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    outputText: result.text,
  };
}
