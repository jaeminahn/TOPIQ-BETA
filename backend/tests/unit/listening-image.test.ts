import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compressListeningImage } from "../../src/media/listening-image.js";

describe("listening image compression", () => {
  it.each(["png", "jpeg", "webp"] as const)("converts %s to a 440x330 WebP", async (format) => {
    const input = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "white" } }).toFormat(format).toBuffer();
    const image = await compressListeningImage(input);
    expect(image).toMatchObject({ mimeType: "image/webp", extension: "webp" });
    expect(await sharp(image.data).metadata()).toMatchObject({ format: "webp", width: 440, height: 330 });
    expect(image.data.length).toBeLessThan(input.length);
  });

  it.each([[1000, 2000, 165, 330], [2000, 1000, 440, 220], [200, 150, 200, 150]])(
    "preserves aspect ratio and never enlarges %ix%i", async (width, height, expectedWidth, expectedHeight) => {
      const input = await sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();
      const { data } = await compressListeningImage(input);
      expect(await sharp(data).metadata()).toMatchObject({ width: expectedWidth, height: expectedHeight });
    },
  );

  it("applies EXIF orientation before sizing and removes orientation metadata", async () => {
    const input = await sharp({ create: { width: 800, height: 400, channels: 3, background: "white" } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const { data } = await compressListeningImage(input);
    const metadata = await sharp(data).metadata();
    expect(metadata).toMatchObject({ width: 165, height: 330 });
    expect(metadata.orientation).toBeUndefined();
  });

  it("rejects corrupt image data", async () => {
    await expect(compressListeningImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
