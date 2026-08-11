import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { Agent } from "../agent/agent.js";
import { loadProject } from "../project/load.js";
import { createHttpChannelServer } from "../channels/http.js";
import { Scheduler } from "../schedules/scheduler.js";
import { createLogger } from "../log.js";
import { loadProjectEnv, printJson } from "./shared.js";

const log = createLogger({ component: "run" });

/**
 * `aster run` executes the agent without the interactive dev UI:
 *   aster run -p "prompt" [--session id] [--json]
 *   aster run --workflow <name> [--input '<json>']
 *   aster run --schedule <name>            (trigger one schedule now)
 *   aster run --serve [--port 3111]        (HTTP channel + schedules, production mode)
 */
export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      prompt: { type: "string", short: "p" },
      session: { type: "string", short: "s" },
      workflow: { type: "string" },
      input: { type: "string" },
      schedule: { type: "string" },
      serve: { type: "boolean" },
      port: { type: "string" },
      json: { type: "boolean" },
      stream: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const projectDir = resolve(positionals[0] ?? ".");
  loadProjectEnv(projectDir);
  const project = await loadProject(projectDir);
  const agent = new Agent(project);

  if (values.workflow) {
    let input: unknown = undefined;
    if (values.input) input = JSON.parse(values.input);
    const result = await agent.runWorkflow(values.workflow, input, values.session);
    printJson({ workflow: values.workflow, result });
    return 0;
  }

  if (values.schedule) {
    const scheduler = buildScheduler(agent);
    const found = await scheduler.runByName(values.schedule);
    if (!found) {
      process.stderr.write(`No schedule named "${values.schedule}". Defined: ${project.schedules.map((s) => s.name).join(", ") || "(none)"}\n`);
      return 1;
    }
    return 0;
  }

  if (values.serve) {
    const port = Number(values.port ?? process.env.PORT ?? 3111);
    const server = createHttpChannelServer(agentHandle(agent), { port });
    await server.listen();
    log.info(`agent "${agent.name}" serving`, { port, model: agent.model });
    const scheduler = buildScheduler(agent);
    scheduler.start();
    const stops: Array<() => Promise<void> | void> = [];
    for (const channel of project.channels) {
      const stop = await channel.start({
        agent: agentHandle(agent),
        log: (message, fields) => log.info(`[channel:${channel.name}] ${message}`, fields),
      });
      stops.push(stop);
    }
    const shutdown = async () => {
      scheduler.stop();
      for (const stop of stops) await stop();
      await server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    await new Promise(() => undefined); // run until signaled
    return 0;
  }

  if (!values.prompt) {
    process.stderr.write('Provide a prompt with -p "..." (or --workflow, --schedule, --serve).\n');
    return 1;
  }

  if (values.stream && !values.json) {
    let session = values.session;
    for await (const chunk of agent.stream(session, values.prompt)) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");
    return 0;
  }

  const result = await agent.send(values.session, values.prompt);
  if (values.json) {
    printJson(result);
  } else {
    process.stdout.write(result.output + "\n");
    if (result.status === "waiting_approval") {
      process.stdout.write(
        `\n⏸ Waiting for approval of ${result.pendingApprovals.length} tool call(s) in session ${result.sessionId}.\n` +
          result.pendingApprovals
            .map((a) => `  aster inspect session ${result.sessionId}   # then approve/deny ${a.toolCallId}`)
            .join("\n") +
          "\n",
      );
    }
  }
  return result.status === "failed" ? 1 : 0;
}

function buildScheduler(agent: Agent): Scheduler {
  return new Scheduler(agent.project.schedules, (schedule, now) => ({
    now,
    log: (message, fields) => log.info(`[schedule:${schedule.name}] ${message}`, fields),
    prompt: async (text, options) =>
      (await agent.send(options?.sessionId ?? `schedule-${schedule.name}`, text, { trigger: "schedule" })).output,
  }));
}

export function agentHandle(agent: Agent) {
  return {
    agentName: agent.name,
    send: async (sessionId: string, text: string) => {
      const result = await agent.send(sessionId, text, { trigger: "channel" });
      return { output: result.output, status: result.status };
    },
    stream: (sessionId: string, text: string) => agent.stream(sessionId, text),
  };
}
