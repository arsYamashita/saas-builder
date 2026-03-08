import fs from "node:fs/promises";
import path from "node:path";

export async function readPrompt(filename: string): Promise<string> {
  const filePath = path.join(process.cwd(), "prompts", filename);
  return fs.readFile(filePath, "utf-8");
}
