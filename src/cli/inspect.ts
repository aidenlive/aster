import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { discoverProject } from "../project/discover.js";
import { loadProject } from "../project/load.js";
import { FileSessionStore } from "../runtime/store.js";
import { Session } from "../runtime/session.js";
import { buildTraces } from "../observability/trace.js";
import { messageText } from "../types.js";
import { printJson } from "./shared.js";

/**
 * `aster inspect <what>` — observability from the terminal.
 *   inspect project [dir]         what the framework discovered and loaded
 *   inspect sessions [dir]        all durable sessions
 *   inspect session <id> [dir]    transcript, state, pending approvals
 *   inspect trace <id> [dir]      spans per run: model calls, tool calls, durations
 * Every form supports --json.
 */
export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { json: { type: "boolean" }, events: { type: "boolean" } },
    allowPositionals: true,
  });
  const what = positionals[0];
  if (!what) {
    process.stderr.write("Usage: aster inspect <project|sessions|session <id>|trace <id>> [dir]\n");
    return 1;
  }

  if (what === "project") {
    const projectDir = resolve(positionals[1] ?? ".");
    const project = await loadProject(projectDir);
    const summary = {
      name: project.config.name ?? project.manifest.name,
      projectDir,
      model: project.config.model ?? "(default) anthropic/claude-sonnet-4-6",
      instructions: { path: project.manifest.instructionsPath, chars: project.instructions.length },
      tools: project.tools.list().map((t) => ({
        name: t.name,
        description: t.description,
        approval: t.approval ?? false,
        isolation: t.isolation ?? "none",
      })),
      skills: project.skills.list().map((s) => ({ name: s.name, description: s.description })),
      subagents: project.subagents.map((s) => ({ name: s.name, description: s.description, model: s.model })),
      workflows: project.workflows.map((w) => ({ name: w.name, description: w.description })),
      channels: project.channels.map((c) => ({ name: c.name, description: c.description })),
      schedules: project.schedules.map((s) => ({ name: s.name, cron: s.cron })),
    };
    if (values.json) printJson(summary);
    else {
      out(`agent "${summary.name}"  model=${summary.model}`);
      out(`instructions: ${summary.instructions.path} (${summary.instructions.chars} chars)`);
      section("tools", summary.tools.map((t) => `${t.name}${t.approval ? " [approval]" : ""}${t.isolation === "process" ? " [sandboxed]" : ""} — ${t.description}`));
      section("skills", summary.skills.map((s) => `${s.name} — ${s.description}`));
      section("subagents", summary.subagents.map((s) => `${s.name}${s.model ? ` (${s.model})` : ""} — ${s.description}`));
      section("workflows", summary.workflows.map((w) => `${w.name}${w.description ? ` — ${w.description}` : ""}`));
      section("channels", summary.channels.map((c) => `${c.name}${c.description ? ` — ${c.description}` : ""}`));
      section("schedules", summary.schedules.map((s) => `${s.name} — cron "${s.cron}"`));
    }
    return 0;
  }

  if (what === "sessions") {
    const projectDir = resolve(positionals[1] ?? ".");
    await discoverProject(projectDir);
    const store = new FileSessionStore(join(projectDir, ".aster"));
    const sessions = await store.listSessions();
    if (values.json) printJson(sessions);
    else if (sessions.length === 0) out("no sessions yet");
    else for (const session of sessions) out(`${session.id}  ${session.updatedAt}`);
    return 0;
  }

  if (what === "session" || what === "trace") {
    const id = positionals[1];
    if (!id) {
      process.stderr.write(`Usage: aster inspect ${what} <session-id> [dir]\n`);
      return 1;
    }
    const projectDir = resolve(positionals[2] ?? ".");
    const store = new FileSessionStore(join(projectDir, ".aster"));
    if (!(await store.sessionExists(id))) {
      process.stderr.write(`No session "${id}" under ${projectDir}/.aster/sessions\n`);
      return 1;
    }
    const session = await Session.open(id, store);
    const records = await session.events();

    if (what === "trace") {
      const traces = buildTraces(records);
      if (values.json) return printJson(traces), 0;
      for (const trace of traces) {
        out(`run ${trace.runId}  trigger=${trace.trigger}  status=${trace.status}  tokens=${trace.usage.inputTokens}in/${trace.usage.outputTokens}out`);
        for (const span of trace.spans) {
          out(`  ${span.kind === "model" ? "◆" : "▸"} ${span.name}  ${span.durationMs ?? "?"}ms  ${span.status}`);
        }
      }
      return 0;
    }

    if (values.json) {
      printJson({
        id: session.id,
        status: session.status,
        pendingApprovals: session.pendingApprovals,
        messages: session.messages,
        state: await session.readAllState(),
        ...(values.events ? { events: records } : {}),
      });
      return 0;
    }
    out(`session ${session.id}  status=${session.status}  events=${records.length}`);
    for (const approval of session.pendingApprovals) {
      out(`⏸ pending: ${approval.toolCallId}  ${approval.tool}(${JSON.stringify(approval.input)})`);
    }
    for (const message of session.messages) {
      const text = messageText(message);
      const calls = message.content.filter((p) => p.type === "tool_call");
      const results = message.content.filter((p) => p.type === "tool_result");
      if (text) out(`${message.role} › ${text}`);
      for (const call of calls) {
        if (call.type === "tool_call") out(`${message.role} › [call ${call.name} ${JSON.stringify(call.input)}]`);
      }
      for (const result of results) {
        if (result.type === "tool_result")
          out(`${message.role} › [result ${result.name}${result.isError ? " ERROR" : ""} ${truncate(JSON.stringify(result.output), 200)}]`);
      }
    }
    return 0;
  }

  process.stderr.write(`Unknown inspect target "${what}".\n`);
  return 1;
}

function out(line: string): void {
  process.stdout.write(line + "\n");
}

function section(title: string, lines: string[]): void {
  if (lines.length === 0) return;
  out(`\n${title}:`);
  for (const line of lines) out(`  - ${line}`);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}
