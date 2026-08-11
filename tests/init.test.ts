import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run as init } from "../src/cli/init.js";
import { loadProjectEnv } from "../src/cli/shared.js";

const tmp = () => mkdtempSync(join(tmpdir(), "aster-init-"));

describe("aster init (non-interactive)", () => {
  it("scaffolds the standard preset with a .env for the chosen provider", async () => {
    const dir = tmp();
    expect(await init([dir, "--yes", "--provider", "openai"])).toBe(0);
    expect(existsSync(join(dir, "agent", "instructions.md"))).toBe(true);
    expect(existsSync(join(dir, "agent", "tools", "save_note.ts"))).toBe(true);
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("OPENAI_API_KEY=");
    expect(readFileSync(join(dir, "agent", "agent.ts"), "utf8")).toContain("openai/gpt-5");
    expect(existsSync(join(dir, ".gitignore"))).toBe(true);
    expect(existsSync(join(dir, "gitignore"))).toBe(false);
  });

  it("minimal preset trims to instructions + one tool", async () => {
    const dir = tmp();
    await init([dir, "--yes", "--preset", "minimal", "--provider", "offline"]);
    expect(existsSync(join(dir, "agent", "tools", "get_time.ts"))).toBe(true);
    expect(existsSync(join(dir, "agent", "tools", "save_note.ts"))).toBe(false);
    expect(existsSync(join(dir, "agent", "skills"))).toBe(false);
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("ASTER_OFFLINE=1");
  });

  it("team preset adds a subagent and a durable workflow", async () => {
    const dir = tmp();
    await init([dir, "--yes", "--preset", "team"]);
    expect(existsSync(join(dir, "agent", "subagents", "researcher", "instructions.md"))).toBe(true);
    expect(existsSync(join(dir, "agent", "workflows", "daily_summary.ts"))).toBe(true);
  });

  it("compatible provider wires a custom endpoint into agent.ts and .env", async () => {
    const dir = tmp();
    await init([dir, "--yes", "--provider", "compatible", "--base-url", "http://gw:9000", "--model", "gw/llama3.3"]);
    const config = readFileSync(join(dir, "agent", "agent.ts"), "utf8");
    expect(config).toContain('baseUrl: process.env.MODEL_BASE_URL ?? "http://gw:9000"');
    expect(config).toContain('"gw/llama3.3"');
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("MODEL_BASE_URL=http://gw:9000");
  });

  it("rejects invalid --provider, --preset, and --model", async () => {
    expect(await init([tmp(), "--yes", "--provider", "nope"])).toBe(1);
    expect(await init([tmp(), "--yes", "--preset", "nope"])).toBe(1);
    expect(await init([tmp(), "--yes", "--model", "noslash"])).toBe(1);
  });

  it("refuses to overwrite an existing agent/ without --force", async () => {
    const dir = tmp();
    await init([dir, "--yes"]);
    expect(await init([dir, "--yes"])).toBe(1);
    expect(await init([dir, "--yes", "--force"])).toBe(0);
  });
});

describe("loadProjectEnv", () => {
  it("loads KEY=value, strips quotes, and never overrides existing env", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".env"), `# comment\nA_TEST_VAR=hello\nB_TEST_VAR="quoted value"\nPATH=/should/not/win\n`);
    const originalPath = process.env.PATH;
    loadProjectEnv(dir);
    expect(process.env.A_TEST_VAR).toBe("hello");
    expect(process.env.B_TEST_VAR).toBe("quoted value");
    expect(process.env.PATH).toBe(originalPath);
    delete process.env.A_TEST_VAR;
    delete process.env.B_TEST_VAR;
  });

  it("is a no-op without a .env file", () => {
    expect(() => loadProjectEnv(tmp())).not.toThrow();
  });
});
