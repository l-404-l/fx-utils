//@ts-check

import { readFile } from "fs/promises";

/**
 * Reads and parses a JSON file at the given path.
 * @param {string} path
 */
export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
