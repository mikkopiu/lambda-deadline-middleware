// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

/**
 * Build script using oxc-transform for TS → JS + .d.ts emit.
 *
 * This replaces `tsc` for emit while keeping `tsc --noEmit` for type checking.
 * oxc-transform is significantly faster because it only strips types and emits
 * isolated declarations — no whole-program type analysis.
 */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, relative, dirname } from "node:path";

import { transform } from "oxc-transform";

const SRC_DIR = "src";
const OUT_DIR = "dist";

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map((e) => join(e.parentPath, e.name));
};

const buildFile = async (filePath: string): Promise<void> => {
  const source = await readFile(filePath, "utf8");
  const relativePath = relative(SRC_DIR, filePath);

  const result = await transform(filePath, source, {
    typescript: {
      onlyRemoveTypeImports: true,
      declaration: {
        stripInternal: false,
      },
    },
    sourcemap: true,
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`${filePath}: ${error.message}`);
    }
    throw new Error(`Transform failed for ${filePath}`);
  }

  const jsPath = join(OUT_DIR, relativePath.replace(/\.ts$/u, ".js"));
  const dtsPath = join(OUT_DIR, relativePath.replace(/\.ts$/u, ".d.ts"));
  const mapPath = `${jsPath}.map`;
  const dtsMapPath = `${dtsPath}.map`;

  await mkdir(dirname(jsPath), { recursive: true });

  // Write JS output with sourcemap reference
  const jsContent = `${result.code}\n//# sourceMappingURL=${relative(dirname(jsPath), mapPath)}\n`;
  await writeFile(jsPath, jsContent);

  // Write JS source map
  if (result.map !== undefined) {
    await writeFile(mapPath, JSON.stringify(result.map));
  }

  // Write declaration file
  if (result.declaration !== undefined && result.declaration !== "") {
    const dtsContent = result.declarationMap
      ? `${result.declaration}\n//# sourceMappingURL=${relative(dirname(dtsPath), dtsMapPath)}\n`
      : result.declaration;
    await writeFile(dtsPath, dtsContent);

    if (result.declarationMap !== undefined) {
      await writeFile(dtsMapPath, JSON.stringify(result.declarationMap));
    }
  }
};

const main = async (): Promise<void> => {
  const start = performance.now();

  // Clean output directory
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const files = await collectFiles(SRC_DIR);
  await Promise.all(files.map(async (f) => buildFile(f)));

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`Built ${String(files.length)} files in ${elapsed}ms`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
