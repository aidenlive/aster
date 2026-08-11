import { join } from "node:path";
import { z } from "zod";
import { AsterError, serializeError } from "../errors.js";
import { callId, newId, sessionId as newSessionId, spanId } from "../ids.js";
import { createLogger, type Logger } from "../log.js";
import type { LoadedProject } from "../project/load.js";
import { defaultProviders, ProviderRegistry } from "../providers/index.js";
import { Session } from "../runtime/session.js";
import { FileSessionStore, type SessionStore } from "../runtime/store.js";
import { runToolInProcessSandbox } from "../runtime/sandbox.js";
import { parseToolInput, toolSpec, type Tool, type ToolContext } from "../tools/define.js";
import { ToolRegistry } from "../tools/registry.js";
import { executeWorkflow } from "../workflows/workflow.js";
import type {
  ContentPart,
  Message,
  PendingApproval,
  Provider,
  RunResult,
  ToolSpec,
} from "../types.js";
import { messageText, userMessage } from "../types.js";
import type { EventListener } from "../runtime/events.js";

export interface AgentOptions {
  /** Extra providers, e.g. self-hosted OpenAI-compatible endpoints. */
  providers?: Provider[];
  store?: SessionStore;
  logger?: Logger;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";
const DEFAULT_MAX_STEPS = 24;
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

interface RunOptions {
  onText?: (chunk: string) => void;
  trigger?: "message" | "schedule" | "channel" | "resume";
}

/**
 * The Agent runtime. Wraps a loaded project with:
 *  - the agentic loop (model call → tool calls → results → repeat)
 *  - durable sessions (every step is an event in the session log)
 *  - human-in-the-loop approvals (pause + resume across process restarts)
 *  - subagent delegation (each subagent is a tool running a child session)
 *  - skills via progressive disclosure (`use_skill` built-in tool)
 */
export class Agent {
  readonly name: string;
  readonly model: string;
  private readonly providers: ProviderRegistry;
  private readonly store: SessionStore;
  private readonly log: Logger;
  private readonly effectiveTools: ToolRegistry;
  private readonly systemPrompt: string;
  private readonly sessions = new Map<string, Session>();

  constructor(
    readonly project: LoadedProject,
    options: AgentOptions = {},
  ) {
    this.name = project.config.name ?? project.manifest.name;
    // ASTER_OFFLINE=1 forces the deterministic mock provider regardless of the
    // configured model, so any project can be exercised without credentials.
    this.model =
      process.env.ASTER_OFFLINE === "1"
        ? "mock/echo"
        : (project.config.model ?? DEFAULT_MODEL);
    this.providers = defaultProviders();
    for (const provider of [...(project.config.providers ?? []), ...(options.providers ?? [])]) {
      this.providers.register(provider);
    }
    this.store =
      options.store ??
      project.config.store ??
      new FileSessionStore(join(project.manifest.projectDir, ".aster"));
    this.log = options.logger ?? createLogger({ agent: this.name });
    this.effectiveTools = this.buildToolset();
    this.systemPrompt = this.buildSystemPrompt();
  }

  // ---------------------------------------------------------------- toolset

  private buildToolset(): ToolRegistry {
    const registry = new ToolRegistry();
    for (const tool of this.project.tools.list()) registry.register(tool);

    if (this.project.skills.list().length > 0) {
      registry.register({
        name: "use_skill",
        description:
          "Load the full instructions of a named skill. Call this before performing a task a skill covers.",
        inputSchema: z.object({ skill: z.string().min(1).describe("Skill name from the catalog") }),
        execute: async ({ skill }) => {
          const found = this.project.skills.get(skill);
          if (!found) {
            const names = this.project.skills.list().map((s) => s.name);
            return { error: `Unknown skill "${skill}". Available: ${names.join(", ")}` };
          }
          return { skill: found.name, instructions: found.body };
        },
      } as Tool);
    }

    for (const subagent of this.project.subagents) {
      registry.register({
        name: `subagent_${subagent.name}`,
        description: `Delegate a task to the "${subagent.name}" subagent. ${subagent.description}`,
        inputSchema: z.object({
          task: z.string().min(1).describe("A complete, self-contained task description"),
        }),
        timeoutMs: 10 * 60_000,
        execute: async ({ task }, ctx) => {
          const childId = `${ctx.sessionId}--${subagent.name}-${newId("sub").slice(-8)}`;
          const result = await this.runSubagent(subagent.name, task, childId);
          return { sessionId: childId, status: result.status, output: result.output };
        },
      } as Tool);
    }
    return registry;
  }

  private buildSystemPrompt(): string {
    const parts = [this.project.instructions];
    const catalog = this.project.skills.promptCatalog();
    if (catalog) parts.push(catalog);
    if (this.project.subagents.length > 0) {
      parts.push(
        [
          "## Subagents",
          "You can delegate self-contained tasks to specialized subagents via their tools:",
          ...this.project.subagents.map((s) => `- subagent_${s.name}: ${s.description}`),
        ].join("\n"),
      );
    }
    return parts.join("\n\n");
  }

  toolSpecs(): ToolSpec[] {
    return this.effectiveTools.list().map(toolSpec);
  }

  // --------------------------------------------------------------- sessions

  async session(id?: string): Promise<Session> {
    const sid = id ?? newSessionId();
    const cached = this.sessions.get(sid);
    if (cached) return cached;
    const session = await Session.open(sid, this.store);
    if ((await session.events()).length === 0) {
      await session.emit({ type: "session.created", sessionId: sid, agent: this.name });
    }
    this.sessions.set(sid, session);
    return session;
  }

  async listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
    return this.store.listSessions();
  }

  // ------------------------------------------------------------------ runs

  /** Send a user message into a session and run the loop to completion or pause. */
  async send(sessionIdOrUndefined: string | undefined, text: string, options: RunOptions = {}): Promise<RunResult> {
    const session = await this.session(sessionIdOrUndefined);
    if (session.status === "waiting_approval") {
      throw new AsterError(
        "TOOL_EXECUTION_FAILED",
        `Session ${session.id} is waiting for approval of ${session.pendingApprovals.length} tool call(s). Approve or deny them first (aster inspect session ${session.id}).`,
      );
    }
    await session.emit({ type: "message.appended", message: userMessage(text) });
    return this.runLoop(session, { ...options, trigger: options.trigger ?? "message" });
  }

  /** Stream a reply as text chunks. */
  async *stream(sessionIdOrUndefined: string | undefined, text: string): AsyncIterable<string> {
    const chunks: string[] = [];
    let resolveNext: (() => void) | undefined;
    let done = false;
    const push = (chunk: string) => {
      chunks.push(chunk);
      resolveNext?.();
    };
    const runPromise = this.send(sessionIdOrUndefined, text, { onText: push }).finally(() => {
      done = true;
      resolveNext?.();
    });
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => (resolveNext = resolve));
        resolveNext = undefined;
      }
    }
    await runPromise;
  }

  /** Approve a pending human-in-the-loop tool call and resume the run. */
  async approve(sessionIdValue: string, toolCallId: string, options: { by?: string } = {}): Promise<RunResult> {
    const session = await this.session(sessionIdValue);
    const approval = session.pendingApprovals.find((p) => p.toolCallId === toolCallId);
    if (!approval) {
      throw new AsterError("APPROVAL_NOT_FOUND", `No pending approval "${toolCallId}" in session ${session.id}`);
    }
    await session.emit({ type: "approval.resolved", toolCallId, approved: true, by: options.by });
    const tool = this.effectiveTools.get(approval.tool);
    const resultPart = await this.executeToolCall(session, tool, toolCallId, approval.input);
    await session.emit({
      type: "message.appended",
      message: { role: "tool", content: [resultPart] },
    });
    if (session.pendingApprovals.length > 0) {
      return this.pausedResult(session);
    }
    return this.runLoop(session, { trigger: "resume" });
  }

  /** Deny a pending tool call; the model is told and the run resumes. */
  async deny(sessionIdValue: string, toolCallId: string, options: { by?: string; reason?: string } = {}): Promise<RunResult> {
    const session = await this.session(sessionIdValue);
    const approval = session.pendingApprovals.find((p) => p.toolCallId === toolCallId);
    if (!approval) {
      throw new AsterError("APPROVAL_NOT_FOUND", `No pending approval "${toolCallId}" in session ${session.id}`);
    }
    await session.emit({ type: "approval.resolved", toolCallId, approved: false, by: options.by });
    await session.emit({
      type: "message.appended",
      message: {
        role: "tool",
        content: [
          {
            type: "tool_result",
            toolCallId,
            name: approval.tool,
            output: { denied: true, reason: options.reason ?? "A human denied this tool call." },
            isError: true,
          },
        ],
      },
    });
    if (session.pendingApprovals.length > 0) return this.pausedResult(session);
    return this.runLoop(session, { trigger: "resume" });
  }

  private pausedResult(session: Session): RunResult {
    return {
      sessionId: session.id,
      status: "waiting_approval",
      output: "",
      pendingApprovals: session.pendingApprovals,
      steps: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // ------------------------------------------------------------------ loop

  private async runLoop(session: Session, options: RunOptions): Promise<RunResult> {
    const runId = newId("run");
    const maxSteps = this.project.config.maxSteps ?? DEFAULT_MAX_STEPS;
    const usage = { inputTokens: 0, outputTokens: 0 };
    let steps = 0;
    await session.emit({ type: "run.started", runId, trigger: options.trigger ?? "message" });

    try {
      while (steps < maxSteps) {
        steps++;
        const turn = await this.callModel(session, options);
        usage.inputTokens += turn.usage?.inputTokens ?? 0;
        usage.outputTokens += turn.usage?.outputTokens ?? 0;
        await session.emit({ type: "message.appended", message: turn.message });

        const toolCalls = turn.message.content.filter(
          (p): p is Extract<ContentPart, { type: "tool_call" }> => p.type === "tool_call",
        );
        if (toolCalls.length === 0) {
          const output = messageText(turn.message);
          await session.emit({ type: "run.finished", runId, status: "completed" });
          return { sessionId: session.id, status: "completed", output, pendingApprovals: [], steps, usage };
        }

        const resultParts: ContentPart[] = [];
        let paused = false;
        for (const call of toolCalls) {
          const tool = this.effectiveTools.has(call.name) ? this.effectiveTools.get(call.name) : undefined;
          if (!tool) {
            resultParts.push({
              type: "tool_result",
              toolCallId: call.id,
              name: call.name,
              output: { error: `Unknown tool "${call.name}"` },
              isError: true,
            });
            continue;
          }
          if (tool.approval) {
            const approval: PendingApproval = {
              toolCallId: call.id,
              tool: tool.name,
              input: call.input,
              requestedAt: new Date().toISOString(),
            };
            await session.emit({ type: "approval.requested", approval });
            paused = true;
            continue;
          }
          resultParts.push(await this.executeToolCall(session, tool, call.id, call.input));
        }

        if (resultParts.length > 0) {
          await session.emit({
            type: "message.appended",
            message: { role: "tool", content: resultParts },
          });
        }
        if (paused) {
          await session.emit({ type: "run.finished", runId, status: "waiting_approval" });
          return {
            sessionId: session.id,
            status: "waiting_approval",
            output: "",
            pendingApprovals: session.pendingApprovals,
            steps,
            usage,
          };
        }
      }
      await session.emit({ type: "run.finished", runId, status: "max_steps" });
      return {
        sessionId: session.id,
        status: "max_steps",
        output: "",
        pendingApprovals: [],
        steps,
        usage,
      };
    } catch (error) {
      await session
        .emit({ type: "run.finished", runId, status: "failed", error: serializeError(error) })
        .catch(() => undefined);
      throw error;
    }
  }

  private async callModel(session: Session, options: RunOptions) {
    const { provider, model } = this.providers.resolve(this.model);
    const sid = spanId();
    const started = Date.now();
    await session.emit({
      type: "model.request",
      model: this.model,
      spanId: sid,
      messageCount: session.messages.length,
    });
    const request = {
      model,
      system: this.systemPrompt,
      messages: [...session.messages],
      tools: this.toolSpecs(),
      maxTokens: this.project.config.maxTokens,
      temperature: this.project.config.temperature,
    };
    let turn;
    if (options.onText && provider.stream) {
      let finalTurn;
      for await (const delta of provider.stream(request)) {
        if (delta.type === "text_delta") options.onText(delta.text);
        if (delta.type === "turn_complete") finalTurn = delta.turn;
      }
      if (!finalTurn) throw new AsterError("PROVIDER_ERROR", "Stream ended without a final turn");
      turn = finalTurn;
    } else {
      turn = await provider.generate(request);
      if (options.onText) {
        const textOut = messageText(turn.message);
        if (textOut) options.onText(textOut);
      }
    }
    await session.emit({
      type: "model.response",
      spanId: sid,
      stopReason: turn.stopReason,
      usage: turn.usage ?? {},
      durationMs: Date.now() - started,
    });
    return turn;
  }

  private async executeToolCall(
    session: Session,
    tool: Tool,
    toolCallId: string,
    rawInput: unknown,
  ): Promise<ContentPart> {
    const sid = spanId();
    const started = Date.now();
    await session.emit({ type: "tool.call", spanId: sid, toolCallId, tool: tool.name, input: rawInput });
    const timeoutMs = tool.timeoutMs ?? this.project.config.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    let output: unknown;
    let isError = false;
    try {
      const input = parseToolInput(tool, rawInput);
      if (tool.isolation === "process") {
        output = await runToolInProcessSandbox(tool, input, {
          projectDir: this.project.manifest.projectDir,
          sessionId: session.id,
          timeoutMs,
        });
      } else {
        output = await this.executeInProcess(tool, input, session, timeoutMs);
      }
    } catch (error) {
      isError = true;
      output = { error: serializeError(error).message };
      this.log.warn(`tool "${tool.name}" failed`, serializeError(error));
    }
    await session.emit({
      type: "tool.result",
      spanId: sid,
      toolCallId,
      tool: tool.name,
      output,
      isError,
      durationMs: Date.now() - started,
    });
    return { type: "tool_result", toolCallId, name: tool.name, output, isError };
  }

  private async executeInProcess(
    tool: Tool,
    input: unknown,
    session: Session,
    timeoutMs: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const ctx: ToolContext = {
      sessionId: session.id,
      projectDir: this.project.manifest.projectDir,
      signal: controller.signal,
      log: (message, fields) =>
        void session.emit({ type: "log", level: "info", message: `[${tool.name}] ${message}`, fields }),
      state: {
        get: (key) => session.getState(key),
        set: (key, value) => session.setState(key, value),
      },
    };
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await Promise.race([
        Promise.resolve(tool.execute(input, ctx)),
        new Promise((_, reject) =>
          controller.signal.addEventListener("abort", () =>
            reject(new AsterError("TOOL_EXECUTION_FAILED", `Tool "${tool.name}" timed out after ${timeoutMs}ms`)),
          ),
        ),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------- subagents

  private async runSubagent(name: string, task: string, childSessionId: string): Promise<RunResult> {
    const subagent = this.project.subagents.find((s) => s.name === name);
    if (!subagent) throw new AsterError("PROJECT_INVALID", `Unknown subagent "${name}"`);
    const childProject: LoadedProject = {
      ...this.project,
      instructions: subagent.instructions,
      tools: this.project.subagentTools.get(name) ?? new ToolRegistry(),
      subagents: [],
      subagentTools: new Map(),
      skills: this.project.skills,
      config: { ...this.project.config, model: subagent.model ?? this.model, name: `${this.name}/${name}` },
    };
    const child = new Agent(childProject, { store: this.store, logger: this.log.child({ subagent: name }) });
    return child.send(childSessionId, task);
  }

  // ------------------------------------------------------------- workflows

  async runWorkflow(name: string, input: unknown, sessionIdValue?: string): Promise<unknown> {
    const workflow = this.project.workflows.find((w) => w.name === name);
    if (!workflow) throw new AsterError("PROJECT_INVALID", `Unknown workflow "${name}"`);
    const session = await this.session(sessionIdValue ?? `wf-${name}-${newId("s").slice(-10)}`);
    return executeWorkflow(workflow, input, session, {
      prompt: async (text) => (await this.send(session.id, text)).output,
      log: (message, fields) => this.log.info(`[workflow:${name}] ${message}`, fields),
    });
  }

  // ----------------------------------------------------------------- misc

  onSessionEvent(sessionIdValue: string, listener: EventListener): Promise<() => void> {
    return this.session(sessionIdValue).then((s) => s.onEvent(listener));
  }
}
