//@ts-check

import { readdir } from "fs/promises";

/**
 * Returns a flattened array of all files located at the given paths.
 * @param {string[]} paths
 * @returns {Promise<string[]>}
 */
export async function getFiles(...paths) {
  const files = await Promise.all(
    paths.map(async (dir) => {
      try {
        const dirents = await readdir(`${dir}/`, { withFileTypes: true });
        const paths = await Promise.all(
          dirents.map(async (dirent) => {
            const path = `${dir}/${dirent.name}`;
            return dirent.isDirectory() ? await getFiles(path) : path;
          })
        );

        return paths.flat();
      } catch (err) {
        return [];
      }
    })
  );

  return files.flat();
}
