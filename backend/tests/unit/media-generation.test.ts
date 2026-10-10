import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/core/db.js", () => ({pool:{connect:vi.fn()}}));
vi.mock("../../src/media/cleanup-worker.js", () => ({mediaCleanupWorker:{kick:vi.fn()}}));
vi.mock("../../src/core/config.js", async (original) => ({config:{...(await original<typeof import("../../src/core/config.js")>()).config,mediaGenerationTimeoutMs:50}}));
import { pool } from "../../src/core/db.js";
import { TtsService } from "../../src/listening/tts-service.js";
import { VisualService } from "../../src/media/visual-service.js";
import { withGeneration } from "../../src/media/generation.js";
import { MediaCommitUncertainError } from "../../src/core/errors.js";

const targets = [{item_id:"item-1",item_version:1,position:1,question_prompt:"질문",dialogue_turns:[{speaker:"남자",text:"안녕하세요."}]}];
const style = {speakingRate:1,stylePrompt:""};
let cached = false;
const query = vi.fn(async (sql:string, _values?:unknown[]) => {
  if (sql.includes("pg_try_advisory_lock")) return {rows:[{locked:true}],rowCount:1};
  if (sql.includes("WHERE model_name")) return {rows:cached ? [{audio_asset_id:"cached"}] : [],rowCount:cached ? 1 : 0};
  if (sql.includes("FOR UPDATE")) return {rows:[{}],rowCount:1};
  return {rows:[],rowCount:0};
});
const client = Object.assign(new EventEmitter(),{query,release:vi.fn()});
const resolveAudioGroup = vi.fn();
const bindVisualAsset = vi.fn();
const visualGenerationTarget = vi.fn();
const synthesize = vi.fn(), synthesizeLiteral = vi.fn(), compose = vi.fn(), generate = vi.fn();
const uploadAudio = vi.fn(), uploadMedia = vi.fn(), removeObject = vi.fn();
const storage = () => ({uploadAudio,uploadMedia,removeObject}) as never;
const tts = () => new TtsService({synthesize,synthesizeLiteral} as never,storage,{resolveAudioGroup} as never,compose);
const visual = () => new VisualService({generate} as never,storage,{visualGenerationTarget,bindVisualAsset} as never);
const visualInput = {adminUserId:"admin",itemId:"item",itemVersion:1,optionNumber:1,visualRole:"choice" as const,forceRegenerate:false};

beforeEach(() => {
  vi.clearAllMocks(); cached=false;
  vi.mocked(pool.connect).mockResolvedValue(client as never);
  resolveAudioGroup.mockReset().mockResolvedValue(targets);
  synthesizeLiteral.mockReset().mockResolvedValue(Buffer.from("speech"));
  compose.mockReset().mockResolvedValue({audio:Buffer.from("mp3"),durationMs:1000});
  uploadAudio.mockReset().mockResolvedValue({bucket:"audio",path:"new-audio",url:"url"});
  uploadMedia.mockReset().mockResolvedValue({bucket:"media",path:"new-image",url:"url"});
  removeObject.mockReset().mockResolvedValue(undefined);
  generate.mockReset().mockResolvedValue({data:Buffer.from("image"),mimeType:"image/png",extension:"png"});
  visualGenerationTarget.mockReset().mockResolvedValue({promptSnapshot:{imagePrompt:"draw"},asset:null});
  bindVisualAsset.mockReset().mockResolvedValue({visualAssetId:"image-new",url:"url"});
});

describe("direct media generation", () => {
  it("finishes audio before returning, without a transaction during external calls", async () => {
    uploadAudio.mockImplementation(async () => {
      expect(query.mock.calls.some(([sql])=>sql==="BEGIN")).toBe(false);
      return {bucket:"audio",path:"new-audio",url:"url"};
    });
    expect(await tts().generateGroup("admin","set","item-1",false,style)).toMatchObject({positions:[1],reused:false});
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(query.mock.calls.some(([sql])=>sql.includes("generation_jobs"))).toBe(false);
    expect(removeObject).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(false);
  });
  it("reuses cached audio, but forced regeneration uses a new recording and object", async () => {
    cached=true;
    expect(await tts().generateGroup("admin","set","item-1",false,style)).toMatchObject({audioAssetId:"cached",reused:true});
    expect(synthesizeLiteral).not.toHaveBeenCalled();
    const next = await tts().generateGroup("admin","set","item-1",true,style);
    expect(next.audioAssetId).not.toBe("cached");
    expect(uploadAudio.mock.calls[0]![0]).toContain(next.audioAssetId);
  });
  it("rolls back changed questions and removes only the new upload", async () => {
    resolveAudioGroup.mockResolvedValueOnce(targets).mockResolvedValueOnce([{...targets[0],item_version:2}]);
    await expect(tts().generateGroup("admin","set","item-1",true,style)).rejects.toMatchObject({code:"QUESTION_VERSION_CONFLICT"});
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(removeObject).toHaveBeenCalledWith("audio","new-audio");
  });
  it("does not remove reused audio when the target changed", async () => {
    cached=true;
    resolveAudioGroup.mockResolvedValueOnce(targets).mockResolvedValueOnce([]);
    await expect(tts().generateGroup("admin","set","item-1",false,style)).rejects.toMatchObject({code:"QUESTION_VERSION_CONFLICT"});
    expect(removeObject).not.toHaveBeenCalled();
  });
  it("rejects concurrent requests without invoking the provider", async () => {
    query.mockResolvedValueOnce({rows:[{locked:false}],rowCount:1});
    await expect(tts().generateGroup("admin","set","item-1",false,style)).rejects.toMatchObject({code:"GENERATION_BUSY",statusCode:409});
    expect(synthesizeLiteral).not.toHaveBeenCalled();
  });
  it("propagates cancellation to the image provider and releases the lock after it stops", async () => {
    generate.mockImplementation((_prompt,_kind,signal:AbortSignal)=>new Promise((_resolve,reject)=>{
      signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
    }));
    await expect(visual().generate(visualInput)).rejects.toMatchObject({code:"GENERATION_TIMEOUT",statusCode:504});
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_unlock"),["media-generation:visual"]);
  });
  it("releases and discards the connection when unlocking fails", async () => {
    query.mockResolvedValueOnce({rows:[{locked:true}],rowCount:1}).mockRejectedValueOnce(new Error("connection lost"));
    await withGeneration("visual",async()=>"done");
    expect(client.release).toHaveBeenCalledWith(true);
  });
  it("returns an existing image without paying for another generation", async () => {
    visualGenerationTarget.mockResolvedValue({promptSnapshot:{},asset:{visualAssetId:"existing",url:"url"}});
    expect(await visual().generate(visualInput)).toEqual({visualAssetId:"existing",url:"url",reused:true});
    expect(generate).not.toHaveBeenCalled();
  });
  it("renders chart choices without an external image call", async () => {
    visualGenerationTarget.mockResolvedValue({promptSnapshot:{itemType:"visual_chart",chartSpec:{title:"test",labels:["A"],values:[10]}},asset:null});
    expect(await visual().generate(visualInput)).toMatchObject({reused:false});
    expect(generate).not.toHaveBeenCalled();
    expect(uploadMedia).toHaveBeenCalledWith(expect.stringContaining(".svg"),expect.any(Buffer),"image/svg+xml");
  });
  it("cleans up image uploads when binding fails without retrying generation", async () => {
    bindVisualAsset.mockRejectedValue(new Error("changed"));
    await expect(visual().generate(visualInput)).rejects.toThrow("changed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(removeObject).toHaveBeenCalledTimes(1);
  });
  it("does not change bindings on upload failure", async () => {
    uploadMedia.mockRejectedValue(new Error("storage down"));
    await expect(visual().generate(visualInput)).rejects.toThrow("storage down");
    expect(bindVisualAsset).not.toHaveBeenCalled();
  });
  it.each(["speech", "composition", "upload"])("cancels TTS %s before releasing the generation lease", async (stage) => {
    let stopped = false;
    const waitForAbort = (signal: AbortSignal) => new Promise<never>((_resolve,reject)=>{
      signal.addEventListener("abort",()=>{stopped=true;reject(signal.reason);},{once:true});
    });
    const cancellableStorage = (signal?:AbortSignal) => ({uploadAudio:(...args:Parameters<typeof uploadAudio>)=>
      stage === "upload" ? waitForAbort(signal!) : uploadAudio(...args),removeObject}) as never;
    if (stage === "speech") synthesizeLiteral.mockImplementation((_turn,_style,options)=>waitForAbort(options.signal));
    if (stage === "composition") compose.mockImplementation((_parts,signal)=>waitForAbort(signal));
    const service = new TtsService({synthesizeLiteral} as never,cancellableStorage,{resolveAudioGroup} as never,compose);
    await expect(service.generateGroup("admin","set","item-1",true,style)).rejects.toMatchObject({code:"GENERATION_TIMEOUT"});
    expect(stopped).toBe(true);
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledWith(false);
  });
  it("preserves a possibly committed image if the commit acknowledgement was lost", async () => {
    bindVisualAsset.mockRejectedValue(new MediaCommitUncertainError());
    await expect(visual().generate(visualInput)).rejects.toMatchObject({code:"MEDIA_COMMIT_UNCERTAIN"});
    expect(removeObject).not.toHaveBeenCalled();
  });
});
