import esbuild from "esbuild";
import { writeFile } from "fs/promises";

/**
 * Creates a build process using esbuild.
 * @param watch - Whether to enable watch mode.
 * @param baseOptions - The base build options for esbuild.
 * @param environments - An array of environments with their names and esbuild options.
 * @param onBuild - A callback function that gets called after a successful build.
 */
export async function createBuilder(
  watch: boolean,
  baseOptions: esbuild.BuildOptions,
  environments: { name: string; options: esbuild.BuildOptions }[],
  onBuild: (files: Record<string, string>) => Promise<void>
): Promise<void> {
  const outfiles: Record<string, string> = {};
  const plugins: esbuild.Plugin[] = [
    {
      name: "build",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length === 0) {
            console.log(`Successfully built ${build.initialOptions.outfile}`);
          }
        });
      },
    },
  ];

  await Promise.all(
    environments.map(async ({ name, options }) => {
      outfiles[name] = `dist/${name}.js`;
      options = {
        bundle: true,
        entryPoints: [`./src/${name}/index.ts`],
        outfile: outfiles[name],
        keepNames: true,
        legalComments: "inline",
        treeShaking: true,
        ...baseOptions,
        ...options,
      };
      options.plugins = [...(options.plugins || []), ...plugins];

      const ctx = await esbuild.context(options).catch(() => process.exit(1));
      return watch ? ctx.watch() : ctx.rebuild();
    })
  );

  await writeFile(".yarn.installed", new Date().toISOString());
  await onBuild(outfiles);

  if (!watch) process.exit(0)
}
