import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Publish final copy (writes to published/ in the project). Requires human approval.",
  approval: true,
  inputSchema: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), markdown: z.string().min(1) }),
  async execute({ slug, markdown }, ctx) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dir = join(ctx.projectDir, "published");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${slug}.md`);
    await writeFile(path, markdown, "utf8");
    return { published: true, path };
  },
});
