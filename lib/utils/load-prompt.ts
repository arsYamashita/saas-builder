import { readFile } from "fs/promises";
import { join } from "path";

export async function loadPrompt(filename: string): Promise<string> {
  const filePath = join(process.cwd(), "prompts", filename);
  return readFile(filePath, "utf-8");
}
