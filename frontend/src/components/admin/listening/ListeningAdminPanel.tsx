import {
  AudioLines, Image, LoaderCircle, Pencil, Play, RefreshCw, Sparkles, Trash2, Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../../api";
import type { AdminListeningGroup, AdminListeningSet, TtsStyle } from "../../../types";
import { AdminListeningAudioDock, type BulkAudioProgress } from "./AdminListeningAudioDock";
import { AdminPromptCopyButton } from "../common/AdminPromptCopyButton";
import { AdminRoundDetailHeader, AdminRoundEmpty, AdminRoundLoading, AdminRoundSearch } from "../common/AdminRoundUi";
import { AdminQuestionEditorDialog } from "../common/AdminQuestionEditorDialog";
import { AdminPublishDialog } from "../common/AdminPublishDialog";
import { AdminImageCropDialog } from "../common/AdminImageCropDialog";
import { ListeningSetList } from "./ListeningSetList";
const positionLabel = (positions: number[]) => positions.length > 1 ? `${positions[0]}~${positions.at(-1)}` : String(positions[0]);
const defaultStyle: TtsStyle = { speakingRate:1,stylePrompt:"" };
const isAudioGenerating = (group: AdminListeningGroup) => group.generationStatus === "queued" || group.generationStatus === "processing";

type AudioDockState =
  | { kind:"group"; leaderItemId:string }
  | { kind:"bulk"; phase:"configure"|"submitting"|"running"; targetCount:number; jobIds:string[] };

export function ListeningAdminPanel({
  token,sets,onSetsChanged,onError,
}: {
  token:string; sets:AdminListeningSet[]; onSetsChanged:()=>Promise<void>; onError:(message:string)=>void;
}) {
  const [selectedSet,setSelectedSet] = useState<AdminListeningSet|null>(null);
  const [items,setItems] = useState<AdminListeningGroup[]>([]);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState("");
  const [search,setSearch] = useState("");
  const [lastDraftStyle,setLastDraftStyle] = useState<TtsStyle>(defaultStyle);
  const [draftStyle,setDraftStyle] = useState<TtsStyle>(defaultStyle);
  const [dock,setDock] = useState<AudioDockState|null>(null);
  const [audioUrl,setAudioUrl] = useState("");
  const [audioLoading,setAudioLoading] = useState(false);
  const [audioError,setAudioError] = useState("");
  const [loadedAudioAssetId,setLoadedAudioAssetId] = useState("");
  const audioRequestId = useRef(0);
  const [editing,setEditing] = useState<{ group: AdminListeningGroup; target: AdminListeningGroup["targets"][number] }|null>(null);
  const [publishConfirm,setPublishConfirm] = useState(false);
  const [cropTarget,setCropTarget] = useState<{
    file:File; itemId:string; itemVersion:number; optionNumber:number; position:number;
  }|null>(null);

  const clearAudio = useCallback(() => {
    audioRequestId.current += 1;
    setAudioUrl("");
    setAudioLoading(false);
    setAudioError("");
    setLoadedAudioAssetId("");
  }, []);

  const closeDock = useCallback(() => {
    clearAudio();
    setDock(null);
  }, [clearAudio]);

  const loadItems = async (set = selectedSet) => {
    if (!set) return;
    try {
      const result = await adminApi.listeningItems(token,{ setId:set.setId,setVersion:set.setVersion });
      setItems(result.items);
    } catch (cause) { onError(cause instanceof Error ? cause.message:"듣기 문항을 불러오지 못했습니다."); }
  };

  const openSet = async (set:AdminListeningSet) => {
    closeDock();
    setCropTarget(null);
    setSelectedSet(set); setItems([]); setSearch(""); setLoading(true);
    try { await loadItems(set); } finally { setLoading(false); }
  };

  const run = async (key:string,operation:()=>Promise<unknown>) => {
    setBusy(key); onError("");
    try { await operation(); await Promise.all([loadItems(),onSetsChanged()]); }
    catch (cause) { onError(cause instanceof Error ? cause.message:"요청에 실패했습니다."); }
    finally { setBusy(""); }
  };

  useEffect(() => {
    if (!selectedSet || editing) return;
    const timer = window.setInterval(() => void Promise.all([loadItems(selectedSet),onSetsChanged()]),4000);
    return () => window.clearInterval(timer);
  }, [editing,selectedSet,token,onSetsChanged]);

  useEffect(() => {
    if (!selectedSet) return;
    const refreshed = sets.find((set) => set.setId===selectedSet.setId && set.setVersion===selectedSet.setVersion);
    if (refreshed) setSelectedSet(refreshed);
  }, [sets,selectedSet?.setId,selectedSet?.setVersion]);

  useEffect(() => () => { audioRequestId.current += 1; }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((group) => `${group.positions.join(" ")} ${group.itemType} ${group.questionPrompts.join(" ")}`.toLocaleLowerCase().includes(query));
  }, [items,search]);

  const selectedAudioGroup = useMemo(() => dock?.kind === "group"
    ? items.find((group) => group.leaderItemId === dock.leaderItemId) ?? null
    : null, [dock,items]);

  const bulkProgress = useMemo<BulkAudioProgress|null>(() => {
    if (dock?.kind !== "bulk") return null;
    const jobGroups = dock.jobIds.map((jobId) => items.find((group) => group.generationJobId === jobId));
    const completed = jobGroups.filter((group) => group?.generationStatus === "succeeded").length;
    const failed = jobGroups.filter((group) => group?.generationStatus === "failed").length;
    const total = dock.jobIds.length;
    return {
      phase:dock.phase,targetCount:dock.targetCount,total,completed,failed,
      active:dock.phase === "running" ? Math.max(0,total-completed-failed) : 0,
    };
  }, [dock,items]);

  useEffect(() => {
    if (!selectedAudioGroup) return;
    const assetChanged = Boolean(loadedAudioAssetId) && loadedAudioAssetId !== selectedAudioGroup.audioAssetId;
    if (isAudioGenerating(selectedAudioGroup) || assetChanged) clearAudio();
  }, [clearAudio,loadedAudioAssetId,selectedAudioGroup?.audioAssetId,selectedAudioGroup?.generationStatus]);

  const requestAudio = async (group:AdminListeningGroup) => {
    if (!group.audioAssetId || isAudioGenerating(group)) return;
    const requestId = ++audioRequestId.current;
    setAudioUrl(""); setLoadedAudioAssetId(""); setAudioError(""); setAudioLoading(true);
    try {
      const result = await adminApi.audioUrl(token,group.audioAssetId);
      if (requestId !== audioRequestId.current) return;
      if (!result.audioUrl) throw new Error("음원을 불러오지 못했습니다.");
      setLoadedAudioAssetId(group.audioAssetId);
      setAudioUrl(result.audioUrl);
    } catch (cause) {
      if (requestId === audioRequestId.current) setAudioError(cause instanceof Error ? cause.message:"재생 실패");
    } finally {
      if (requestId === audioRequestId.current) setAudioLoading(false);
    }
  };

  const openGroupDock = (group:AdminListeningGroup,play:boolean) => {
    clearAudio();
    setDock({ kind:"group",leaderItemId:group.leaderItemId });
    setDraftStyle(group.generationStatus === "queued" || group.generationStatus === "processing"
      ? group.generationTtsStyle ?? group.ttsStyle ?? lastDraftStyle
      : group.ttsStyle ?? lastDraftStyle);
    if (play) void requestAudio(group);
  };

  const openBulkDock = () => {
    clearAudio();
    const candidates = items.filter((group) => group.audioStatus !== "ready" && !isAudioGenerating(group));
    setDraftStyle(lastDraftStyle);
    setDock({ kind:"bulk",phase:"configure",targetCount:candidates.length,jobIds:[] });
  };

  const startGroupGeneration = async () => {
    if (!selectedAudioGroup || isAudioGenerating(selectedAudioGroup) || busy) return;
    const style = { ...draftStyle,stylePrompt:draftStyle.stylePrompt.trim() };
    const key = `audio-${selectedAudioGroup.leaderItemId}`;
    const leaderItemId = selectedAudioGroup.leaderItemId;
    setLastDraftStyle(style); setDraftStyle(style); clearAudio(); setBusy(key); onError("");
    setItems((current) => current.map((group) => group.leaderItemId === leaderItemId
      ? { ...group,generationJobId:null,generationStatus:"queued",generationTtsStyle:style,lastError:null }
      : group));
    try {
      const result = await adminApi.generateGroup(token,selectedAudioGroup.setId,selectedAudioGroup.setVersion,leaderItemId,Boolean(selectedAudioGroup.audioAssetId),style);
      if (result.jobId) setItems((current) => current.map((group) => group.leaderItemId === leaderItemId ? { ...group,generationJobId:result.jobId } : group));
      await Promise.all([loadItems(),onSetsChanged()]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message:"음원 생성 요청에 실패했습니다.");
      await loadItems();
    } finally { setBusy(""); }
  };

  const startBulkGeneration = async () => {
    if (!selectedSet || dock?.kind !== "bulk" || dock.phase !== "configure" || busy) return;
    const candidates = items.filter((group) => group.audioStatus !== "ready" && !isAudioGenerating(group));
    if (!candidates.length) {
      setDock({ kind:"bulk",phase:"running",targetCount:0,jobIds:[] });
      return;
    }
    const style = { ...draftStyle,stylePrompt:draftStyle.stylePrompt.trim() };
    const candidateIds = new Set(candidates.map((group) => group.leaderItemId));
    setLastDraftStyle(style); setDraftStyle(style); clearAudio(); setBusy("bulk-audio"); onError("");
    setDock({ kind:"bulk",phase:"submitting",targetCount:candidates.length,jobIds:[] });
    setItems((current) => current.map((group) => candidateIds.has(group.leaderItemId)
      ? { ...group,generationJobId:null,generationStatus:"queued",generationTtsStyle:style,lastError:null }
      : group));
    try {
      const result = await adminApi.generateSet(token,selectedSet.setId,selectedSet.setVersion,false,style);
      setDock({ kind:"bulk",phase:"running",targetCount:result.jobIds.length,jobIds:result.jobIds });
      await Promise.all([loadItems(),onSetsChanged()]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message:"일괄 음원 생성 요청에 실패했습니다.");
      setDock({ kind:"bulk",phase:"configure",targetCount:candidates.length,jobIds:[] });
      await loadItems();
    } finally { setBusy(""); }
  };

  if (!selectedSet) {
    return <ListeningSetList sets={sets} busy={busy} onOpen={(set) => void openSet(set)} onRegister={(set, key) => {
      if (window.confirm("이 세트를 새 비공개 듣기 회차로 등록할까요?")) {
        void run(key, () => adminApi.registerListeningSet(token, set.setId, set.setVersion));
      }
    }} />;
  }

  return <section className={`rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 ${dock ? "pb-[25rem] lg:pb-48" : ""}`}>
    <AdminRoundDetailHeader eyebrow="LISTENING BANK" title={`${selectedSet.round!==null?`듣기 ${selectedSet.round}회`:"새 듣기 세트"} · 문항 관리`} summary={`문항 ${selectedSet.itemCount}/50 · 음원 ${selectedSet.audioReady}/50 · 그림 ${selectedSet.visualReady}/${selectedSet.visualRequired} · 세트 v${selectedSet.setVersion}`} onBack={()=>{closeDock();setCropTarget(null);setSelectedSet(null);setItems([]);setSearch("");}} actions={<><button type="button" disabled={Boolean(busy)} onClick={openBulkDock} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-40"><AudioLines className="mr-2 inline size-4"/>누락 음원 생성</button><button type="button" disabled={Boolean(busy)} onClick={()=>void run("bulk-visual",()=>adminApi.generateSetVisuals(token,selectedSet.setId,selectedSet.setVersion,false))} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="mr-2 inline size-4"/>누락 그림 생성</button>{selectedSet.mockTestId&&<button type="button" disabled={Boolean(busy)||(!selectedSet.mockTestPublished&&!selectedSet.readyToPublish)} onClick={()=>setPublishConfirm(true)} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{selectedSet.mockTestPublished?"비공개 전환":"시험 공개"}</button>}</>} />
    <div className="mt-6 flex justify-end"><AdminRoundSearch value={search} onChange={setSearch} placeholder="번호·유형 검색" width="w-44 sm:w-56" /></div>
    {loading?<AdminRoundLoading />:<div className="mt-6 space-y-4">{visibleItems.map((group)=>{const generating=isAudioGenerating(group);return <details key={`${group.setId}-${group.positions.join("-")}`} className="rounded-2xl border border-gray-200 p-4 open:border-primary-100 open:bg-primary-50"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-white">{positionLabel(group.positions)}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{group.questionPrompts.join(" · ")}</b><span className="text-xs font-semibold text-gray-400">{group.itemType}{group.positions.length>1?" · 공통 음원":""}</span></span><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${generating?"bg-primary-50 text-primary":group.audioStatus==="ready"?"bg-green-50 text-green-700":"bg-orange-50 text-orange-700"}`}>{generating?"음원 생성 중":group.audioStatus==="ready"?"완성형 음원 준비":group.audioStatus==="legacy"?"구형 음원 · 재생성 필요":"음원 누락"}</span></summary>
      <div className="mt-5 border-t border-gray-200 pt-5"><div className="grid gap-4 lg:grid-cols-[1fr_auto]"><div className="max-h-36 overflow-auto text-sm leading-6">{group.dialogueTurns.map((turn,index)=><p key={index}><b>{turn.speaker}</b> {turn.text}</p>)}{group.lastError&&<p className="mt-2 text-xs font-semibold text-red-600">{group.lastError}</p>}</div><div className="flex flex-wrap content-start gap-2">{group.audioAssetId&&<button disabled={generating||Boolean(busy)} onClick={()=>openGroupDock(group,true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Play className="size-3"/>재생</button>}<button disabled={Boolean(busy)} onClick={()=>openGroupDock(group,false)} className="min-h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-primary disabled:opacity-40">{generating?"생성 상태 보기":group.audioAssetId?"음원 재생성":"음원 생성"}</button>{group.audioAssetId&&<button disabled={generating||Boolean(busy)} onClick={()=>{if(window.confirm(`${positionLabel(group.positions)}번 음원을 Supabase에서도 삭제할까요?`)){if(dock?.kind==="group"&&dock.leaderItemId===group.leaderItemId)closeDock();void run(`delete-audio-${group.leaderItemId}`,()=>adminApi.deleteGroupAudio(token,group.setId,group.setVersion,group.leaderItemId,group.audioAssetId!));}}} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 disabled:opacity-40"><Trash2 className="mr-1 inline size-3"/>삭제</button>}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{group.targets.map((target)=><button key={target.itemId} type="button" onClick={()=>setEditing({group,target})} className="flex min-h-11 items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-left text-xs font-semibold"><span>{target.position}번 · {target.questionPrompt}</span><span className="flex items-center gap-1 text-primary"><Pencil className="size-3"/>수정</span></button>)}</div>
        {group.targets.some((target)=>target.visualOptions.length>0)&&<div className="mt-5 space-y-5">{group.targets.filter((target)=>target.visualOptions.length>0).map((target)=><div key={target.itemId}><h4 className="mb-3 text-sm font-semibold">{target.position}번 그림 선택지 · {target.visualReadyCount}/{target.visualOptionCount}</h4><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{target.visualOptions.map((option)=>{const active=option.generationStatus==="queued"||option.generationStatus==="processing";const key=`visual-${target.itemId}-${option.optionNumber}`;return <article key={option.optionNumber} className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-white">{option.imageUrl?<img src={option.imageUrl} alt={`${target.position}번 ${option.optionNumber}번 보기`} className="size-full object-contain"/>:<Image className="size-8 text-gray-300"/>}<span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-gray-900 text-xs font-semibold text-white">{option.optionNumber}</span>{active&&<span className="absolute inset-0 grid place-items-center bg-white/80"><LoaderCircle className="size-6 animate-spin text-primary"/></span>}</div><p className="mt-2 line-clamp-3 min-h-12 text-xs leading-4 text-gray-600">{option.description}</p>{option.generationError&&<p className="mt-2 text-[11px] text-red-600">{option.generationError}</p>}<div className="mt-3 flex flex-wrap gap-1"><button disabled={active||Boolean(busy)} onClick={()=>void run(key,()=>adminApi.generateVisual(token,target.itemId,target.itemVersion,option.optionNumber,Boolean(option.visualAssetId)))} className="min-h-9 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-primary">{option.visualAssetId?<RefreshCw className="mr-1 inline size-3"/>:<Sparkles className="mr-1 inline size-3"/>}{option.visualAssetId?"재생성":"생성"}</button><AdminPromptCopyButton prompt={option.imagePrompt} ariaLabel={`${target.position}번 ${option.optionNumber}번 보기 생성 프롬프트 복사`} onError={onError}/><label aria-label={`${target.position}번 ${option.optionNumber}번 보기 업로드`} title="그림 업로드" className={`grid min-h-9 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white px-2 text-gray-600 ${active||Boolean(busy)?"pointer-events-none opacity-40":""}`}><Upload className="size-3"/><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={active||Boolean(busy)} onChange={(event)=>{const file=event.target.files?.[0];if(file)setCropTarget({file,itemId:target.itemId,itemVersion:target.itemVersion,optionNumber:option.optionNumber,position:target.position});event.currentTarget.value="";}}/></label>{option.visualAssetId&&<button title="Supabase에서도 삭제" onClick={()=>{if(window.confirm(`${target.position}번 ${option.optionNumber}번 그림을 Supabase에서도 삭제할까요?`))void run(`delete-${key}`,()=>adminApi.deleteVisual(token,target.itemId,target.itemVersion,option.optionNumber,option.visualAssetId!));}} className="grid min-h-9 place-items-center rounded-lg border border-red-200 bg-white px-2 text-red-600"><Trash2 className="size-3"/></button>}</div></article>;})}</div></div>)}</div>}
      </div></details>;})}{!visibleItems.length&&<AdminRoundEmpty>표시할 문항이 없습니다.</AdminRoundEmpty>}</div>}
    {editing&&<AdminQuestionEditorDialog token={token} section="listening" setId={editing.group.setId} setVersion={editing.group.setVersion} question={editing.target} groupQuestions={editing.group.targets} onClose={()=>setEditing(null)} onSaved={()=>{closeDock();setEditing(null);setSelectedSet(null);setItems([]);void onSetsChanged();}}/>}
    <AdminPublishDialog open={publishConfirm} publishing={!selectedSet.mockTestPublished} busy={Boolean(busy)} onClose={()=>setPublishConfirm(false)} onConfirm={()=>{void run("publish",()=>adminApi.publish(token,selectedSet.mockTestId!,!selectedSet.mockTestPublished)).finally(()=>setPublishConfirm(false));}} />
    {dock&&(selectedAudioGroup||bulkProgress)&&<AdminListeningAudioDock group={selectedAudioGroup} bulk={bulkProgress} draftStyle={draftStyle} audioUrl={audioUrl} audioLoading={audioLoading} audioError={audioError} busy={Boolean(busy)} onDraftStyleChange={setDraftStyle} onPlay={()=>{if(selectedAudioGroup)void requestAudio(selectedAudioGroup);}} onGenerate={()=>{if(dock.kind==="group")void startGroupGeneration();else void startBulkGeneration();}} onClose={closeDock}/>}
    {cropTarget&&<AdminImageCropDialog file={cropTarget.file} title={`${cropTarget.position}번 ${cropTarget.optionNumber}번 보기 크롭`} onCancel={()=>setCropTarget(null)} onConfirm={(file)=>{const target=cropTarget;setCropTarget(null);void run(`upload-visual-${target.itemId}-${target.optionNumber}`,()=>adminApi.uploadVisual(token,target.itemId,target.itemVersion,target.optionNumber,file));}}/>}
  </section>;
}
