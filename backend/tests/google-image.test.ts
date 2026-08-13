import { describe,expect,it } from "vitest";
import { buildTopikImagePrompt,renderChartSvg } from "../src/google-image.js";

describe("listening visual generation",()=>{
  it("wraps scene prompts in a consistent TOPIK illustration style",()=>{
    const prompt=buildTopikImagePrompt("A woman points to a bus stop.");
    expect(prompt).toContain("Black-and-white clean line art");
    expect(prompt).toContain("A woman points to a bus stop.");
    expect(prompt).toContain("Do not add captions");
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
