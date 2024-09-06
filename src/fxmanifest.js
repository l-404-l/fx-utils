//@ts-check

import { readJson } from "./index.js";
import { writeFile } from "fs/promises";

/**
 * @param {string} name
 * @param {string[]} [files]
 */
function reduceArray(name, files) {
  return files?.[0]
    ? `\n${name} {${files.reduce((acc, value) => {
        return value ? `${acc}\n\t'${value}',` : acc;
      }, "")}\n}\n`
    : "";
}

/**
 * @param {Record<string, string>} object
 */
function reduceObject(object) {
  return Object.entries(object).reduce((acc, [key, value]) => {
    return value ? `${acc}${key} '${value}'\n` : acc;
  }, "");
}

/**
 * @typedef {Object} ResourceManifest
 * @property {string[]} [client_scripts]
 * @property {string[]} [server_scripts]
 * @property {string[]} [files]
 * @property {string[]} [dependencies]
 * @property {Object<string, string>} [metadata]
 */

/**
 * @param {ResourceManifest} ResourceManifest
 */
export async function createFxmanifest({ client_scripts, server_scripts, files, dependencies, metadata }) {
  const pkg = await readJson("package.json");
  const fxmanifest = {
    name: pkg.name,
    author: pkg.author,
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository?.url,
    description: pkg.description,
    fx_version: "cerulean",
    game: "gta5",
    ...(metadata || {}),
  };

  let output = reduceObject(fxmanifest);
  output += reduceArray("files", files);
  output += reduceArray("dependencies", dependencies);
  output += reduceArray("client_scripts", client_scripts);
  output += reduceArray("server_scripts", server_scripts);

  await writeFile("fxmanifest.lua", output);

  return output;
}
