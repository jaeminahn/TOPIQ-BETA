import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressExistingImages, digest, optimizedPrefix, preparedSchema, rollbackImages,
  type BackfillIO, type ImageAsset, type PreparedImage,
} from "../../scripts/listening-image-backfill.js";
import { parseArguments, readRollbackReport, targetFingerprint } from "../../scripts/compress-listening-images.js";

let original: Buffer;
let asset: ImageAsset;
let current: ImageAsset;
let objects: Map<string, Buffer>;
let events: Record<string, unknown>[];
let io: BackfillIO;
const journal = vi.fn(async (event: Record<string, unknown>) => { events.push(event); });
const prepared = () => events.filter((event) => event.type === "prepared").map((event) => preparedSchema.parse(event));

beforeEach(async () => {
  original = await sharp({ create: { width: 800, height: 600, channels: 3, background: "white" } }).png().toBuffer();
  asset = { id: "11111111-1111-4111-8111-111111111111", bucket: "images", path: "listening/original.png",
    url: "https://example.test/original.png", mimeType: "image/png", byteSize: original.length };
  current = { ...asset };
  objects = new Map([[asset.path, original]]);
  events = [];
  journal.mockClear();
  io = {
    download: vi.fn(async (_bucket, path) => {
      const data = objects.get(path);
      if (!data) throw new Error("missing");
      return data;
    }),
    upload: vi.fn(async (_bucket, path, data) => { objects.set(path, data); }),
    publicUrl: (_bucket, path) => `https://example.test/${path}`,
    replace: vi.fn(async (before, after) => {
      if (JSON.stringify(current) !== JSON.stringify(before)) return false;
      current = { ...after };
      return true;
    }),
    current: vi.fn(async () => current),
  };
});

describe("existing listening image compression", () => {
  it("previews real savings without writing storage or DB", async () => {
    const totals = await compressExistingImages([asset], false, io, journal);
    expect(totals).toMatchObject({ scanned: 1, changed: 1, failed: 0, originalBytes: original.length });
    expect(totals.compressedBytes).toBeLessThan(original.length);
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.replace).not.toHaveBeenCalled();
    expect(prepared()).toHaveLength(0);
    expect(objects.size).toBe(1);
  });

  it("journals before writing, verifies uploaded bytes, and retains the original", async () => {
    vi.mocked(io.upload).mockImplementation(async (_bucket, path, data) => {
      expect(prepared()).toHaveLength(1);
      expect(prepared()[0]?.after.path).toBe(path);
      expect(io.replace).not.toHaveBeenCalled();
      objects.set(path, data);
    });
    const totals = await compressExistingImages([asset], true, io, journal);
    expect(totals.failed).toBe(0);
    expect(current).toMatchObject({ id: asset.id, mimeType: "image/webp" });
    expect(current.path.startsWith(optimizedPrefix)).toBe(true);
    expect(current.byteSize).toBe(objects.get(current.path)!.length);
    expect(await sharp(objects.get(current.path)!).metadata()).toMatchObject({ format: "webp", width: 440, height: 330 });
    expect(objects.get(asset.path)).toEqual(original);
    expect(prepared()[0]?.sourceSha256).toBe(digest(original));
  });

  it("does not recompress an already migrated path", async () => {
    await compressExistingImages([asset], true, io, journal);
    vi.mocked(io.download).mockClear();
    expect(await compressExistingImages([current], true, io, journal)).toMatchObject({ changed: 0, skipped: 1 });
    expect(io.download).not.toHaveBeenCalled();
  });

  it("skips newly uploaded small WebP files", async () => {
    objects.set(asset.path, await sharp(original).resize(440,330).webp({quality:85}).toBuffer());
    expect(await compressExistingImages([asset], true, io, journal)).toMatchObject({ changed: 0, skipped: 1 });
    expect(io.upload).not.toHaveBeenCalled();
  });

  it.each(["download", "decode", "upload", "verification", "conflict"])("keeps the original binding on %s failure", async (failure) => {
    if (failure === "download") objects.clear();
    if (failure === "decode") objects.set(asset.path, Buffer.from("broken"));
    if (failure === "upload") vi.mocked(io.upload).mockRejectedValue(new Error("upload failed"));
    if (failure === "verification") vi.mocked(io.upload).mockImplementation(async (_bucket,path) => { objects.set(path,Buffer.from("wrong bytes")); });
    if (failure === "conflict") vi.mocked(io.replace).mockResolvedValue(false);
    expect(await compressExistingImages([asset], true, io, journal)).toMatchObject({ changed: 0, failed: 1 });
    expect(current).toEqual(asset);
    if (failure !== "conflict") expect(io.replace).not.toHaveBeenCalled();
  });

  it("continues with the next asset after a failed image", async () => {
    const invalid = { ...asset, id: "22222222-2222-4222-8222-222222222222", path: "missing.png" };
    expect(await compressExistingImages([invalid, asset], true, io, journal))
      .toMatchObject({ scanned: 2, changed: 1, failed: 1 });
  });

  it("does not upload if the recovery record cannot be persisted", async () => {
    await expect(compressExistingImages([asset], true, io, async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.replace).not.toHaveBeenCalled();
  });
});

describe("image rollback", () => {
  it("restores from the prepared record even if a DB commit acknowledgement was lost", async () => {
    vi.mocked(io.replace).mockImplementationOnce(async (_before,after) => {
      current = {...after};
      throw new Error("connection lost after commit");
    });
    expect(await compressExistingImages([asset], true, io, journal)).toMatchObject({ failed: 1 });
    const replacements = prepared();
    expect(await rollbackImages(replacements, io, journal)).toMatchObject({ restored: 1, failed: 0 });
    expect(current).toEqual(asset);
    expect(objects.size).toBe(2);
    expect(await rollbackImages(replacements, io, journal)).toMatchObject({ restored: 0, skipped: 1 });
  });

  it("does not overwrite a later administrator replacement", async () => {
    await compressExistingImages([asset], true, io, journal);
    current = {...current,path:"new-admin-image.webp"};
    expect(await rollbackImages(prepared(), io, journal)).toMatchObject({ restored: 0, skipped: 1 });
    expect(current.path).toBe("new-admin-image.webp");
  });

  it("does not switch back to a missing or changed original", async () => {
    await compressExistingImages([asset], true, io, journal);
    objects.set(asset.path,Buffer.from("changed"));
    expect(await rollbackImages(prepared(), io, journal)).toMatchObject({ restored: 0, failed: 1 });
    expect(current.path.startsWith(optimizedPrefix)).toBe(true);
  });
});

describe("maintenance CLI and reports", () => {
  it("defaults to read-only preview and accepts pnpm argument separators", () => {
    expect(parseArguments([])).toMatchObject({apply:false,rollback:undefined});
    expect(parseArguments(["--","--apply","--limit","10"])).toMatchObject({apply:true,limit:10});
  });
  it.each([["--apply","--dry-run"],["--apply","--rollback","run.jsonl"],
    ["--limit","0"],["--limit","1.5"],["--rollback","run.jsonl","--limit","10"],["--typo"]])(
    "rejects invalid options %j", (...args) => { expect(() => parseArguments(args)).toThrow(); },
  );
  it("binds reports to the DB and storage while allowing credential rotation", () => {
    const fingerprint = targetFingerprint("postgres://user:old@db:5432/name","https://storage.test");
    expect(targetFingerprint("postgres://user:new@db/name","https://storage.test")).toBe(fingerprint);
    expect(targetFingerprint("postgres://user:new@other/name","https://storage.test")).not.toBe(fingerprint);
  });
  it("rejects dry-run and wrong-target reports", () => {
    expect(() => readRollbackReport(JSON.stringify({type:"header",version:1,mode:"dry-run",target:"x"})+"\n","x")).toThrow();
    expect(() => readRollbackReport(JSON.stringify({type:"header",version:1,mode:"apply",target:"x"})+"\n","other")).toThrow();
  });
  it("recovers flushed prepared records after an interrupted final line", async () => {
    await compressExistingImages([asset], true, io, journal);
    const record: PreparedImage = prepared()[0]!;
    const text = [JSON.stringify({type:"header",version:1,mode:"apply",target:"x"}),JSON.stringify(record),'{"type":'].join("\n");
    const warn = vi.spyOn(console,"warn").mockImplementation(() => undefined);
    try { expect(readRollbackReport(text,"x")).toEqual([record]); }
    finally { warn.mockRestore(); }
  });
});
