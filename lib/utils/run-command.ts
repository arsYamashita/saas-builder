import { exec } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export async function runCommand(
  command: string,
  cwd: string,
  timeoutMs = 120_000
): Promise<CommandResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, CI: "true" },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const exitCode =
          error && "code" in error ? (error.code as number) ?? 1 : 0;

        resolve({
          stdout: stdout?.toString().slice(0, 50_000) ?? "",
          stderr: stderr?.toString().slice(0, 50_000) ?? "",
          exitCode,
          durationMs,
        });
      }
    );

    child.on("error", () => {
      resolve({
        stdout: "",
        stderr: "Process spawn error",
        exitCode: 1,
        durationMs: Date.now() - start,
      });
    });
  });
}
