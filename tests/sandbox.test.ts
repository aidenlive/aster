import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runToolInProcessSandbox } from "../src/runtime/sandbox.js";
import type { Tool } from "../src/tools/define.js";

function writeToolFile(code: string): string {
  const dir = mkdtempSync(join(tmpdir(), "aster-sbx-"));
  const path = join(dir, "tool.mjs");
  writeFileSync(path, code);
  return path;
}

describe("process sandbox", () => {
  it("executes a tool in a child process", async () => {
    const sourcePath = writeToolFile(
      `export default { execute: ({ n }) => ({ doubled: n * 2, sawSecret: Boolean(process.env.SECRET_KEY) }) };`,
    );
    process.env.SECRET_KEY = "shh";
    const tool: Tool = {
      name: "double",
      description: "d",
      inputSchema: z.object({ n: z.number() }),
      isolation: "process",
      sourcePath,
      execute: () => ({}),
    };
    const output = (await runToolInProcessSandbox(tool, { n: 21 }, {
      projectDir: "/tmp",
      sessionId: "s",
      timeoutMs: 10_000,
    })) as { doubled: number; sawSecret: boolean };
    expect(output.doubled).toBe(42);
    expect(output.sawSecret).toBe(false); // env is not inherited
    delete process.env.SECRET_KEY;
  });

  it("surfaces tool errors without crashing the runtime", async () => {
    const sourcePath = writeToolFile(`export default { execute: () => { throw new Error("boom"); } };`);
    const tool: Tool = {
      name: "boom",
      description: "d",
      inputSchema: z.object({}),
      isolation: "process",
      sourcePath,
      execute: () => ({}),
    };
    await expect(
      runToolInProcessSandbox(tool, {}, { projectDir: "/tmp", sessionId: "s", timeoutMs: 10_000 }),
    ).rejects.toThrow(/boom/);
  });

  it("kills runaway tools at the timeout", async () => {
    const sourcePath = writeToolFile(
      `export default { execute: () => new Promise(() => { setInterval(() => {}, 1000); }) };`,
    );
    const tool: Tool = {
      name: "hang",
      description: "d",
      inputSchema: z.object({}),
      isolation: "process",
      sourcePath,
      execute: () => ({}),
    };
    await expect(
      runToolInProcessSandbox(tool, {}, { projectDir: "/tmp", sessionId: "s", timeoutMs: 800 }),
    ).rejects.toThrow(/timed out/);
  }, 10_000);
});
