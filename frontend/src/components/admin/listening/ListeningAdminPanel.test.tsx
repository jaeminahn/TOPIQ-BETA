import { fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { adminApi } from "../../../api";
import { I18nProvider } from "../../../i18n";
import type { AdminListeningGroup, AdminListeningSet } from "../../../types";
import { ListeningAdminPanel } from "./ListeningAdminPanel";

vi.mock("../../../api",()=>({adminApi:{
  listeningItems:vi.fn(),registerListeningSet:vi.fn(),audioUrl:vi.fn(),generateGroup:vi.fn(),generateSet:vi.fn(),
  uploadVisual:vi.fn(),
}}));
vi.mock("../common/AdminImageCropDialog",()=>({
  AdminImageCropDialog:({title,onCancel,onConfirm}:{title:string;onCancel:()=>void;onConfirm:(file:File)=>void})=><div role="dialog"><h2>{title}</h2><button onClick={onCancel}>크롭 취소</button><button onClick={()=>onConfirm(new File(["cropped"],"cropped.webp",{type:"image/webp"}))}>크롭 후 업로드</button></div>,
}));

const linked:AdminListeningSet={setId:"10000000-0000-4000-8000-000000000001",setSequence:1,createdAt:"2026-08-10T00:00:00Z",reviewStatus:"reviewed",publishedAt:"2026-08-10T00:00:00Z",itemCount:50,validItemCount:50,audioReady:50,visualRequired:12,visualReady:12,mockTestId:"20000000-0000-4000-8000-000000000001",slug:"topik-ii-listening-1",titleKo:"TOPIK II 듣기 모의고사 1회",mockTestPublished:true,round:1,readyToRegister:false,readyToPublish:true,blockingReasons:[]};
const pending:AdminListeningSet={...linked,setId:"10000000-0000-4000-8000-000000000003",setSequence:2,createdAt:"2026-08-12T00:00:00Z",audioReady:0,visualReady:0,mockTestId:null,slug:null,titleKo:null,mockTestPublished:null,round:null,readyToRegister:true,readyToPublish:false};
const readyGroup:AdminListeningGroup={
  setId:linked.setId,positions:[1],leaderItemId:"item-1",leaderItemVersion:1,
  itemType:"listen_and_choose",dialogueTurns:[{speaker:"여자",text:"안녕하세요."}],questionPrompts:["들은 내용과 같은 것을 고르십시오."],repeatCount:2,
  audioAssetId:"audio-1",audioStorageUrl:"storage/audio-1.mp3",audioStatus:"ready",targets:[],
  narrationVersion:"exam_track_v4",appliedScript:{version:"exam_track_v4",kind:"single",positions:[1],segments:[
    {kind:"bell"},
    {kind:"silence",durationMs:1000},
    {kind:"speech",role:"instruction",speaker:"여자",text:"1번. 들은 내용과 같은 것을 고르십시오."},
    {kind:"silence",durationMs:1000},
    {kind:"dialogue",repeatIndex:1,turns:[{speaker:"여자",text:"안녕하세요."}]},
  ]},generationScript:null,
  generationJobId:null,generationStatus:null,generationTtsStyle:null,lastError:null,
  ttsStyle:{speakingRate:.9,stylePrompt:"차분하게"},
};
const missingGroup:AdminListeningGroup={
  ...readyGroup,positions:[2],leaderItemId:"item-2",audioAssetId:null,audioStorageUrl:null,audioStatus:"missing",ttsStyle:null,
  narrationVersion:null,appliedScript:null,
};

describe("ListeningAdminPanel",()=>{
  beforeEach(()=>{
    vi.mocked(adminApi.listeningItems).mockReset();vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[]});
    vi.mocked(adminApi.registerListeningSet).mockReset();vi.mocked(adminApi.registerListeningSet).mockResolvedValue({mockTestId:"mock",slug:"topik-ii-listening-2",round:2,published:false,created:true});
    vi.mocked(adminApi.audioUrl).mockReset();vi.mocked(adminApi.audioUrl).mockResolvedValue({audioUrl:"https://example.com/audio-1.mp3"});
    vi.mocked(adminApi.generateGroup).mockReset();vi.mocked(adminApi.generateGroup).mockResolvedValue({jobId:"job-1",queued:true,targetCount:1});
    vi.mocked(adminApi.generateSet).mockReset();vi.mocked(adminApi.generateSet).mockResolvedValue({queued:1,jobIds:["job-2"]});
    vi.mocked(adminApi.uploadVisual).mockReset();vi.mocked(adminApi.uploadVisual).mockResolvedValue({visualAssetId:"asset-1",url:"https://example.com/choice.webp"});
    vi.spyOn(window,"confirm").mockReturnValue(true);
  });

  it("shows listening rounds before loading a selected round",async()=>{
    render(<ListeningAdminPanel token="token" sets={[linked,pending]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    expect(screen.getAllByTestId("listening-set-card")).toHaveLength(2);
    await userEvent.click(within(screen.getAllByTestId("listening-set-card")[0]!).getByRole("button",{name:"문항 보기"}));
    await waitFor(()=>expect(adminApi.listeningItems).toHaveBeenCalledWith("token",{setId:linked.setId}));
    expect(screen.getByRole("heading",{name:"듣기 1회 · 문항 관리"})).toBeInTheDocument();
  });

  it("pauses background polling while a question is being edited",async()=>{
    const editableGroup:AdminListeningGroup={...readyGroup,targets:[{
      itemId:"item-1",itemVersion:1,position:1,itemType:"listen_and_choose",
      questionPrompt:"들은 내용과 같은 것을 고르십시오.",stem:"",choices:["하나","둘","셋","넷"],
      correctAnswer:1,explanation:"해설",contentJson:{question_prompt:"들은 내용과 같은 것을 고르십시오.",dialogue_turns:readyGroup.dialogueTurns,repeat_count:1},
      visualOptionCount:0,visualReadyCount:0,visualOptions:[],
    }]};
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[editableGroup]});
    const setIntervalSpy=vi.spyOn(window,"setInterval");
    const clearIntervalSpy=vi.spyOn(window,"clearInterval");
    render(<I18nProvider><ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/></I18nProvider>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await screen.findByRole("heading",{name:"듣기 1회 · 문항 관리"});
    expect(setIntervalSpy).toHaveBeenCalled();
    const pollingCount=setIntervalSpy.mock.calls.filter((call)=>call[1]===4000).length;

    await userEvent.click(screen.getByRole("button",{name:/1번 .*수정/}));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(setIntervalSpy.mock.calls.filter((call)=>call[1]===4000)).toHaveLength(pollingCount);
    await userEvent.click(screen.getByRole("button",{name:"취소"}));
    expect(setIntervalSpy.mock.calls.filter((call)=>call[1]===4000).length).toBeGreaterThan(pollingCount);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("registers a detected SQL set as a draft round",async()=>{
    const changed=vi.fn().mockResolvedValue(undefined);
    render(<ListeningAdminPanel token="token" sets={[pending]} onSetsChanged={changed} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:/비공개 회차 생성/}));
    await waitFor(()=>expect(adminApi.registerListeningSet).toHaveBeenCalledWith("token",pending.setId));
    expect(changed).toHaveBeenCalled();
  });

  it("uses the shared round labels and status presentation",()=>{
    render(<ListeningAdminPanel token="token" sets={[linked,pending]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    expect(screen.getByText("등록 회차 1")).toBeInTheDocument();
    expect(screen.getByText("새 세트 1")).toBeInTheDocument();
    expect(screen.getByText("공개")).toBeInTheDocument();
    expect(screen.getByText("미등록")).toBeInTheDocument();
  });

  it("opens a fixed audio dock with the applied style when playback starts",async()=>{
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[readyGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"재생"}));

    expect(await screen.findByTestId("admin-listening-audio-dock")).toBeInTheDocument();
    await waitFor(()=>expect(document.querySelector("audio")).toHaveAttribute("src","https://example.com/audio-1.mp3"));
    expect(screen.getByText("적용값 0.90× · 차분하게")).toBeInTheDocument();
    expect(screen.getByText("1번. 들은 내용과 같은 것을 고르십시오.")).toBeInTheDocument();
  });

  it("confirms generation settings in the dock and locks playback immediately",async()=>{
    let resolveGeneration!:(value:{jobId:string|null;queued:boolean;targetCount:number})=>void;
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[readyGroup]});
    vi.mocked(adminApi.generateGroup).mockReturnValue(new Promise((resolve)=>{resolveGeneration=resolve;}));
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"음원 재생성"}));

    expect(adminApi.generateGroup).not.toHaveBeenCalled();
    const speakingRate = screen.getByLabelText("생성 말하기 속도");
    expect(speakingRate).toHaveAttribute("min", "0.8");
    expect(speakingRate).toHaveAttribute("max", "1.2");
    expect(speakingRate).toHaveAttribute("step", "0.025");
    fireEvent.change(speakingRate,{target:{value:"1.025"}});
    expect(screen.getByText("1.025×")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("음원 스타일"));
    await userEvent.type(screen.getByLabelText("음원 스타일"),"밝고 또렷하게");
    await userEvent.click(screen.getByRole("button",{name:"음원 재생성 시작"}));

    await waitFor(()=>expect(adminApi.generateGroup).toHaveBeenCalledWith("token",linked.setId,"item-1",true,{speakingRate:1.025,stylePrompt:"밝고 또렷하게"}));
    expect(screen.getByRole("button",{name:"재생"})).toBeDisabled();
    expect(screen.getByText("음원 생성 대기 중")).toBeInTheDocument();
    expect(document.querySelector("audio")).not.toBeInTheDocument();
    resolveGeneration({jobId:"job-1",queued:true,targetCount:1});
  });

  it("configures bulk generation in the dock and reports active job progress",async()=>{
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[missingGroup]});
    render(<ListeningAdminPanel token="token" sets={[pending]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"누락 음원 생성"}));

    expect(screen.getByText("1개 누락 음원 생성 설정")).toBeInTheDocument();
    expect(adminApi.generateSet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button",{name:"누락 음원 생성 시작"}));

    await waitFor(()=>expect(adminApi.generateSet).toHaveBeenCalledWith("token",pending.setId,false,{speakingRate:1,stylePrompt:""}));
    expect(await screen.findByText("1개 중 0개 완료 · 1개 진행 중")).toBeInTheDocument();
  });

  it("keeps the previous audio playable after regeneration fails",async()=>{
    const failedGroup:AdminListeningGroup={
      ...readyGroup,generationJobId:"job-failed",generationStatus:"failed",
      generationTtsStyle:{speakingRate:1.1,stylePrompt:"밝게"},lastError:"TTS provider failed",
    };
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[failedGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"음원 재생성"}));

    expect(screen.getByText("재생성 실패 · 기존 음원 유지")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"음원 재생"})).toBeEnabled();
  });

  it("removes the audio element when the dock is closed",async()=>{
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[readyGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"재생"}));
    await waitFor(()=>expect(document.querySelector("audio")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button",{name:"재생바 닫기"}));

    expect(document.querySelector("audio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-listening-audio-dock")).not.toBeInTheDocument();
  });

  it("marks legacy passage audio for regeneration while keeping it playable",async()=>{
    const legacyGroup:AdminListeningGroup={...readyGroup,audioStatus:"legacy",narrationVersion:"exam_track_v2",appliedScript:{
      version:"exam_track_v2",kind:"single",positions:[1],segments:[
        {kind:"speech",role:"instruction",speaker:"여자",text:"1번. 들은 내용과 같은 것을 고르십시오."},
        {kind:"dialogue",repeatIndex:1,turns:[{speaker:"여자",text:"안녕하세요."}]},
      ],
    }};
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[legacyGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    expect(await screen.findByText("구형 음원 · 재생성 필요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button",{name:"재생"}));
    expect(screen.getByText("생성 예정 순서")).toBeInTheDocument();
    expect(screen.getByText("띵동 벨")).toBeInTheDocument();
  });

  it("previews the bell and one-second gaps in the new common-question sequence",async()=>{
    const commonGroup:AdminListeningGroup={
      ...missingGroup,positions:[13,14],leaderItemId:"item-13",itemType:"paired_13_14",
      questionPrompts:["남자의 중심 생각을 고르십시오.","들은 내용과 같은 것을 고르십시오."],
    };
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[commonGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByRole("button",{name:"음원 생성"}));

    expect(screen.getByText("띵동 벨")).toBeInTheDocument();
    expect(screen.getByText("다음을 듣고 물음에 답하십시오.")).toBeInTheDocument();
    expect(screen.queryByText(/두 번 읽겠습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/13번에서 14번/)).not.toBeInTheDocument();
    expect(screen.getAllByText("다시 읽겠습니다.")).toHaveLength(1);
    expect(screen.getByText("지문 2회")).toBeInTheDocument();
    expect(screen.getAllByText("1초")).toHaveLength(6);
    expect(screen.getAllByText("13번.")).toHaveLength(1);
    expect(screen.getByText("14번.")).toBeInTheDocument();
  });

  it("copies a listening visual generation prompt",async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    const visualGroup:AdminListeningGroup={...readyGroup,targets:[{
      itemId:"item-1",itemVersion:1,position:1,itemType:"visual_chart",questionPrompt:"그래프를 고르십시오.",stem:"",choices:[],correctAnswer:1,explanation:"",contentJson:{},visualOptionCount:1,visualReadyCount:0,
      visualOptions:[{optionNumber:1,description:"선그래프",imagePrompt:"TOPIK 흑백 선그래프",chartSpec:{chart_type:"line"},visualAssetId:null,imageUrl:null,generationStatus:null,generationError:null}],
    }]};
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[visualGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByText("들은 내용과 같은 것을 고르십시오."));
    await userEvent.click(screen.getByRole("button",{name:"1번 1번 보기 생성 프롬프트 복사"}));
    expect(writeText).toHaveBeenCalledWith("TOPIK 흑백 선그래프");
  });

  it("crops a listening visual before uploading it",async()=>{
    const visualGroup:AdminListeningGroup={...readyGroup,targets:[{
      itemId:"item-1",itemVersion:1,position:1,itemType:"visual_scene",questionPrompt:"그림을 고르십시오.",stem:"",choices:[],correctAnswer:1,explanation:"",contentJson:{},visualOptionCount:1,visualReadyCount:0,
      visualOptions:[{optionNumber:1,description:"사무실",imagePrompt:"사무실 그림",chartSpec:null,visualAssetId:null,imageUrl:null,generationStatus:null,generationError:null}],
    }]};
    vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[visualGroup]});
    render(<ListeningAdminPanel token="token" sets={[linked]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:"문항 보기"}));
    await userEvent.click(await screen.findByText("들은 내용과 같은 것을 고르십시오."));
    const input=screen.getByLabelText("1번 1번 보기 업로드").querySelector("input")!;
    await userEvent.upload(input,new File(["image"],"choice.png",{type:"image/png"}));

    expect(screen.getByRole("heading",{name:"1번 1번 보기 크롭"})).toBeInTheDocument();
    expect(adminApi.uploadVisual).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button",{name:"크롭 후 업로드"}));
    await waitFor(()=>expect(adminApi.uploadVisual).toHaveBeenCalledWith("token","item-1",1,1,expect.objectContaining({type:"image/webp"})));
  });
});
