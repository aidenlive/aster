import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverProject } from "../src/project/discover.js";
import { loadProject } from "../src/project/load.js";

function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), "aster-proj-"));
  mkdirSync(join(dir, "agent", "tools"), { recursive: true });
  mkdirSync(join(dir, "agent", "skills"), { recursive: true });
  mkdirSync(join(dir, "agent", "subagents", "helper", "tools"), { recursive: true });
  writeFileSync(join(dir, "agent", "instructions.md"), "You are the main agent.");
  writeFileSync(
    join(dir, "agent", "tools", "shout.mjs"),
    `export default {
      description: "Uppercase text",
      inputSchema: { safeParse: (v) => ({ success: true, data: v }) },
      execute: ({ text }) => ({ shouted: String(text).toUpperCase() }),
    };`,
  );
  writeFileSync(join(dir, "agent", "skills", "greet.md"), "---\ndescription: Greeting rules.\n---\nSay hi warmly.");
  writeFileSync(
    join(dir, "agent", "subagents", "helper", "instructions.md"),
    "---\ndescription: A helper.\nmodel: mock/echo\n---\nYou help.",
  );
  return dir;
}

describe("project discovery & loading", () => {
  it("discovers the conventional layout", async () => {
    const dir = scaffold();
    const manifest = await discoverProject(dir);
    expect(manifest.toolFiles.map((f) => f.name)).toEqual(["shout"]);
    expect(manifest.skillFiles.map((f) => f.name)).toEqual(["greet"]);
    expect(manifest.subagentDirs.map((s) => s.name)).toEqual(["helper"]);
  });

  it("loads modules and registries", async () => {
    const dir = scaffold();
    const project = await loadProject(dir);
    expect(project.instructions).toBe("You are the main agent.");
    expect(project.tools.get("shout").description).toBe("Uppercase text");
    expect(project.skills.get("greet")?.description).toBe("Greeting rules.");
    expect(project.subagents[0]).toMatchObject({ name: "helper", model: "mock/echo" });
  });

  it("fails clearly when instructions.md is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aster-empty-"));
    mkdirSync(join(dir, "agent"));
    await expect(discoverProject(dir)).rejects.toThrow(/instructions\.md/);
  });

  it("rejects invalid tool names", async () => {
    const dir = scaffold();
    writeFileSync(
      join(dir, "agent", "tools", "Bad-Name.mjs"),
      `export default { description: "x", inputSchema: { safeParse: (v)=>({success:true,data:v}) }, execute: () => ({}) };`,
    );
    await expect(loadProject(dir)).rejects.toThrow(/lower_snake_case/);
  });
});
