import { AudioLines, CheckCircle2, CircleAlert, Headphones, Image, LoaderCircle, Plus } from "lucide-react";
import type { AdminListeningSet, AdminListeningSetBlockReason } from "../../../types";
import { AdminRoundCard, AdminRoundEmpty, AdminRoundListHeader } from "../common/AdminRoundUi";

const blockReasonLabels: Record<AdminListeningSetBlockReason, string> = {
  SET_NOT_REVIEWED: "세트 검토 미완료",
  SET_NOT_PUBLISHED: "문제은행 발행 미완료",
  ITEM_COUNT_INVALID: "50문항 필요",
  ITEMS_INVALID: "대본·선택지·정답 확인 필요",
};

export function ListeningSetList({ sets, busy, onOpen, onRegister }: {
  sets: AdminListeningSet[];
  busy: string;
  onOpen: (set: AdminListeningSet) => void;
  onRegister: (set: AdminListeningSet, key: string) => void;
}) {
  const linkedCount = sets.filter((set) => set.round !== null).length;
  const pendingCount = sets.filter((set) => !set.mockTestId).length;
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
    <AdminRoundListHeader eyebrow="LISTENING ROUNDS" title="듣기 회차 관리" description="회차를 선택해 세트의 문항, 음원과 그림 준비 상태를 확인합니다." registeredCount={linkedCount} newCount={pendingCount} />
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sets.map((set) => {
      const linked = Boolean(set.mockTestId);
      const registerKey = `register-${set.setId}`;
      return <AdminRoundCard key={`${set.setId}-${set.setVersion}`} testId="listening-set-card" roundLabel={set.round !== null ? `듣기 ${set.round}회` : "새 듣기 세트"} linked={linked} published={set.mockTestPublished} title={set.titleKo ?? `듣기 세트 · v${set.setVersion}`} setId={set.setId} createdAt={set.createdAt} metrics={[
        { label: "문항", value: `${set.itemCount}/50`, icon: Headphones },
        { label: "음원", value: `${set.audioReady}/50`, icon: AudioLines },
        { label: "그림", value: `${set.visualReady}/${set.visualRequired}`, icon: Image },
      ]} readiness={!linked ? (set.readyToRegister ? <p className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="size-4" />비공개 회차 생성 준비 완료</p> : <div className="space-y-1">{set.blockingReasons.map((reason) => <p key={reason} className="flex items-center gap-2 text-xs font-semibold text-gray-600"><CircleAlert className="size-3.5" />{blockReasonLabels[reason]}</p>)}</div>) : undefined} actions={<><button type="button" onClick={() => onOpen(set)} className="focus-ring min-h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">문항 보기</button>{!linked && <button type="button" disabled={!set.readyToRegister || Boolean(busy)} onClick={() => onRegister(set, registerKey)} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === registerKey ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} 비공개 회차 생성</button>}</>} />;
    })}</div>
    {!sets.length && <AdminRoundEmpty>듣기 세트가 없습니다.</AdminRoundEmpty>}
  </section>;
}
