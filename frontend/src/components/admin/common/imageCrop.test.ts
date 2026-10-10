import { afterEach, describe, expect, it, vi } from "vitest";
import { cropGeometry, cropImage } from "./imageCrop";

afterEach(() => vi.restoreAllMocks());

describe("admin image crop geometry", () => {
  it("centers and clamps a landscape image inside a 4:3 viewport", () => {
    const centered = cropGeometry(
      { width: 2_400, height: 1_200 },
      { width: 800, height: 600 },
      1,
      { x: 0, y: 0 },
    );
    expect(centered.source).toMatchObject({ x: 400, y: 0, width: 1_600, height: 1_200 });
    expect(centered.output).toEqual({ width: 1_600, height: 1_200 });

    const movedPastEdge = cropGeometry(
      { width: 2_400, height: 1_200 },
      { width: 800, height: 600 },
      1,
      { x: 999, y: 999 },
    );
    expect(movedPastEdge.offset).toEqual({ x: 200, y: 0 });
    expect(movedPastEdge.source.x).toBe(0);
  });

  it("centers and clamps a portrait image without upscaling its output", () => {
    const centered = cropGeometry(
      { width: 900, height: 1_600 },
      { width: 800, height: 600 },
      1,
      { x: 0, y: 0 },
    );
    expect(centered.source).toMatchObject({ x: 0, y: 462.5, width: 900, height: 675 });
    expect(centered.output).toEqual({ width: 900, height: 675 });

    const zoomed = cropGeometry(
      { width: 900, height: 1_600 },
      { width: 800, height: 600 },
      2,
      { x: 0, y: -10_000 },
    );
    expect(zoomed.source.y + zoomed.source.height).toBeCloseTo(1_600);
    expect(zoomed.output.width).toBeLessThanOrEqual(zoomed.source.width);
    expect(zoomed.output.height).toBeLessThanOrEqual(zoomed.source.height);
    expect(zoomed.output.width / zoomed.output.height).toBe(4 / 3);
  });

  it.each([
    ["reading", "image/webp", "webp", 1600, 1200],
    ["listening", "image/png", "png", 440, 330],
  ] as const)("exports a capped 4:3 image for %s", async (output, mimeType, extension, width, height) => {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "", fillRect, drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["cropped"], { type: mimeType }));
    });
    const image = document.createElement("img");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 3_200 },
      naturalHeight: { configurable: true, value: 2_400 },
    });

    const result = await cropImage(
      new File(["source"], "graph.png", { type: "image/png" }),
      image,
      { width: 800, height: 600 },
      1,
      { x: 0, y: 0 },
      output,
    );

    expect(result).toMatchObject({ name: `graph-cropped.${extension}`, type: mimeType });
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 3_200, 2_400, 0, 0, width, height);
    expect(fillRect).toHaveBeenCalledWith(0, 0, width, height);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function),mimeType,output === "reading" ? 0.92 : undefined);
  });
  it("does not enlarge small listening crops", () => {
    expect(cropGeometry({width:200,height:150},{width:800,height:600},1,{x:0,y:0},"listening").output)
      .toEqual({width:200,height:150});
  });
});
