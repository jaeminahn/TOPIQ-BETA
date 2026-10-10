import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/admin/auth.js", () => ({requireAdmin:vi.fn(async()=>({adminUserId:"admin"}))}));
vi.mock("../../src/listening/tts-service.js", () => ({ttsService:{generateGroup:vi.fn()}}));
vi.mock("../../src/media/visual-service.js", () => ({visualService:{generate:vi.fn()}}));
import { buildApp } from "../../src/app.js";
import { ttsService } from "../../src/listening/tts-service.js";
import { visualService } from "../../src/media/visual-service.js";
import { AppError } from "../../src/core/errors.js";

const id = "11111111-1111-4111-8111-111111111111";
const headers = {authorization:"Bearer test"};
let app: Awaited<ReturnType<typeof buildApp>>;
afterEach(async () => { await app?.close(); vi.clearAllMocks(); });

describe("direct generation API", () => {
  it("returns completed audio and image assets with 200", async () => {
    app = await buildApp();
    vi.mocked(ttsService.generateGroup).mockResolvedValue({audioAssetId:id,positions:[21,22],reused:false});
    vi.mocked(visualService.generate).mockResolvedValue({visualAssetId:id,url:"https://example.test/a.png",reused:true});
    const audio = await app.inject({method:"POST",url:`/v1/admin/listening/sets/${id}/audio-groups/${id}/tts`,headers,payload:{forceRegenerate:true,ttsStyle:{speakingRate:1.1,stylePrompt:"clear"}}});
    expect(audio.statusCode).toBe(200);
    expect(audio.json()).toEqual({audioAssetId:id,positions:[21,22],reused:false});
    expect(ttsService.generateGroup).toHaveBeenCalledWith("admin",id,id,true,{speakingRate:1.1,stylePrompt:"clear"});
    for (const path of [`listening/items/${id}/versions/1/visual-options/1`,`reading/items/${id}/versions/1/visual-material`]) {
      const image = await app.inject({method:"POST",url:`/v1/admin/${path}/generate`,headers,payload:{}});
      expect(image.statusCode).toBe(200);
      expect(image.json()).toEqual({visualAssetId:id,url:"https://example.test/a.png",reused:true});
    }
  });
  it("removes queue and version-alias routes and rejects the failed filter", async () => {
    app = await buildApp();
    for (const path of [
      `listening/sets/${id}/tts`, `listening/sets/${id}/visuals/generate`, `reading/sets/${id}/visuals/generate`,
      `listening/sets/${id}/versions/1/tts`, `listening/sets/${id}/versions/1/audio-groups/${id}/tts`,
      `listening/sets/${id}/versions/1/visuals/generate`, `reading/sets/${id}/versions/1/visuals/generate`,
    ]) expect((await app.inject({method:"POST",url:`/v1/admin/${path}`,headers})).statusCode).toBe(404);
    expect((await app.inject({url:"/v1/admin/tts/jobs",headers})).statusCode).toBe(404);
    const invalid = await app.inject({url:"/v1/admin/listening/items?status=failed",headers});
    expect(invalid.statusCode).toBe(400);
  });
  it.each([[409,"GENERATION_BUSY"],[504,"GENERATION_TIMEOUT"],[502,"TTS_PROVIDER_FAILED"]] as const)("returns %s for %s", async (status,code) => {
    app = await buildApp();
    vi.mocked(ttsService.generateGroup).mockRejectedValue(new AppError(status,code,"generation failed"));
    const response = await app.inject({method:"POST",url:`/v1/admin/listening/sets/${id}/audio-groups/${id}/tts`,headers});
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
  });
});
