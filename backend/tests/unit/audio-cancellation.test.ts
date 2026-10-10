import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
vi.mock("node:child_process",()=>({spawn:vi.fn()}));
import { spawn } from "node:child_process";
import { composeExamTrack, createSilenceWave } from "../../src/listening/audio-composer.js";

describe("FFmpeg cancellation",()=>{
  it("kills the child and waits for close before returning the timeout",async()=>{
    let started!:()=>void;
    const starting = new Promise<void>((resolve)=>{started=resolve;});
    const child = Object.assign(new EventEmitter(),{stderr:new EventEmitter(),kill:vi.fn()});
    vi.mocked(spawn).mockImplementation(()=>{started();return child as never;});
    const controller = new AbortController();
    const reason = new Error("timed out");
    const data = createSilenceWave(10,{audioFormat:1,channels:1,sampleRate:24000,byteRate:48000,blockAlign:2,bitsPerSample:16,dataBytes:0});
    const composing = composeExamTrack([{kind:"audio",data}],controller.signal);
    let settled = false;
    const result = composing.then(()=>{settled=true;},error=>{settled=true;return error;});
    await starting;
    controller.abort(reason);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit("close",null);
    expect(await result).toBe(reason);
  });
});
