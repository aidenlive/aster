import { defineAgent } from "aster";

export default defineAgent({
  model: "anthropic/claude-sonnet-4-6",
  maxSteps: 30,
});
