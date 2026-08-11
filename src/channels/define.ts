/**
 * A channel connects the agent to the outside world (HTTP, Slack, Discord, a
 * queue). Channels receive external input, forward it to the agent, and send
 * the reply back out. The framework provides a built-in HTTP channel; custom
 * channels are files in `agent/channels/`.
 */

export interface ChannelAgentHandle {
  /** Send a user message into a session and await the assistant reply. */
  send(sessionId: string, text: string): Promise<{ output: string; status: string }>;
  /** Stream reply text chunks. */
  stream(sessionId: string, text: string): AsyncIterable<string>;
  agentName: string;
}

export interface ChannelContext {
  agent: ChannelAgentHandle;
  log: (message: string, fields?: Record<string, unknown>) => void;
  /** Port assigned by the runtime for channels that listen (dev server base + offset). */
  port?: number;
}

export interface ChannelDefinition {
  name?: string;
  description?: string;
  /** Called when the runtime starts. Return a cleanup function. */
  start(ctx: ChannelContext): Promise<() => Promise<void> | void> | (() => Promise<void> | void);
}

export interface Channel extends ChannelDefinition {
  name: string;
  sourcePath?: string;
}

const MARKER = Symbol.for("aster.channel");

export function defineChannel(definition: ChannelDefinition): ChannelDefinition {
  Object.defineProperty(definition, MARKER, { value: true, enumerable: false });
  return definition;
}

export function isChannelDefinition(value: unknown): value is ChannelDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (MARKER in value || typeof (value as ChannelDefinition).start === "function")
  );
}
