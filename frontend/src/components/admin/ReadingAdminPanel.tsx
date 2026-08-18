import { BookOpen, CheckCircle2, CircleAlert, FileCheck2, LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminReadingItem, AdminReadingSet, AdminReadingSetBlockReason } from "../../types";
import { AdminRoundCard, AdminRoundDetailHeader, AdminRoundEmpty, AdminRoundListHeader, AdminRoundLoading, AdminRoundSearch } from "./AdminRoundUi";

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
      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
        <AdminRoundListHeader eyebrow="READING ROUNDS" title="읽기 회차 관리" description="회차를 선택해 세트의 문항과 공개 준비 상태를 확인합니다." registeredCount={linkedCount} newCount={pendingCount} />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((set) => {
            const isLinked = Boolean(set.mockTestId);
            const publishKey = `publish-reading-${set.setId}-${set.setVersion}`;
            return (
              <AdminRoundCard key={`${set.setId}-${set.setVersion}`} testId="reading-set-card" roundLabel={set.round !== null ? `읽기 ${set.round}회` : "새 읽기 세트"} linked={isLinked} published={set.mockTestPublished} title={set.titleKo ?? `읽기 세트 · v${set.setVersion}`} setId={set.setId} createdAt={set.createdAt} metrics={[
                { label: "문항", value: `${set.itemCount}/50`, icon: BookOpen },
                { label: "유효", value: `${set.validItemCount}/50`, icon: FileCheck2 },
              ]} readiness={!isLinked ? <>
                  {set.readyToPublish ? <p className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="size-4" /> 홈페이지 추가 준비 완료</p> : <div className="space-y-1">{set.blockingReasons.map((reason) => <p key={reason} className="flex items-center gap-2 text-xs font-semibold text-gray-600"><CircleAlert className="size-3.5" />{blockReasonLabels[reason]}</p>)}</div>}
                </> : undefined} actions={<>
                  <button type="button" onClick={() => void openSet(set)} className="focus-ring min-h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">문항 보기</button>
                  {!isLinked && <button type="button" disabled={!set.readyToPublish || Boolean(busy)} onClick={() => void onPublish(set)} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                    {busy === publishKey ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} 홈페이지에 추가
                  </button>}
                </>} />
            );
          })}
        </div>
        {!sets.length && <AdminRoundEmpty>읽기 세트가 없습니다.</AdminRoundEmpty>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
      <AdminRoundDetailHeader eyebrow="READING BANK" title={`${selectedSet.round !== null ? `읽기 ${selectedSet.round}회` : "새 읽기 세트"} · 문항 관리`} summary={`문항 ${selectedSet.itemCount}/50 · 유효 ${selectedSet.validItemCount}/50 · 세트 v${selectedSet.setVersion}`} onBack={() => { setSelectedSet(null); setItems([]); setSearch(""); }} actions={<AdminRoundSearch value={search} onChange={setSearch} placeholder="번호·유형·본문 검색" />} />

      {loadingItems ? <AdminRoundLoading /> : <div className="mt-6 space-y-3">
        {visibleItems.map((item) => <details key={`${item.setId}-${item.position}`} className="rounded-2xl border border-gray-200 p-4 open:border-primary-100 open:bg-primary-50"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-white">{item.position}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.stem}</b><span className="text-xs font-semibold text-gray-400">{item.itemType}</span></span><span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold">정답 {item.correctAnswer ?? "—"}</span></summary><div className="mt-5 grid gap-5 border-t border-gray-200 pt-5 lg:grid-cols-2"><div><p className="whitespace-pre-wrap text-sm font-medium leading-7">{item.stem}</p><ol className="mt-4 space-y-2">{item.choices.map((choice, index) => <li key={index} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${item.correctAnswer === index + 1 ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>{index + 1}. {choice}</li>)}</ol></div><div className="rounded-2xl bg-white p-5"><p className="text-xs font-semibold text-primary">해설</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{item.explanation || "등록된 해설이 없습니다."}</p></div></div></details>)}
        {!visibleItems.length && <AdminRoundEmpty>표시할 문항이 없습니다.</AdminRoundEmpty>}
      </div>}
    </section>
  );
}
