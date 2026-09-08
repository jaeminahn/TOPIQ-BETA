import { describe,expect,it } from "vitest";
import { AppError } from "../src/errors.js";
import { buildGeminiImageRequest,buildGoogleImageEndpoint,buildTopikImagePrompt,extractGeminiImage,renderChartSvg } from "../src/google-image.js";

describe("listening visual generation",()=>{
  it("wraps scene prompts in a consistent TOPIK illustration style",()=>{
    const prompt=buildTopikImagePrompt("A woman points to a bus stop.");
    expect(prompt).toContain("Black-and-white clean line art");
    expect(prompt).toContain("A woman points to a bus stop.");
    expect(prompt).toContain("Do not add captions");
  });

  it("uses the Vertex global generateContent endpoint for Gemini image generation",()=>{
    expect(buildGoogleImageEndpoint("project id","global","gemini-2.5-flash-image"))
      .toBe("https://aiplatform.googleapis.com/v1/projects/project%20id/locations/global/publishers/google/models/gemini-2.5-flash-image:generateContent");
  });

  it("wraps reading graph prompts without the listening-choice instructions",()=>{
    const prompt=buildTopikImagePrompt("독서 34%, 운동 28%", "reading_material");
    expect(prompt).toContain("reading-test statistical graph");
    expect(prompt).toContain("Copy every supplied title, label, number");
    expect(prompt).toContain("독서 34%, 운동 28%");
    expect(prompt).not.toContain("answer-choice illustration");
  });

  it("requests both text and image output in a 4:3 layout",()=>{
    const request=buildGeminiImageRequest("A woman points to a bus stop.");
    expect(request.generationConfig).toEqual({
      responseModalities:["TEXT","IMAGE"],
      candidateCount:1,
      imageConfig:{aspectRatio:"4:3"},
    });
    expect(request.contents[0]?.parts[0]?.text).toContain("A woman points to a bus stop.");
  });

  it("extracts inline image data from a Gemini response",()=>{
    const result=extractGeminiImage({candidates:[{content:{parts:[
      {text:"Here is the illustration."},
      {inlineData:{data:Buffer.from("image-bytes").toString("base64"),mimeType:"image/jpeg"}},
    ]}}]});
    expect(result.data.toString()).toBe("image-bytes");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("reports a Gemini safety block when no image is returned",()=>{
    expect(()=>extractGeminiImage({promptFeedback:{blockReason:"SAFETY",blockReasonMessage:"Prompt was blocked"}}))
      .toThrowError(new AppError(502,"IMAGE_PROVIDER_FAILED","Google Gemini image generation returned no image: Prompt was blocked"));
  });

  it("renders chart data exactly and escapes labels",()=>{
    const svg=renderChartSvg({title:"이용률 <조사>",unit:"%",labels:["2023년","2024년"],values:[31,45],chart_type:"line"}).toString();
    expect(svg).toContain("이용률 &lt;조사&gt;");
    expect(svg).toContain("2023년");
    expect(svg).toContain(">31<");
    expect(svg).toContain(">45<");
    expect(svg).not.toContain("<조사>");
  });
});
