import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = resolve(projectRoot, "dist");
if (dirname(outputDirectory) !== projectRoot) {
  throw new Error("Refusing to clean a build directory outside the backend project");
}
rmSync(outputDirectory, { recursive: true, force: true });
