import { serializeError } from "../errors.js";
import type { Session } from "../runtime/session.js";

/**
 * Durable workflows. A workflow is ordinary async code that wraps its
 * side-effectful units in `ctx.step(name, fn)`. Step results are memoized in
 * the session's durable state, so re-running the same workflow in the same
 * session after a crash resumes where it left off: completed steps return
 * their recorded result instantly and are not re-executed.
 */

export interface WorkflowContext<Input> {
  input: Input;
  sessionId: string;
  step<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  /** Ask the agent (fresh model call within this session). */
  prompt(text: string): Promise<string>;
  log: (message: string, fields?: Record<string, unknown>) => void;
}

export interface WorkflowDefinition<Input = unknown, Output = unknown> {
  name?: string;
  description?: string;
  run(ctx: WorkflowContext<Input>): Promise<Output>;
}

export interface Workflow<Input = unknown, Output = unknown> extends WorkflowDefinition<Input, Output> {
  name: string;
  sourcePath?: string;
}

const MARKER = Symbol.for("aster.workflow");

export function defineWorkflow<Input, Output>(
  definition: WorkflowDefinition<Input, Output>,
): WorkflowDefinition<Input, Output> {
  Object.defineProperty(definition, MARKER, { value: true, enumerable: false });
  return definition;
}

export function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (MARKER in value || typeof (value as WorkflowDefinition).run === "function")
  );
}

const STEP_STATE_PREFIX = "workflow.step:";

export async function executeWorkflow<Input, Output>(
  workflow: Workflow<Input, Output>,
  input: Input,
  session: Session,
  helpers: {
    prompt: (text: string) => Promise<string>;
    log: (message: string, fields?: Record<string, unknown>) => void;
  },
): Promise<Output> {
  const ctx: WorkflowContext<Input> = {
    input,
    sessionId: session.id,
    prompt: helpers.prompt,
    log: helpers.log,
    async step<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
      const key = `${STEP_STATE_PREFIX}${workflow.name}:${name}`;
      const cached = await session.getState<{ done: true; result: T }>(key);
      if (cached?.done) {
        helpers.log(`step "${name}" replayed from durable state`);
        return cached.result;
      }
      try {
        const result = await fn();
        await session.setState(key, { done: true, result: result === undefined ? null : result });
        await session.emit({ type: "step.completed", step: `${workflow.name}:${name}`, result });
        return result;
      } catch (error) {
        helpers.log(`step "${name}" failed`, serializeError(error));
        throw error;
      }
    },
  };
  return workflow.run(ctx);
}
