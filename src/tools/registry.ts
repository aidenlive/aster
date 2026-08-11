import { AsterError } from "../errors.js";
import type { Tool } from "./define.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new AsterError("PROJECT_INVALID", `Duplicate tool name "${tool.name}"`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) throw new AsterError("TOOL_NOT_FOUND", `Unknown tool "${name}"`);
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}
