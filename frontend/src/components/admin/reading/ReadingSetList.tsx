import { BookOpen, CheckCircle2, CircleAlert, FileCheck2, Image, LoaderCircle, Plus } from "lucide-react";
import type { AdminReadingSet, AdminReadingSetBlockReason } from "../../../types";
import { AdminRoundCard, AdminRoundEmpty, AdminRoundListHeader } from "../common/AdminRoundUi";

const blockReasonLabels: Record<AdminReadingSetBlockReason, string> = {
  SET_NOT_REVIEWED: "세트 검토 미완료",
  SET_NOT_PUBLISHED: "문제은행 발행 미완료",
  ITEM_COUNT_INVALID: "50문항 필요",
  ITEMS_INVALID: "선택지 또는 정답 확인 필요",
  VISUALS_INCOMPLETE: "10번 그래프 생성 필요",
};

export function ReadingSetList({ sets, busy, onOpen, onPublish }: {
  sets: AdminReadingSet[];
  busy: string;
  onOpen: (set: AdminReadingSet) => void;
  onPublish: (set: AdminReadingSet) => void;
}) {
  const linkedCount = sets.filter((set) => set.round !== null).length;
  const pendingCount = sets.filter((set) => !set.mockTestId).length;
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
    <AdminRoundListHeader eyebrow="READING ROUNDS" title="읽기 회차 관리" description="회차를 선택해 세트의 문항과 공개 준비 상태를 확인합니다." registeredCount={linkedCount} newCount={pendingCount} />
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sets.map((set) => {
      const linked = Boolean(set.mockTestId);
      const publishKey = `publish-reading-${set.setId}-${set.setVersion}`;
      return <AdminRoundCard key={`${set.setId}-${set.setVersion}`} testId="reading-set-card" roundLabel={set.round !== null ? `읽기 ${set.round}회` : "새 읽기 세트"} linked={linked} published={set.mockTestPublished} title={set.titleKo ?? `읽기 세트 · v${set.setVersion}`} setId={set.setId} createdAt={set.createdAt} metrics={[
        { label: "문항", value: `${set.itemCount}/50`, icon: BookOpen },
        { label: "유효", value: `${set.validItemCount}/50`, icon: FileCheck2 },
        { label: "그래프", value: `${set.visualReady}/${set.visualRequired}`, icon: Image },
      ]} readiness={!linked ? (set.readyToPublish ? <p className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="size-4" /> 홈페이지 추가 준비 완료</p> : <div className="space-y-1">{set.blockingReasons.map((reason) => <p key={reason} className="flex items-center gap-2 text-xs font-semibold text-gray-600"><CircleAlert className="size-3.5" />{blockReasonLabels[reason]}</p>)}</div>) : undefined} actions={<><button type="button" onClick={() => onOpen(set)} className="focus-ring min-h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">문항 보기</button>{!linked && <button type="button" disabled={!set.readyToPublish || Boolean(busy)} onClick={() => onPublish(set)} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === publishKey ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} 홈페이지에 추가</button>}</>} />;
    })}</div>
    {!sets.length && <AdminRoundEmpty>읽기 세트가 없습니다.</AdminRoundEmpty>}
  </section>;
}
