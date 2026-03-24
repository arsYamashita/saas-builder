import fs from "node:fs/promises";
import path from "node:path";

export async function readPrompt(filename: string): Promise<string> {
  // Guard against path traversal
  if (filename.includes("..") || path.isAbsolute(filename)) {
    throw new Error("Invalid prompt filename");
  }

  const filePath = path.join(process.cwd(), "prompts", filename);
  return fs.readFile(filePath, "utf-8");
}
