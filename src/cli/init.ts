import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * `aster init [dir]` — scaffold a runnable agent project.
 *
 * Interactive by default when attached to a TTY: asks for a name, model
 * provider (including existing OpenAI-compatible endpoints such as Ollama or
 * a corporate gateway), and a capability preset, then writes `.env` and the
 * matching `agent/agent.ts` so the very first `aster dev` uses the person's
 * real setup. Every question has a flag, and `--yes` (or no TTY) skips all
 * prompts — so CI and scripts get deterministic behavior.
 */

const PROVIDERS = ["anthropic", "openai", "compatible", "offline"] as const;
type ProviderChoice = (typeof PROVIDERS)[number];
const PRESETS = ["minimal", "standard", "team"] as const;
type Preset = (typeof PRESETS)[number];

const DEFAULT_MODELS: Record<ProviderChoice, string> = {
  anthropic: "anthropic/claude-sonnet-4-6",
  openai: "openai/gpt-5",
  compatible: "local/llama3.3",
  offline: "mock/echo",
};

interface InitAnswers {
  name: string;
  provider: ProviderChoice;
  model: string;
  baseUrl?: string;
  preset: Preset;
}

export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      force: { type: "boolean", short: "f" },
      yes: { type: "boolean", short: "y" },
      provider: { type: "string" },
      model: { type: "string" },
      "base-url": { type: "string" },
      preset: { type: "string" },
      name: { type: "string" },
    },
    allowPositionals: true,
  });

  const target = resolve(positionals[0] ?? ".");
  if (existsSync(join(target, "agent")) && !values.force) {
    process.stderr.write(`${target} already contains an agent/ directory. Use --force to overwrite.\n`);
    return 1;
  }

  const flagAnswers = readFlagAnswers(values, target);
  if (flagAnswers instanceof Error) {
    process.stderr.write(flagAnswers.message + "\n");
    return 1;
  }
  const interactive = !values.yes && process.stdin.isTTY && process.stdout.isTTY;
  const answers = interactive ? await ask(flagAnswers) : finalize(flagAnswers);

  scaffold(target, answers, Boolean(values.force));

  const relTarget = positionals[0] ?? ".";
  const keyHint =
    answers.provider === "anthropic"
      ? "add your ANTHROPIC_API_KEY to .env"
      : answers.provider === "openai"
        ? "add your OPENAI_API_KEY to .env"
        : answers.provider === "compatible"
          ? `make sure ${answers.baseUrl} is reachable`
          : "runs offline via the mock provider — no key needed";
  process.stdout.write(
    [
      "",
      `Created agent project "${answers.name}" in ${target}`,
      `  model:  ${answers.model}${answers.baseUrl ? `  (endpoint: ${answers.baseUrl})` : ""}`,
      `  preset: ${answers.preset}`,
      "",
      "Files:",
      ...listTree(target).map((f) => `  ${f}`),
      "",
      "Next steps:",
      `  cd ${relTarget}`,
      "  npm install",
      `  # ${keyHint}`,
      "  npx aster dev",
      "",
    ].join("\n"),
  );
  return 0;
}

function readFlagAnswers(
  values: Record<string, string | boolean | undefined>,
  target: string,
): Partial<InitAnswers> | Error {
  const provider = values.provider as string | undefined;
  if (provider && !PROVIDERS.includes(provider as ProviderChoice)) {
    return new Error(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  }
  const preset = values.preset as string | undefined;
  if (preset && !PRESETS.includes(preset as Preset)) {
    return new Error(`--preset must be one of: ${PRESETS.join(", ")}`);
  }
  const model = values.model as string | undefined;
  if (model && !/^[a-z0-9_-]+\/.+$/i.test(model)) {
    return new Error(`--model must look like <provider>/<model>, e.g. anthropic/claude-sonnet-4-6`);
  }
  return {
    name: (values.name as string | undefined) ?? defaultName(target),
    provider: provider as ProviderChoice | undefined,
    model,
    baseUrl: values["base-url"] as string | undefined,
    preset: preset as Preset | undefined,
  };
}

function finalize(partial: Partial<InitAnswers>): InitAnswers {
  const provider = partial.provider ?? "anthropic";
  return {
    name: partial.name ?? "my-agent",
    provider,
    model: partial.model ?? DEFAULT_MODELS[provider],
    baseUrl: partial.baseUrl ?? (provider === "compatible" ? "http://localhost:11434" : undefined),
    preset: partial.preset ?? "standard",
  };
}

async function ask(partial: Partial<InitAnswers>): Promise<InitAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const q = async (label: string, fallback: string): Promise<string> =>
    (await rl.question(`${label} (${fallback}) `)).trim() || fallback;
  const pick = async <T extends string>(label: string, options: readonly T[], fallback: T, hints: string[]): Promise<T> => {
    options.forEach((option, i) => process.stdout.write(`  ${i + 1}. ${option} — ${hints[i]}\n`));
    const raw = (await rl.question(`${label} (1-${options.length}, default ${options.indexOf(fallback) + 1}) `)).trim();
    const index = Number(raw) - 1;
    return options[index] ?? fallback;
  };

  const collected: Partial<InitAnswers> = { ...partial };
  try {
    collected.name = partial.name ? partial.name : await q("Project name", "my-agent");
    collected.provider =
      partial.provider ??
      (await pick("Model provider", PROVIDERS, "anthropic", [
        "Anthropic API (ANTHROPIC_API_KEY)",
        "OpenAI API (OPENAI_API_KEY)",
        "OpenAI-compatible endpoint (Ollama, vLLM, corporate gateway)",
        "no key — deterministic mock, switch later",
      ]));
    collected.baseUrl =
      partial.baseUrl ??
      (collected.provider === "compatible" ? await q("Endpoint base URL", "http://localhost:11434") : undefined);
    collected.model = partial.model ?? (await (async () => {
      const fallback = DEFAULT_MODELS[collected.provider!];
      for (;;) {
        const answer = await q("Model", fallback);
        if (/^[a-z0-9_-]+\/.+$/i.test(answer)) return answer;
        process.stdout.write(`  models are written as <provider>/<model>, e.g. ${fallback}\n`);
      }
    })());
    collected.preset =
      partial.preset ??
      (await pick("Starting point", PRESETS, "standard", [
        "instructions + one tool",
        "tools, a skill, human-in-the-loop example",
        "standard + a subagent and a durable workflow",
      ]));
    return finalize(collected);
  } catch {
    // stdin closed mid-dialog (Ctrl+D, piped input ran out): keep what was
    // answered, fall back to defaults for the rest.
    process.stdout.write("\n(using defaults for remaining questions)\n");
    return finalize(collected);
  } finally {
    rl.close();
  }
}

function scaffold(target: string, answers: InitAnswers, force: boolean): void {
  mkdirSync(target, { recursive: true });
  cpSync(findTemplate(), target, { recursive: true, force });

  // npm strips .gitignore from published packages; template ships it as `gitignore`.
  const gi = join(target, "gitignore");
  if (existsSync(gi)) {
    cpSync(gi, join(target, ".gitignore"));
    rmSync(gi);
  }

  const pkgPath = join(target, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.name = answers.name.replace(/[^A-Za-z0-9_-]/g, "-").toLowerCase();
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  writeFileSync(join(target, "agent", "agent.ts"), renderAgentConfig(answers));
  writeFileSync(join(target, ".env"), renderEnv(answers));

  if (answers.preset === "minimal") {
    rmSync(join(target, "agent", "tools", "save_note.ts"), { force: true });
    rmSync(join(target, "agent", "skills"), { recursive: true, force: true });
  }
  if (answers.preset === "team") {
    const subagentDir = join(target, "agent", "subagents", "researcher");
    mkdirSync(subagentDir, { recursive: true });
    writeFileSync(
      join(subagentDir, "instructions.md"),
      `---\ndescription: Gathers the key facts on a topic and returns structured findings.\n---\nYou are a research specialist. Given a topic, return the 3-5 most important\nfacts as a bullet list with one-line rationales. Be explicit about uncertainty.\n`,
    );
    const workflowDir = join(target, "agent", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, "daily_summary.ts"),
      `import { defineWorkflow } from "aster/workflows";

/**
 * Durable workflow: each ctx.step() is memoized in session state, so a crash
 * between steps resumes without repeating completed work.
 * Run: npx aster run --workflow daily_summary --input '{"topic":"..."}'
 */
export default defineWorkflow<{ topic: string }, { summary: string }>({
  description: "Research a topic via the subagent, then summarize it.",
  async run(ctx) {
    const findings = await ctx.step("research", () =>
      ctx.prompt(\`Use the researcher subagent to gather findings on: \${ctx.input.topic}\`),
    );
    const summary = await ctx.step("summarize", () =>
      ctx.prompt(\`Summarize these findings in three sentences:\\n\${findings}\`),
    );
    return { summary };
  },
});
`,
    );
  }
}

function renderAgentConfig(answers: InitAnswers): string {
  if (answers.provider === "compatible") {
    return `import { defineAgent } from "aster";
import { openai } from "aster/providers";

const [providerName] = ${JSON.stringify(answers.model)}.split("/");

export default defineAgent({
  model: ${JSON.stringify(answers.model)},
  providers: [
    openai({
      name: providerName!,
      baseUrl: process.env.MODEL_BASE_URL ?? ${JSON.stringify(answers.baseUrl)},
      apiKey: process.env.MODEL_API_KEY ?? "unused",
    }),
  ],
  maxSteps: 24,
});
`;
  }
  return `import { defineAgent } from "aster";

export default defineAgent({
  model: ${JSON.stringify(answers.model)},
  maxSteps: 24,
});
`;
}

function renderEnv(answers: InitAnswers): string {
  const lines = ["# Loaded by `aster dev` and `aster run`. Git-ignored.", ""];
  switch (answers.provider) {
    case "anthropic":
      lines.push("ANTHROPIC_API_KEY=");
      break;
    case "openai":
      lines.push("OPENAI_API_KEY=");
      break;
    case "compatible":
      lines.push(`MODEL_BASE_URL=${answers.baseUrl}`, "MODEL_API_KEY=unused");
      break;
    case "offline":
      lines.push("ASTER_OFFLINE=1", "", "# When you have a key, remove ASTER_OFFLINE and set one of:", "# ANTHROPIC_API_KEY=", "# OPENAI_API_KEY=");
      break;
  }
  return lines.join("\n") + "\n";
}

function defaultName(target: string): string {
  return basename(target).replace(/[^A-Za-z0-9_-]/g, "-").toLowerCase() || "my-agent";
}

function findTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "templates", "default"),
    join(here, "..", "..", "..", "templates", "default"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Template directory not found in the aster package");
}

function listTree(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".aster" || entry.name === ".git") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listTree(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}
