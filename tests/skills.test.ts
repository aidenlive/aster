import { describe, expect, it } from "vitest";
import { parseSkill, SkillRegistry } from "../src/skills/skills.js";

describe("skills", () => {
  it("parses frontmatter", () => {
    const skill = parseSkill(
      `---\nname: my_skill\ndescription: Does things.\n---\n\n# Body\n\nSteps here.`,
      "fallback",
      "/x/skill.md",
    );
    expect(skill.name).toBe("my_skill");
    expect(skill.description).toBe("Does things.");
    expect(skill.body).toContain("Steps here.");
  });

  it("falls back to filename and first paragraph", () => {
    const skill = parseSkill(`# Title\n\nFirst paragraph of the body.\n\nMore.`, "from_file", "/x.md");
    expect(skill.name).toBe("from_file");
    expect(skill.description).toContain("First paragraph");
  });

  it("builds a prompt catalog", () => {
    const registry = new SkillRegistry();
    registry.register(parseSkill("---\nname: a\ndescription: Alpha.\n---\nbody", "a", "/a.md"));
    const catalog = registry.promptCatalog();
    expect(catalog).toContain("use_skill");
    expect(catalog).toContain("- a: Alpha.");
  });
});
