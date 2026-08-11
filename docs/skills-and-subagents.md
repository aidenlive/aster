# Skills & subagents

> **TL;DR**
> Skills are markdown procedures loaded on demand; subagents are nested agents
> exposed to the parent as delegation tools. Both keep the main prompt small
> while growing capability.

## Skills

A skill is a markdown file in `agent/skills/`:

```markdown
---
name: cut_a_release
description: The exact procedure for cutting a production release.
---

# Cutting a release

1. Run the full test suite; do not proceed on any failure.
2. ...
```

**Progressive disclosure.** Only the name and description enter the system
prompt, as a catalog. The framework registers a built-in `use_skill` tool; when
a task matches a skill, the model calls it and receives the full body. A
project can carry dozens of detailed procedures at near-zero prompt cost.

| Frontmatter | Behavior when omitted |
| ----------- | --------------------- |
| `name` | Filename (or directory name for `<name>/SKILL.md`). |
| `description` | First paragraph of the body, truncated. |

> **Tip**
> Write descriptions as *triggers* ("Use when the user asks to…"), not
> summaries — the description is how the model decides to load the skill.

## Subagents

A subagent is a directory:

```
agent/subagents/researcher/
├── instructions.md     # frontmatter: description (required-ish), model (optional)
└── tools/              # tools only this subagent can use
```

```markdown
---
description: Gathers facts and sources on a topic; returns structured findings.
model: anthropic/claude-haiku-4-5
---
You are a research specialist. ...
```

The parent sees a tool named `subagent_researcher` that takes a `task` string.
Each delegation runs in a **child session** (`<parent-session>--researcher-…`),
so the subagent's model calls and tool calls are fully traceable with
`aster inspect trace`, separate from the parent's transcript.

### Why tools, not magic

Delegation-as-a-tool keeps the contract explicit: the parent writes a
self-contained task, the subagent returns a final answer, and nothing else is
shared. Context isolation is the feature — the subagent cannot see or pollute
the parent's conversation.

| Property | Value |
| -------- | ----- |
| Subagent tools | Only files under its own `tools/`. |
| Skills | Shared with the parent (the catalog travels). |
| Model | Parent's model unless overridden in frontmatter — put cheap models on cheap work. |
| Nesting | One level. Deeper trees are deliberately unsupported; see [Architecture](./architecture.md). |
