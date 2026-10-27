declare module "pg-copy-streams" {
  import type { Writable } from "node:stream";
  export function from(queryText: unknown): Writable;
  export function to(options?: unknown): unknown;
}
