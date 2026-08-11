import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

export interface ParsedCli {
  dir: string;
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/** Common parsing: first non-flag positional after known ones is the project dir. */
export function parseCli(
  args: string[],
  options: Record<string, { type: "string" | "boolean"; short?: string }> = {},
): ParsedCli {
  const { values, positionals } = parseArgs({
    args,
    options: {
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      ...options,
    },
    allowPositionals: true,
  });
  return {
    dir: positionals[positionals.length - 1] && !positionals[positionals.length - 1]!.startsWith("-")
      ? resolveDir(positionals)
      : process.cwd(),
    values: values as ParsedCli["values"],
    positionals,
  };
}

function resolveDir(positionals: string[]): string {
  // Commands like `inspect session <id> [dir]` have leading positionals that
  // aren't directories; callers slice those off before calling parseCli, so the
  // last positional (when present) is the directory.
  return positionals[positionals.length - 1] ?? process.cwd();
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/**
 * Load `<projectDir>/.env` into process.env (existing variables win).
 * Called by `dev` and `run` so keys configured at init "just work".
 */
export function loadProjectEnv(projectDir: string): void {
  const path = join(projectDir, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    process.env[key!] = rawValue!.replace(/^(['"])(.*)\1$/, "$2");
  }
}
