import { generateWithGemini } from "@/lib/ai/gemini-request";

type GeminiIntakeInput = {
  userInput: string;
  promptTemplate: string;
};

export async function runGeminiIntake({
  userInput,
  promptTemplate,
}: GeminiIntakeInput) {
  const prompt = promptTemplate.replace("{{user_input}}", userInput);

  const result = await generateWithGemini({ prompt });

  return {
    rawPrompt: prompt,
    rawResponse: result.raw,
    outputText: result.text,
  };
}
