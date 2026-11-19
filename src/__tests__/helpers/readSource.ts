import { readFileSync } from "node:fs";

/** Reads a source file as text with Windows line endings turned into \n, so tests that match source text
 *  behave the same on a CRLF checkout. */
export function readSource(path: string | URL): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
