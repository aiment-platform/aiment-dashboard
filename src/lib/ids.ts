import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

export type IdPrefix = "obj" | "ws" | "ms" | "task" | "blk" | "upd" | "mem" | "act" | "bw";

/** Prefixed IDs are self-describing in URLs, logs, and LLM tool calls: ws_k2x9f31ab */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
