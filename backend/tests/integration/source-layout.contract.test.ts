import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");

describe("backend source layout", () => {
  it("keeps only composition and executable entry points at the source root", async () => {
    const entries = await readdir(sourceRoot, { withFileTypes: true });
    const rootTypescript = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(rootTypescript).toEqual([
      "app.ts",
      "bootstrap-admin.ts",
      "migrate.ts",
      "seed-listening-assets.ts",
      "server.ts",
    ]);
  });

  it("keeps core independent from feature modules", async () => {
    const coreRoot = resolve(sourceRoot, "core");
    const files = (await readdir(coreRoot)).filter((file) => file.endsWith(".ts"));
    const sources = await Promise.all(files.map((file) => readFile(resolve(coreRoot, file), "utf8")));

    for (const source of sources) expect(source).not.toMatch(/from ["']\.\.\//);
  });
});
