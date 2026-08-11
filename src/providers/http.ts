import { AsterError } from "../errors.js";

/** Minimal fetch wrapper with retries on 429/5xx and JSON error surfacing. */
export async function providerFetch(
  url: string,
  init: RequestInit,
  options: { retries?: number; providerName: string },
): Promise<Response> {
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      lastError = new AsterError(
        "PROVIDER_ERROR",
        `${options.providerName} returned ${response.status}: ${body.slice(0, 500)}`,
        { status: response.status },
      );
      if (!retryable || attempt === retries) throw lastError;
    } catch (error) {
      if (error instanceof AsterError && (error.details?.status as number) < 500 && error.details?.status !== 429) {
        throw error;
      }
      lastError = error;
      if (attempt === retries) break;
    }
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error
    ? lastError
    : new AsterError("PROVIDER_ERROR", `${options.providerName} request failed`);
}

export function requireEnv(name: string, providerName: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AsterError(
      "PROVIDER_ERROR",
      `Provider "${providerName}" requires the ${name} environment variable`,
    );
  }
  return value;
}
