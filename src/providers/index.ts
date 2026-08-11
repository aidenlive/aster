export { ProviderRegistry, parseModelString } from "./provider.js";
export { anthropic } from "./anthropic.js";
export { openai } from "./openai.js";
export { mock, type MockScript, type MockProviderOptions } from "./mock.js";
export type { Provider, ModelRequest, ModelTurn, ModelDelta } from "../types.js";

import { ProviderRegistry } from "./provider.js";
import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { mock } from "./mock.js";

/** Default registry: anthropic, openai, and the offline mock provider. */
export function defaultProviders(): ProviderRegistry {
  return new ProviderRegistry().register(anthropic()).register(openai()).register(mock());
}
