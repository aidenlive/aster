import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // crockford-ish, unambiguous

/** Sortable, URL-safe id: <ms-timestamp-base32>-<random>. */
export function newId(prefix: string): string {
  const time = Date.now().toString(32).padStart(9, "0");
  const rand = Array.from(randomBytes(8), (b) => ALPHABET[b % 32]).join("");
  return `${prefix}_${time}${rand}`;
}

export const sessionId = (): string => newId("ses");
export const eventId = (): string => newId("evt");
export const callId = (): string => newId("call");
export const spanId = (): string => newId("span");
