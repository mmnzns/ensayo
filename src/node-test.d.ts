// The few Node APIs the tests use (tokens.test.ts, handoff.test.ts). TypeScript 6 no longer loads @types/node on its
// own, and the app itself has no Node types, so tests get this small shim instead.
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
declare const __dirname: string;
