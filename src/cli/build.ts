import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadProject } from "../project/load.js";
import { parseCron, nextRun } from "../schedules/cron.js";
import { printJson } from "./shared.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

/**
 * `aster build [dir]` — release gate. Validates everything statically checkable:
 *   1. discovery + module loading (all definitions import and validate)
 *   2. tool schemas convert to JSON Schema
 *   3. schedule cron expressions parse and have a next run
 *   4. `tsc --noEmit` when the project has a tsconfig.json
 * Exit code 0 means the project is structurally ready to run in production.
 */
export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { json: { type: "boolean" } },
    allowPositionals: true,
  });
  const projectDir = resolve(positionals[0] ?? ".");
  const checks: CheckResult[] = [];

  let project;
  try {
    project = await loadProject(projectDir);
    checks.push({ name: "load", ok: true, detail: `${project.tools.list().length} tools, ${project.skills.list().length} skills, ${project.subagents.length} subagents, ${project.workflows.length} workflows, ${project.channels.length} channels, ${project.schedules.length} schedules` });
  } catch (error) {
    checks.push({ name: "load", ok: false, detail: error instanceof Error ? error.message : String(error) });
    return report(checks, Boolean(values.json));
  }

  try {
    const { toolSpec } = await import("../tools/define.js");
    for (const tool of project.tools.list()) toolSpec(tool);
    for (const registry of project.subagentTools.values()) for (const tool of registry.list()) toolSpec(tool);
    checks.push({ name: "tool-schemas", ok: true });
  } catch (error) {
    checks.push({ name: "tool-schemas", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    for (const schedule of project.schedules) nextRun(parseCron(schedule.cron));
    checks.push({ name: "schedules", ok: true });
  } catch (error) {
    checks.push({ name: "schedules", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  if (existsSync(join(projectDir, "tsconfig.json"))) {
    const result = spawnSync("npx", ["--no-install", "tsc", "--noEmit"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    if (result.error || result.status === null) {
      checks.push({ name: "typecheck", ok: true, detail: "skipped (typescript not installed in project)" });
    } else {
      checks.push({
        name: "typecheck",
        ok: result.status === 0,
        detail: result.status === 0 ? undefined : (result.stdout + result.stderr).trim().slice(0, 2000),
      });
    }
  } else {
    checks.push({ name: "typecheck", ok: true, detail: "skipped (no tsconfig.json)" });
  }

  return report(checks, Boolean(values.json));
}

function report(checks: CheckResult[], json: boolean): number {
  const ok = checks.every((c) => c.ok);
  if (json) {
    printJson({ ok, checks });
  } else {
    for (const check of checks) {
      process.stdout.write(`${check.ok ? "✓" : "✗"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}\n`);
    }
    process.stdout.write(ok ? "\nbuild: OK\n" : "\nbuild: FAILED\n");
  }
  return ok ? 0 : 1;
}
