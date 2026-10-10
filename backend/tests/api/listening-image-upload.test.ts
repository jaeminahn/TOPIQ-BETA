import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/admin/auth.js", () => ({requireAdmin:vi.fn(async()=>({adminUserId:"admin"}))}));
vi.mock("../../src/media/storage.js", () => ({SupabaseStorage:vi.fn(class {
  uploadMedia = uploadMedia;
  removeObject = removeObject;
})}));

import { buildApp } from "../../src/app.js";
import type { AdminRepository } from "../../src/admin/repository.js";
import { MediaCommitUncertainError } from "../../src/core/errors.js";

const id = "11111111-1111-4111-8111-111111111111";
const uploadMedia = vi.fn(async (path:string, _data:Buffer, _mimeType:string) => ({bucket:"media",path,url:`https://example.test/${path}`}));
const removeObject = vi.fn(async (_bucket:string, _path:string) => undefined);
const bindVisualAsset = vi.fn();
const requireCurrentQuestionVersion = vi.fn();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  vi.clearAllMocks();
  bindVisualAsset.mockReset().mockResolvedValue({visualAssetId:id,url:"https://example.test/image.webp"});
  requireCurrentQuestionVersion.mockResolvedValue(undefined);
  app = await buildApp(undefined,{bindVisualAsset,requireCurrentQuestionVersion} as unknown as AdminRepository);
});
afterEach(async () => { await app?.close(); });

function upload(data:Buffer, mimeType = "image/png", role = "listening") {
  const boundary = "test-image-boundary";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method:"POST",
    url:role === "listening"
      ? `/v1/admin/listening/items/${id}/versions/1/visual-options/1`
      : `/v1/admin/reading/items/${id}/versions/1/visual-material`,
    headers:{authorization:"Bearer test","content-type":`multipart/form-data; boundary=${boundary}`},
    payload,
  });
}

const png = () => sharp({create:{width:800,height:600,channels:3,background:"white"}}).png().toBuffer();

describe("listening image upload", () => {
  it.each(["png","jpeg","webp"] as const)("stores a %s upload as a compact WebP with matching metadata", async (format) => {
    const input = await sharp(await png()).toFormat(format).toBuffer();
    const response = await upload(input,`image/${format}`);
    expect(response.statusCode).toBe(201);
    const [path, data, mimeType] = uploadMedia.mock.calls[0]!;
    expect(path).toMatch(/\.webp$/);
    expect(mimeType).toBe("image/webp");
    expect(await sharp(data).metadata()).toMatchObject({format:"webp",width:440,height:330});
    expect(bindVisualAsset).toHaveBeenCalledWith(expect.objectContaining({path,mimeType,byteSize:data.length,visualRole:"choice"}));
  });

  it("rejects corrupt images without uploading or changing the binding", async () => {
    const response = await upload(Buffer.from("broken image"));
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_IMAGE");
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(bindVisualAsset).not.toHaveBeenCalled();
  });

  it("preserves the original reading material", async () => {
    const input = await png();
    expect((await upload(input,"image/png","reading")).statusCode).toBe(201);
    expect(uploadMedia).toHaveBeenCalledWith(expect.stringMatching(/\.png$/),input,"image/png");
  });

  it.each([false,true])("preserves cleanup semantics when a commit is uncertain: %s", async (uncertain) => {
    bindVisualAsset.mockRejectedValue(uncertain ? new MediaCommitUncertainError() : new Error("binding failed"));
    expect((await upload(await png())).statusCode).toBe(uncertain ? 502 : 500);
    if (uncertain) expect(removeObject).not.toHaveBeenCalled();
    else expect(removeObject).toHaveBeenCalledWith("media",uploadMedia.mock.calls[0]![0]);
  });
});
