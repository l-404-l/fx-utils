import { readFile } from "fs/promises";

/**
 * Reads and parses a JSON file at the given path.
 * @param path - The file path to read the JSON from.
 */
export async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}
