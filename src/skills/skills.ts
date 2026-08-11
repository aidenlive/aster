/**
 * Skills are markdown procedures loaded on demand (progressive disclosure).
 * Only each skill's name and description enter the system prompt; the full
 * body is fetched by the model through the built-in `use_skill` tool. This
 * keeps the always-on prompt small while making deep procedures available.
 *
 * Discovery: `agent/skills/<name>.md` or `agent/skills/<name>/SKILL.md`.
 * Optional YAML-ish frontmatter provides `name` and `description`.
 */

export interface Skill {
  name: string;
  description: string;
  body: string;
  sourcePath: string;
}

export function parseSkill(raw: string, fallbackName: string, sourcePath: string): Skill {
  const { frontmatter, body } = splitFrontmatter(raw);
  const name = frontmatter.name ?? fallbackName;
  const description =
    frontmatter.description ?? firstParagraph(body) ?? `Skill "${name}" (no description)`;
  return { name, description, body: body.trim(), sourcePath };
}

function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) frontmatter[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "").trim();
  }
  return { frontmatter, body: raw.slice(match[0].length) };
}

function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const text = block.replace(/^#.*$/m, "").trim();
    if (text) return text.split(/\r?\n/).join(" ").slice(0, 300);
  }
  return undefined;
}

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  /** Compact catalog injected into the system prompt. */
  promptCatalog(): string {
    if (this.skills.size === 0) return "";
    const lines = this.list().map((s) => `- ${s.name}: ${s.description}`);
    return [
      "## Skills",
      "The following skills are available. Call the `use_skill` tool with a skill",
      "name to load its full instructions before relying on it.",
      ...lines,
    ].join("\n");
  }
}
