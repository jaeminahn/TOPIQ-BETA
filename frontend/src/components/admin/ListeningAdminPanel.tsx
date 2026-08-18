import {
  AudioLines, CheckCircle2, CircleAlert, Headphones,
  Image, LoaderCircle, Play, Plus, RefreshCw, Sparkles, Trash2, Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminListeningGroup, AdminListeningSet, AdminListeningSetBlockReason, TtsStyle } from "../../types";
import { AdminRoundCard, AdminRoundDetailHeader, AdminRoundEmpty, AdminRoundListHeader, AdminRoundLoading, AdminRoundSearch } from "./AdminRoundUi";

const blockReasonLabels: Record<AdminListeningSetBlockReason,string> = {
  SET_NOT_REVIEWED:"세트 검토 미완료",SET_NOT_PUBLISHED:"문제은행 발행 미완료",
  ITEM_COUNT_INVALID:"50문항 필요",ITEMS_INVALID:"대본·선택지·정답 확인 필요",
};
const positionLabel = (positions: number[]) => positions.length > 1 ? `${positions[0]}~${positions.at(-1)}` : String(positions[0]);
const defaultStyle: TtsStyle = { speakingRate:1,stylePrompt:"" };

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
  const [ttsStyle,setTtsStyle] = useState<TtsStyle>(defaultStyle);
  const [audioUrl,setAudioUrl] = useState("");

  const loadItems = async (set = selectedSet) => {
    if (!set) return;
    try {
      const result = await adminApi.listeningItems(token,{ setId:set.setId });
      setItems(result.items);
    } catch (cause) { onError(cause instanceof Error ? cause.message:"듣기 문항을 불러오지 못했습니다."); }
  };
  const openSet = async (set:AdminListeningSet) => {
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
    if (!selectedSet) return;
    const timer = window.setInterval(() => void Promise.all([loadItems(selectedSet),onSetsChanged()]),4000);
    return () => window.clearInterval(timer);
  }, [selectedSet,token,onSetsChanged]);
  useEffect(() => {
    if (!selectedSet) return;
    const refreshed = sets.find((set) => set.setId===selectedSet.setId && set.setVersion===selectedSet.setVersion);
    if (refreshed) setSelectedSet(refreshed);
  }, [sets,selectedSet?.setId,selectedSet?.setVersion]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((group) => `${group.positions.join(" ")} ${group.itemType} ${group.questionPrompts.join(" ")}`.toLocaleLowerCase().includes(query));
  }, [items,search]);

  if (!selectedSet) {
    const linkedCount = sets.filter((set) => set.round!==null).length;
    const pendingCount = sets.filter((set) => !set.mockTestId).length;
    return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
      <AdminRoundListHeader eyebrow="LISTENING ROUNDS" title="듣기 회차 관리" description="회차를 선택해 세트의 문항, 음원과 그림 준비 상태를 확인합니다." registeredCount={linkedCount} newCount={pendingCount} />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sets.map((set) => {
        const linked = Boolean(set.mockTestId); const registerKey=`register-${set.setId}`;
        return <AdminRoundCard key={`${set.setId}-${set.setVersion}`} testId="listening-set-card" roundLabel={set.round!==null?`듣기 ${set.round}회`:"새 듣기 세트"} linked={linked} published={set.mockTestPublished} title={set.titleKo??`듣기 세트 · v${set.setVersion}`} setId={set.setId} createdAt={set.createdAt} metrics={[
          { label:"문항",value:`${set.itemCount}/50`,icon:Headphones },
          { label:"음원",value:`${set.audioReady}/50`,icon:AudioLines },
          { label:"그림",value:`${set.visualReady}/${set.visualRequired}`,icon:Image },
        ]} readiness={!linked ? (set.readyToRegister?<p className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="size-4"/>비공개 회차 생성 준비 완료</p>:<div className="space-y-1">{set.blockingReasons.map((reason)=><p key={reason} className="flex items-center gap-2 text-xs font-semibold text-gray-600"><CircleAlert className="size-3.5"/>{blockReasonLabels[reason]}</p>)}</div>) : undefined} actions={<><button type="button" onClick={()=>void openSet(set)} className="focus-ring min-h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">문항 보기</button>{!linked&&<button type="button" disabled={!set.readyToRegister||Boolean(busy)} onClick={()=>{if(window.confirm("이 세트를 새 비공개 듣기 회차로 등록할까요?"))void run(registerKey,()=>adminApi.registerListeningSet(token,set.setId,set.setVersion));}} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy===registerKey?<LoaderCircle className="size-4 animate-spin"/>:<Plus className="size-4"/>} 비공개 회차 생성</button>}</>} />;
      })}</div>{!sets.length&&<AdminRoundEmpty>듣기 세트가 없습니다.</AdminRoundEmpty>}
    </section>;
  }

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
    <AdminRoundDetailHeader eyebrow="LISTENING BANK" title={`${selectedSet.round!==null?`듣기 ${selectedSet.round}회`:"새 듣기 세트"} · 문항 관리`} summary={`문항 ${selectedSet.itemCount}/50 · 음원 ${selectedSet.audioReady}/50 · 그림 ${selectedSet.visualReady}/${selectedSet.visualRequired} · 세트 v${selectedSet.setVersion}`} onBack={()=>{setSelectedSet(null);setItems([]);setAudioUrl("");setSearch("");}} actions={<><button type="button" disabled={Boolean(busy)} onClick={()=>void run("bulk-audio",()=>adminApi.generateSet(token,selectedSet.setId,selectedSet.setVersion,false,ttsStyle))} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-40"><AudioLines className="mr-2 inline size-4"/>누락 음원 생성</button><button type="button" disabled={Boolean(busy)} onClick={()=>void run("bulk-visual",()=>adminApi.generateSetVisuals(token,selectedSet.setId,selectedSet.setVersion,false))} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="mr-2 inline size-4"/>누락 그림 생성</button>{selectedSet.mockTestId&&<button type="button" disabled={!selectedSet.readyToPublish||Boolean(busy)} onClick={()=>void run("publish",()=>adminApi.publish(token,selectedSet.mockTestId!,!selectedSet.mockTestPublished))} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{selectedSet.mockTestPublished?"비공개 전환":"시험 공개"}</button>}</>} />
    <div className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-4 lg:grid-cols-[.6fr_1.4fr_auto]"><label className="text-sm font-semibold">말하기 속도 <span className="text-primary">{ttsStyle.speakingRate.toFixed(2)}×</span><input type="range" min="0.75" max="1.25" step="0.05" value={ttsStyle.speakingRate} onChange={(event)=>setTtsStyle((current)=>({...current,speakingRate:Number(event.target.value)}))} className="mt-2 block w-full accent-primary"/></label><label className="text-sm font-semibold">음원 스타일 지시<input value={ttsStyle.stylePrompt} maxLength={300} onChange={(event)=>setTtsStyle((current)=>({...current,stylePrompt:event.target.value}))} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="차분한 시험 방송처럼 또렷하게"/></label><div className="self-end"><AdminRoundSearch value={search} onChange={setSearch} placeholder="번호·유형 검색" width="w-40" /></div></div>
    {audioUrl&&<div className="mt-4 flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3"><audio src={audioUrl} controls autoPlay className="h-10 flex-1"/><button onClick={()=>setAudioUrl("")} className="text-xs font-semibold text-primary">닫기</button></div>}
    {loading?<AdminRoundLoading />:<div className="mt-6 space-y-4">{visibleItems.map((group)=><details key={`${group.setId}-${group.positions.join("-")}`} className="rounded-2xl border border-gray-200 p-4 open:border-primary-100 open:bg-primary-50"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-white">{positionLabel(group.positions)}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{group.questionPrompts.join(" · ")}</b><span className="text-xs font-semibold text-gray-400">{group.itemType}{group.positions.length>1?" · 공통 음원":""}</span></span><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${group.audioStatus==="ready"?"bg-green-50 text-green-700":"bg-orange-50 text-orange-700"}`}>{group.audioStatus==="ready"?"음원 준비":"음원 누락"}</span></summary>
      <div className="mt-5 border-t border-gray-200 pt-5"><div className="grid gap-4 lg:grid-cols-[1fr_auto]"><div className="max-h-36 overflow-auto text-sm leading-6">{group.dialogueTurns.map((turn,index)=><p key={index}><b>{turn.speaker}</b> {turn.text}</p>)}{group.lastError&&<p className="mt-2 text-xs font-semibold text-red-600">{group.lastError}</p>}</div><div className="flex flex-wrap content-start gap-2">{group.audioAssetId&&<button onClick={()=>void adminApi.audioUrl(token,group.audioAssetId!).then((data)=>setAudioUrl(data.audioUrl)).catch((cause)=>onError(cause instanceof Error?cause.message:"재생 실패"))} className="flex min-h-10 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold"><Play className="size-3"/>재생</button>}<button disabled={Boolean(busy)} onClick={()=>void run(`audio-${group.leaderItemId}`,()=>adminApi.generateGroup(token,group.setId,group.setVersion,group.leaderItemId,Boolean(group.audioAssetId),ttsStyle))} className="min-h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-primary">{group.audioAssetId?"음원 재생성":"음원 생성"}</button>{group.audioAssetId&&<button onClick={()=>{if(window.confirm(`${positionLabel(group.positions)}번 음원을 Supabase에서도 삭제할까요?`))void run(`delete-audio-${group.leaderItemId}`,()=>adminApi.deleteGroupAudio(token,group.setId,group.setVersion,group.leaderItemId,group.audioAssetId!));}} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600"><Trash2 className="mr-1 inline size-3"/>삭제</button>}</div></div>
        {group.targets.some((target)=>target.visualOptions.length>0)&&<div className="mt-5 space-y-5">{group.targets.filter((target)=>target.visualOptions.length>0).map((target)=><div key={target.itemId}><h4 className="mb-3 text-sm font-semibold">{target.position}번 그림 선택지 · {target.visualReadyCount}/{target.visualOptionCount}</h4><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{target.visualOptions.map((option)=>{const active=option.generationStatus==="queued"||option.generationStatus==="processing";const key=`visual-${target.itemId}-${option.optionNumber}`;return <article key={option.optionNumber} className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-white">{option.imageUrl?<img src={option.imageUrl} alt={`${target.position}번 ${option.optionNumber}번 보기`} className="size-full object-contain"/>:<Image className="size-8 text-gray-300"/>}<span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-gray-900 text-xs font-semibold text-white">{option.optionNumber}</span>{active&&<span className="absolute inset-0 grid place-items-center bg-white/80"><LoaderCircle className="size-6 animate-spin text-primary"/></span>}</div><p className="mt-2 line-clamp-3 min-h-12 text-xs leading-4 text-gray-600">{option.description}</p>{option.generationError&&<p className="mt-2 text-[11px] text-red-600">{option.generationError}</p>}<div className="mt-3 flex flex-wrap gap-1"><button disabled={active||Boolean(busy)} onClick={()=>void run(key,()=>adminApi.generateVisual(token,target.itemId,target.itemVersion,option.optionNumber,Boolean(option.visualAssetId)))} className="min-h-9 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-primary">{option.visualAssetId?<RefreshCw className="mr-1 inline size-3"/>:<Sparkles className="mr-1 inline size-3"/>}{option.visualAssetId?"재생성":"생성"}</button><label className="grid min-h-9 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white px-2 text-gray-600"><Upload className="size-3"/><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];if(file)void run(`upload-${key}`,()=>adminApi.uploadVisual(token,target.itemId,target.itemVersion,option.optionNumber,file));event.currentTarget.value="";}}/></label>{option.visualAssetId&&<button title="Supabase에서도 삭제" onClick={()=>{if(window.confirm(`${target.position}번 ${option.optionNumber}번 그림을 Supabase에서도 삭제할까요?`))void run(`delete-${key}`,()=>adminApi.deleteVisual(token,target.itemId,target.itemVersion,option.optionNumber,option.visualAssetId!));}} className="grid min-h-9 place-items-center rounded-lg border border-red-200 bg-white px-2 text-red-600"><Trash2 className="size-3"/></button>}</div></article>;})}</div></div>)}</div>}
      </div></details>)}{!visibleItems.length&&<AdminRoundEmpty>표시할 문항이 없습니다.</AdminRoundEmpty>}</div>}
  </section>;
}
