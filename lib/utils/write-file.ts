import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeTextFile(filePath: string, content: string) {
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, content, "utf-8");
}
