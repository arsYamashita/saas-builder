import { generateWithClaude } from "@/lib/ai/claude-request";

type ClaudeFileSplitterInput = {
  implementationOutput: string;
  promptTemplate: string;
};

function extractJson(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  return trimmed;
}

export async function runClaudeFileSplitter({
  implementationOutput,
  promptTemplate,
}: ClaudeFileSplitterInput) {
  const prompt = promptTemplate.replace(
    "{{implementation_output}}",
    implementationOutput
  );

  const result = await generateWithClaude({
    prompt,
    system:
      "You convert SaaS implementation outputs into saveable file objects. Return JSON only.",
  });

  const jsonText = extractJson(result.text);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse file splitter JSON: ${jsonText}`);
  }

  if (!Array.isArray(parsedJson)) {
    throw new Error("File splitter output is not an array");
  }

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    files: parsedJson as Array<{
      file_category: string;
      file_path: string;
      language: string;
      title?: string;
      description?: string;
      content_text: string;
    }>,
  };
}
