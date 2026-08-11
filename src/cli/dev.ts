import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { Agent } from "../agent/agent.js";
import { loadProject, type LoadedProject } from "../project/load.js";
import { discoverProject, projectMtime } from "../project/discover.js";
import { createHttpChannelServer } from "../channels/http.js";
import { Scheduler } from "../schedules/scheduler.js";
import { sessionId as newSessionId } from "../ids.js";
import { serializeError } from "../errors.js";
import { agentHandle } from "./run.js";
import { loadProjectEnv } from "./shared.js";

/**
 * `aster dev` — local-first development loop:
 *   - interactive chat in the terminal (streaming)
 *   - the built-in HTTP channel on --port (default 3111)
 *   - schedules running on their cron expressions
 *   - hot reload: project files are re-imported when they change
 *   - /approve and /deny for human-in-the-loop tool calls
 */
export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { port: { type: "string" }, session: { type: "string" }, "no-server": { type: "boolean" } },
    allowPositionals: true,
  });
  const projectDir = resolve(positionals[0] ?? ".");
  loadProjectEnv(projectDir);
  let generation = 0;
  let project: LoadedProject = await loadProject(projectDir, { generation });
  let agent = new Agent(project);
  let lastMtime = await projectMtime(project.manifest);

  const port = Number(values.port ?? 3111);
  let server: ReturnType<typeof createHttpChannelServer> | undefined;
  if (!values["no-server"]) {
    server = createHttpChannelServer(agentHandle(agent), { port });
    await server.listen();
  }

  let scheduler = startScheduler(agent);
  const channelStops: Array<() => Promise<void> | void> = [];
  for (const channel of project.channels) {
    channelStops.push(
      await channel.start({
        agent: agentHandle(agent),
        log: (m, f) => print(`[channel:${channel.name}] ${m} ${f ? JSON.stringify(f) : ""}`),
      }),
    );
  }

  let sessionId = values.session ?? newSessionId();
  banner(agent, project, port, sessionId, Boolean(values["no-server"]));

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you › " });
  rl.prompt();

  const reloadIfChanged = async (): Promise<void> => {
    try {
      const manifest = await discoverProject(projectDir);
      const mtime = await projectMtime(manifest);
      if (mtime <= lastMtime) return;
      lastMtime = mtime;
      generation++;
      project = await loadProject(projectDir, { generation });
      agent = new Agent(project);
      scheduler.stop();
      scheduler = startScheduler(agent);
      print("↻ reloaded project (files changed)");
    } catch (error) {
      print(`✗ reload failed: ${serializeError(error).message} — keeping previous version`);
    }
  };
  const watcher = setInterval(() => void reloadIfChanged(), 1000);

  rl.on("line", (line) => {
    void (async () => {
      const input = line.trim();
      if (!input) return rl.prompt();
      if (input === "/exit" || input === "/quit") return shutdown();
      if (input === "/new") {
        sessionId = newSessionId();
        print(`new session: ${sessionId}`);
        return rl.prompt();
      }
      if (input === "/session") {
        print(`session: ${sessionId}`);
        return rl.prompt();
      }
      if (input === "/pending") {
        const session = await agent.session(sessionId);
        if (session.pendingApprovals.length === 0) print("no pending approvals");
        for (const p of session.pendingApprovals) {
          print(`⏸ ${p.toolCallId}  ${p.tool}(${JSON.stringify(p.input)})`);
        }
        return rl.prompt();
      }
      const approveMatch = input.match(/^\/(approve|deny)\s+(\S+)\s*(.*)$/);
      if (approveMatch) {
        const [, action, id, reason] = approveMatch;
        try {
          const result =
            action === "approve"
              ? await agent.approve(sessionId, id!)
              : await agent.deny(sessionId, id!, { reason: reason || undefined });
          if (result.output) print(`agent › ${result.output}`);
          if (result.status === "waiting_approval") printApprovals(result.pendingApprovals);
        } catch (error) {
          print(`✗ ${serializeError(error).message}`);
        }
        return rl.prompt();
      }
      if (input.startsWith("/")) {
        print("commands: /new /session /pending /approve <id> /deny <id> [reason] /exit");
        return rl.prompt();
      }
      try {
        process.stdout.write("agent › ");
        let wrote = false;
        const result = await agent.send(sessionId, input, {
          onText: (chunk) => {
            wrote = true;
            process.stdout.write(chunk);
          },
        });
        if (!wrote && result.output) process.stdout.write(result.output);
        process.stdout.write("\n");
        if (result.status === "waiting_approval") printApprovals(result.pendingApprovals);
        if (result.status === "max_steps") print("⚠ run stopped: maxSteps reached");
      } catch (error) {
        process.stdout.write("\n");
        print(`✗ ${serializeError(error).message}`);
      }
      rl.prompt();
    })();
  });

  const shutdown = async (): Promise<never> => {
    clearInterval(watcher);
    scheduler.stop();
    for (const stop of channelStops) await stop();
    if (server) await server.close();
    rl.close();
    process.exit(0);
  };
  rl.on("SIGINT", () => void shutdown());
  await new Promise(() => undefined);
  return 0;
}

function startScheduler(agent: Agent): Scheduler {
  const scheduler = new Scheduler(agent.project.schedules, (schedule, now) => ({
    now,
    log: (m, f) => print(`[schedule:${schedule.name}] ${m} ${f ? JSON.stringify(f) : ""}`),
    prompt: async (text, options) =>
      (await agent.send(options?.sessionId ?? `schedule-${schedule.name}`, text, { trigger: "schedule" })).output,
  }));
  scheduler.start();
  return scheduler;
}

function printApprovals(approvals: Array<{ toolCallId: string; tool: string; input: unknown }>): void {
  for (const approval of approvals) {
    print(`⏸ approval needed: ${approval.tool}(${JSON.stringify(approval.input)})`);
    print(`   /approve ${approval.toolCallId}   or   /deny ${approval.toolCallId} [reason]`);
  }
}

function print(message: string): void {
  process.stdout.write(message + "\n");
}

function banner(agent: Agent, project: LoadedProject, port: number, sessionId: string, noServer: boolean): void {
  const counts = [
    `${project.tools.list().length} tools`,
    `${project.skills.list().length} skills`,
    `${project.subagents.length} subagents`,
    `${project.workflows.length} workflows`,
    `${project.channels.length} channels`,
    `${project.schedules.length} schedules`,
  ].join(" · ");
  print(`aster dev — agent "${agent.name}" (${agent.model})`);
  print(`  ${counts}`);
  if (!noServer) print(`  http: POST http://localhost:${port}/v1/messages {"message":"hi"}`);
  print(`  session: ${sessionId}   (/new for a fresh one, /exit to quit)`);
  print("");
}
