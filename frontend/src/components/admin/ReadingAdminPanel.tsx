import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, CircleAlert, Globe2, LoaderCircle, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminReadingItem, AdminReadingSet, AdminReadingSetBlockReason } from "../../types";

const blockReasonLabels: Record<AdminReadingSetBlockReason, string> = {
  SET_NOT_REVIEWED: "세트 검토 미완료",
  SET_NOT_PUBLISHED: "문제은행 발행 미완료",
  ITEM_COUNT_INVALID: "50문항 필요",
  ITEMS_INVALID: "선택지 또는 정답 확인 필요",
};

export function ReadingAdminPanel({
  token,
  sets,
  busy,
  onPublish,
  onError,
}: {
  token: string;
  sets: AdminReadingSet[];
  busy: string;
  onPublish: (set: AdminReadingSet) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selectedSet, setSelectedSet] = useState<AdminReadingSet | null>(null);
  const [items, setItems] = useState<AdminReadingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.position} ${item.itemType} ${item.stem}`.toLocaleLowerCase().includes(query));
  }, [items, search]);

  const openSet = async (set: AdminReadingSet) => {
    setSelectedSet(set);
    setItems([]);
    setSearch("");
    setLoadingItems(true);
    try {
      const result = await adminApi.readingItems(token, { setId: set.setId });
      setItems(result.items);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "읽기 문항을 불러오지 못했습니다.");
    } finally {
      setLoadingItems(false);
    }
  };

  if (!selectedSet) {
    const linkedCount = sets.filter((set) => set.round !== null).length;
    const pendingCount = sets.filter((set) => !set.mockTestId).length;
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black tracking-[.14em] text-[#155fcc]">READING ROUNDS</p>
            <h2 className="mt-2 text-2xl font-black">읽기 회차 관리</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">회차를 먼저 선택한 뒤 해당 세트의 개별 문항을 확인할 수 있습니다.</p>
          </div>
          <div className="flex gap-2 text-xs font-black">
            <span className="rounded-full bg-blue-50 px-3 py-2 text-[#155fcc]">공개 회차 {linkedCount}</span>
            <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-700">새 세트 {pendingCount}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((set) => {
            const isLinked = Boolean(set.mockTestId);
            const publishKey = `publish-reading-${set.setId}-${set.setVersion}`;
            return (
              <article key={`${set.setId}-${set.setVersion}`} data-testid="reading-set-card" className={`rounded-2xl border p-5 ${isLinked ? "border-blue-100 bg-blue-50/35" : "border-amber-200 bg-amber-50/35"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ${isLinked ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                    {set.round !== null ? `읽기 ${set.round}회` : "새 읽기 세트"}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${set.mockTestPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {set.mockTestPublished ? "홈페이지 공개" : isLinked ? "비공개" : "미등록"}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-900">{set.titleKo ?? `읽기 세트 · v${set.setVersion}`}</h3>
                <p className="mt-1 truncate text-[11px] font-bold text-slate-400" title={set.setId}>{set.setId}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
                  <p className="rounded-xl bg-white/80 p-3"><BookOpen className="mb-2 size-4 text-[#155fcc]" />문항 <strong className="float-right text-[#155fcc]">{set.itemCount}/50</strong></p>
                  <p className="rounded-xl bg-white/80 p-3"><CalendarDays className="mb-2 size-4 text-slate-500" />{new Date(set.createdAt).toLocaleDateString("ko-KR")}</p>
                </div>
                {!isLinked && <div className="mt-3">
                  {set.readyToPublish ? <p className="flex items-center gap-2 text-xs font-black text-emerald-700"><CheckCircle2 className="size-4" /> 홈페이지 추가 준비 완료</p> : <div className="space-y-1">{set.blockingReasons.map((reason) => <p key={reason} className="flex items-center gap-2 text-xs font-bold text-amber-700"><CircleAlert className="size-3.5" />{blockReasonLabels[reason]}</p>)}</div>}
                </div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void openSet(set)} className="focus-ring min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">문항 보기</button>
                  {!isLinked && <button type="button" disabled={!set.readyToPublish || Boolean(busy)} onClick={() => void onPublish(set)} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#155fcc] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
                    {busy === publishKey ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} 홈페이지에 추가
                  </button>}
                </div>
              </article>
            );
          })}
        </div>
        {!sets.length && <p className="py-16 text-center text-sm font-bold text-slate-400">읽기 세트가 없습니다.</p>}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <button type="button" onClick={() => { setSelectedSet(null); setItems([]); setSearch(""); }} className="focus-ring mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"><ArrowLeft className="size-4" /> 회차 목록</button>
          <p className="text-xs font-black tracking-[.14em] text-[#155fcc]">READING BANK</p>
          <h2 className="mt-2 text-2xl font-black">{selectedSet.round !== null ? `읽기 ${selectedSet.round}회` : "새 읽기 세트"} · 개별 문항</h2>
          <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-400"><Globe2 className="size-3.5" />{selectedSet.itemCount}문항 · 세트 v{selectedSet.setVersion}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="size-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="번호·유형·본문 검색" className="w-56 py-2.5 text-sm font-medium outline-none" /></label>
      </div>

      {loadingItems ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-[#155fcc]" /></div> : <div className="mt-6 space-y-3">
        {visibleItems.map((item) => <details key={`${item.setId}-${item.position}`} className="rounded-2xl border border-slate-200 p-4 open:border-blue-200 open:bg-blue-50/30"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#155fcc] text-sm font-black text-white">{item.position}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.stem}</b><span className="text-xs font-bold text-slate-400">{item.itemType}</span></span><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">정답 {item.correctAnswer ?? "—"}</span></summary><div className="mt-5 grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-2"><div><p className="whitespace-pre-wrap text-sm font-medium leading-7">{item.stem}</p><ol className="mt-4 space-y-2">{item.choices.map((choice, index) => <li key={index} className={`rounded-xl border px-4 py-3 text-sm font-bold ${item.correctAnswer === index + 1 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>{index + 1}. {choice}</li>)}</ol></div><div className="rounded-2xl bg-white p-5"><p className="text-xs font-black text-[#155fcc]">해설</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.explanation || "등록된 해설이 없습니다."}</p></div></div></details>)}
        {!visibleItems.length && <p className="py-16 text-center text-sm font-bold text-slate-400">표시할 문항이 없습니다.</p>}
      </div>}
    </section>
  );
}
