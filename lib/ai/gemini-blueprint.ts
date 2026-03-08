import { generateWithGemini } from "@/lib/ai/gemini-request";
import { blueprintSchema } from "@/lib/validation/blueprint";

type GeminiBlueprintInput = {
  mvpSpec: string;
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

export async function runGeminiBlueprint({
  mvpSpec,
  promptTemplate,
}: GeminiBlueprintInput) {
  const prompt = promptTemplate.replace("{{mvp_spec}}", mvpSpec);

  const result = await generateWithGemini({ prompt });
  const jsonText = extractJson(result.text);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse Gemini blueprint JSON: ${jsonText}`);
  }

  const validated = blueprintSchema.safeParse(parsedJson);

  if (!validated.success) {
    throw new Error(
      `Blueprint validation failed: ${JSON.stringify(validated.error.issues)}`
    );
  }

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    blueprint: validated.data,
  };
}
