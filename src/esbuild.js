//@ts-check

import esbuild from "esbuild";
import { writeFile } from "fs/promises";
import { spawn } from "child_process";

/**
 * @param {boolean} watch
 * @param {esbuild.BuildOptions} baseOptions
 * @param {{ name: string; options: esbuild.BuildOptions }[]} environments
 * @param {(files: object) => Promise<void>} onBuild
 */
export async function createBuilder(watch, baseOptions, environments, onBuild) {
  let builder;
  const ctx = [];
  const outfiles = {};

  environments.forEach(async ({ name, options }) => {
    outfiles[name] = `dist/${name}.js`;

    ctx.push(
      await esbuild
        .context({
          bundle: true,
          entryPoints: [`${name}/index.ts`],
          outfile: outfiles[name],
          keepNames: true,
          legalComments: "inline",
          plugins: [
            {
              name: "build",
              setup(build) {
                build.onEnd((result) => {
                  if (!result || result.errors.length === 0)
                    console.log(`Successfully built ${build.initialOptions.outfile}`);
                });
              },
            },
          ],
          ...baseOptions,
          ...options,
        })
        .catch(() => process.exit(1))
    );
  });

  await Promise.all(ctx);

  builder = async () => {
    const promises = [];

    ctx.forEach((context) => {
      return promises.push(context.rebuild());
    });

    await Promise.all(promises);
    await writeFile(".yarn.installed", new Date().toISOString());
    await onBuild(outfiles);
  };

  const tsc = spawn(`tsc --build ${watch ? "--watch --preserveWatchOutput" : ""} && tsc-alias`, {
    stdio: ["inherit", "pipe", "inherit"],
    shell: true,
  });

  tsc.stdout.on("data", async (data) => {
    const output = data.toString();
    process.stdout.write(output);

    if (output.includes("Found 0 errors.")) {
      await builder();
    }
  });

  if (!watch) {
    tsc.on("close", async (code) => {
      if (code !== 0) return process.exit(code);

      await builder();

      process.exit(0);
    });
  }
}
