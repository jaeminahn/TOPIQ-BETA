import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBackendRoot } from "../../src/core/config.js";

describe("backend configuration paths", () => {
  it("loads environment files from the backend root after source modules are grouped", () => {
    expect(resolveBackendRoot()).toBe(resolve(process.cwd()));
  });
});
