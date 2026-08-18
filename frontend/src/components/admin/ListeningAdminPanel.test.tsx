import { render,screen,waitFor,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { adminApi } from "../../api";
import type { AdminListeningSet } from "../../types";
import { ListeningAdminPanel } from "./ListeningAdminPanel";

vi.mock("../../api",()=>({adminApi:{listeningItems:vi.fn(),registerListeningSet:vi.fn()}}));

const linked:AdminListeningSet={setId:"10000000-0000-4000-8000-000000000001",setVersion:1,setSequence:1,createdAt:"2026-08-10T00:00:00Z",reviewStatus:"reviewed",publishedAt:"2026-08-10T00:00:00Z",itemCount:50,validItemCount:50,audioReady:50,visualRequired:12,visualReady:12,mockTestId:"20000000-0000-4000-8000-000000000001",slug:"topik-ii-listening-1",titleKo:"TOPIK II 듣기 모의고사 1회",mockTestPublished:true,round:1,readyToRegister:false,readyToPublish:true,blockingReasons:[]};
const pending:AdminListeningSet={...linked,setId:"10000000-0000-4000-8000-000000000003",setSequence:2,createdAt:"2026-08-12T00:00:00Z",audioReady:0,visualReady:0,mockTestId:null,slug:null,titleKo:null,mockTestPublished:null,round:null,readyToRegister:true,readyToPublish:false};

describe("ListeningAdminPanel",()=>{
  beforeEach(()=>{vi.mocked(adminApi.listeningItems).mockReset();vi.mocked(adminApi.listeningItems).mockResolvedValue({items:[]});vi.mocked(adminApi.registerListeningSet).mockReset();vi.mocked(adminApi.registerListeningSet).mockResolvedValue({mockTestId:"mock",slug:"topik-ii-listening-2",round:2,published:false,created:true});vi.spyOn(window,"confirm").mockReturnValue(true);});

  it("shows listening rounds before loading a selected round",async()=>{
    render(<ListeningAdminPanel token="token" sets={[linked,pending]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    expect(screen.getAllByTestId("listening-set-card")).toHaveLength(2);
    await userEvent.click(within(screen.getAllByTestId("listening-set-card")[0]!).getByRole("button",{name:"문항 보기"}));
    await waitFor(()=>expect(adminApi.listeningItems).toHaveBeenCalledWith("token",{setId:linked.setId}));
    expect(screen.getByRole("heading",{name:"듣기 1회 · 문항 관리"})).toBeInTheDocument();
  });

  it("registers a detected SQL set as a draft round",async()=>{
    const changed=vi.fn().mockResolvedValue(undefined);
    render(<ListeningAdminPanel token="token" sets={[pending]} onSetsChanged={changed} onError={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:/비공개 회차 생성/}));
    await waitFor(()=>expect(adminApi.registerListeningSet).toHaveBeenCalledWith("token",pending.setId,1));
    expect(changed).toHaveBeenCalled();
  });

  it("uses the shared round labels and status presentation",()=>{
    render(<ListeningAdminPanel token="token" sets={[linked,pending]} onSetsChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()}/>);
    expect(screen.getByText("등록 회차 1")).toBeInTheDocument();
    expect(screen.getByText("새 세트 1")).toBeInTheDocument();
    expect(screen.getByText("공개")).toBeInTheDocument();
    expect(screen.getByText("미등록")).toBeInTheDocument();
  });
});
