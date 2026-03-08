import { readPrompt } from "@/lib/utils/read-prompt";

export async function buildPromptWithRules(
  prefixFilename: string,
  mainPromptFilename: string,
  replacements: Record<string, string>
) {
  const prefix = await readPrompt(prefixFilename);
  let main = await readPrompt(mainPromptFilename);

  for (const [key, value] of Object.entries(replacements)) {
    main = main.replaceAll(`{{${key}}}`, value);
  }

  return `${prefix}\n\n${main}`;
}
