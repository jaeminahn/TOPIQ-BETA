import sharp from "sharp";

/** Final storage format for raster listening choices (displayed at 220px wide). */
export async function compressListeningImage(data: Buffer) {
  const compressed = await sharp(data)
    .autoOrient()
    .resize({ width: 440, height: 330, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
  return { data: compressed, mimeType: "image/webp", extension: "webp" };
}
