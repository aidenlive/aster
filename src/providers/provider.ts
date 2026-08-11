import { AsterError } from "../errors.js";
import type { Provider } from "../types.js";

/**
 * Model strings are `<provider>/<model>`, e.g. "anthropic/claude-sonnet-4-6".
 * Providers are looked up by the prefix; the remainder is passed through.
 */
export function parseModelString(model: string): { provider: string; model: string } {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    throw new AsterError(
      "CONFIG_INVALID",
      `Model "${model}" must be "<provider>/<model>", e.g. "anthropic/claude-sonnet-4-6"`,
    );
  }
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  register(provider: Provider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  resolve(modelString: string): { provider: Provider; model: string } {
    const { provider: name, model } = parseModelString(modelString);
    const provider = this.providers.get(name);
    if (!provider) {
      throw new AsterError(
        "PROVIDER_NOT_FOUND",
        `No provider registered for "${name}". Registered: ${[...this.providers.keys()].join(", ") || "(none)"}`,
      );
    }
    return { provider, model };
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
