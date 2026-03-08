import { runCommand } from "@/lib/utils/run-command";

export type QualityStepResult = {
  success: boolean;
  combined: string;
};

export async function runInstall(projectDir: string): Promise<QualityStepResult> {
  const result = await runCommand("npm install", projectDir, 300_000);

  return {
    success: result.exitCode === 0,
    combined: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}
