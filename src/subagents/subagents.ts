/**
 * Subagents are full agents nested in `agent/subagents/<name>/` with their own
 * instructions, tools, and (optionally) model. Each subagent is exposed to the
 * parent as a tool named `subagent_<name>`: the parent delegates a task in
 * natural language and receives the subagent's final answer. Every subagent
 * run happens in its own child session so the delegation is fully traceable.
 */

export interface SubagentDefinition {
  name: string;
  description: string;
  instructions: string;
  /** Overrides the parent model when set, e.g. "anthropic/claude-haiku-4-5". */
  model?: string;
  dir: string;
}
