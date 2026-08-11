import { spawn } from "node:child_process";
import { AsterError, serializeError } from "../errors.js";
import type { Tool } from "../tools/define.js";

/**
 * Process isolation for tools marked `isolation: "process"`.
 *
 * The tool file is re-imported inside a fresh `node` child process with a
 * minimal environment (only variables allowlisted via ASTER_SANDBOX_ENV plus
 * PATH/HOME/NODE_OPTIONS-free basics). Input and output cross the boundary as
 * JSON on stdio. A crash, an OOM, or a runaway loop in the tool cannot take
 * down the agent runtime, and the child sees no API keys by default.
 */
export async function runToolInProcessSandbox(
  tool: Tool,
  input: unknown,
  options: { projectDir: string; sessionId: string; timeoutMs: number },
): Promise<unknown> {
  if (!tool.sourcePath) {
    throw new AsterError(
      "SANDBOX_FAILED",
      `Tool "${tool.name}" requested process isolation but has no source file (inline tools run in-process only)`,
    );
  }

  const allowlist = (process.env.ASTER_SANDBOX_ENV ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  const runner = `
    import { pathToFileURL } from "node:url";
    const file = process.env.ASTER_SANDBOX_TOOL_FILE;
    let payload = "";
    process.stdin.on("data", (c) => (payload += c));
    process.stdin.on("end", async () => {
      try {
        const mod = await import(pathToFileURL(file).href);
        const tool = mod.default;
        const { input, sessionId, projectDir } = JSON.parse(payload);
        const ctx = {
          sessionId,
          projectDir,
          signal: new AbortController().signal,
          log: () => {},
          state: {
            get: async () => undefined,
            set: async () => { throw new Error("Sandboxed tools cannot write session state"); },
          },
        };
        const output = await tool.execute(input, ctx);
        process.stdout.write(JSON.stringify({ ok: true, output: output === undefined ? null : output }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ ok: false, error: { message: String(error && error.message || error) } }));
      }
    });
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", runner], {
      env: { ...env, ASTER_SANDBOX_TOOL_FILE: tool.sourcePath! },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new AsterError("SANDBOX_FAILED", `Tool "${tool.name}" timed out after ${options.timeoutMs}ms in sandbox`),
      );
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new AsterError("SANDBOX_FAILED", `Sandbox spawn failed: ${serializeError(error).message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!stdout) {
        reject(
          new AsterError("SANDBOX_FAILED", `Sandboxed tool "${tool.name}" exited (${code}) without output`, {
            stderr: stderr.slice(0, 1000),
          }),
        );
        return;
      }
      try {
        const result = JSON.parse(stdout) as { ok: boolean; output?: unknown; error?: { message: string } };
        if (result.ok) resolve(result.output);
        else
          reject(
            new AsterError("TOOL_EXECUTION_FAILED", `Tool "${tool.name}" failed in sandbox: ${result.error?.message}`),
          );
      } catch {
        reject(new AsterError("SANDBOX_FAILED", `Sandboxed tool "${tool.name}" produced invalid output`));
      }
    });

    child.stdin.write(
      JSON.stringify({ input, sessionId: options.sessionId, projectDir: options.projectDir }),
    );
    child.stdin.end();
  });
}
