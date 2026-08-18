import { Fragment, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown } from "lucide-react";
import type { AdminResponseObservation, AdminResponseSession } from "../../types";
import { ResponseQuestionDialog } from "./ResponseQuestionDialog";

export type DeleteDialog = null | { mode: "selected" | "all" };

const formatDuration = (milliseconds: number) => milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(1)}초`;

export function AdminResponsesPanel({
  token,
  sessions,
  total,
  details,
  selectedSessions,
  setSelectedSessions,
  expandedSession,
  onToggleDetails,
  section,
  onSectionChange,
  correctness,
  onCorrectnessChange,
  page,
  onPageChange,
  onDeleteRequest,
}: {
  token: string;
  sessions: AdminResponseSession[];
  total: number;
  details: Record<string, AdminResponseObservation[]>;
  selectedSessions: Set<string>;
  setSelectedSessions: Dispatch<SetStateAction<Set<string>>>;
  expandedSession: string;
  onToggleDetails: (sessionId: string) => void;
  section: string;
  onSectionChange: (value: string) => void;
  correctness: string;
  onCorrectnessChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  onDeleteRequest: (dialog: Exclude<DeleteDialog, null>) => void;
}) {
  const [selectedResponse, setSelectedResponse] = useState<AdminResponseObservation | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const allPageSelected = sessions.length > 0 && sessions.every((session) => selectedSessions.has(session.sessionId));
  const toggleAll = () => setSelectedSessions((current) => {
    const next = new Set(current);
    for (const session of sessions) allPageSelected ? next.delete(session.sessionId) : next.add(session.sessionId);
    return next;
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-xs font-semibold tracking-[.14em] text-primary">RESPONSE DATA</p><h2 className="mt-2 text-2xl font-semibold">응시 세션별 사용자 응답</h2><p className="mt-2 text-sm font-medium text-gray-500">총 {total.toLocaleString()}개의 제출 세션</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={section} onChange={(event) => onSectionChange(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold"><option value="">전체 영역</option><option value="reading">읽기</option><option value="listening">듣기</option></select>
          <select value={correctness} onChange={(event) => onCorrectnessChange(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold"><option value="">전체 결과</option><option value="correct">정답 포함</option><option value="incorrect">오답 포함</option><option value="unanswered">미응답 포함</option></select>
          <button disabled={!selectedSessions.size} onClick={() => onDeleteRequest({ mode: "selected" })} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-40">선택 삭제 ({selectedSessions.size})</button>
          <button onClick={() => onDeleteRequest({ mode: "all" })} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">전체 삭제</button>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500"><tr><th className="p-3"><input type="checkbox" checked={allPageSelected} onChange={toggleAll} aria-label="현재 페이지 전체 선택" /></th><th className="p-3">제출 시각</th><th className="p-3">시험</th><th className="p-3">점수</th><th className="p-3">실제/미응답</th><th className="p-3">정답/오답</th><th className="p-3">별점</th><th className="p-3">상세</th></tr></thead>
          <tbody>{sessions.map((session) => (
            <Fragment key={session.sessionId}>
              <tr className="border-b border-gray-100"><td className="p-3"><input type="checkbox" checked={selectedSessions.has(session.sessionId)} onChange={() => setSelectedSessions((current) => { const next = new Set(current); next.has(session.sessionId) ? next.delete(session.sessionId) : next.add(session.sessionId); return next; })} aria-label={`${session.sessionId} 선택`} /></td><td className="p-3 text-xs text-gray-500">{new Date(session.submittedAt).toLocaleString("ko-KR")}</td><td className="p-3"><b className="block text-xs">{session.mockTestTitle}</b><span className="text-xs text-gray-400">{session.mode === "timed" ? "실전" : "연습"}</span></td><td className="p-3 font-semibold text-primary">{session.score}/{session.maxScore}</td><td className="p-3"><b>{session.answeredCount}</b> / <span className="text-orange-500">{session.unansweredCount}</span></td><td className="p-3"><span className="text-green-700">{session.correctCount}</span> / <span className="text-red-600">{session.incorrectCount}</span></td><td className="p-3 font-semibold">{session.rating ? `${session.rating}점` : "—"}</td><td className="p-3"><button onClick={() => onToggleDetails(session.sessionId)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">보기 <ChevronDown className={`size-3 transition ${expandedSession === session.sessionId ? "rotate-180" : ""}`} /></button></td></tr>
              {expandedSession === session.sessionId && <tr><td colSpan={8} className="bg-gray-50 p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">{details[session.sessionId]?.map((response) => <button type="button" key={response.observationId} aria-label={`${response.itemOrder}번 문제 보기`} onClick={(event) => { returnFocusRef.current = event.currentTarget; setSelectedResponse(response); }} className={`focus-ring rounded-xl border p-3 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm ${response.isCorrect ? "border-green-200 bg-green-50" : response.selectedOption ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}`}><b className="text-sm">{response.itemOrder}번</b><p className="mt-1 truncate text-gray-500">{response.itemType}</p><p className="mt-2 font-semibold">{response.selectedOption ?? "미응답"} → {response.correctAnswer}</p><p className="mt-1 text-[10px] text-gray-400">{formatDuration(response.responseTimeMs)}{response.answerChanged ? " · 변경" : ""}</p></button>) ?? <p className="col-span-full py-6 text-center text-gray-400">불러오는 중...</p>}</div></td></tr>}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
      {!sessions.length && <p className="py-16 text-center text-sm font-semibold text-gray-400">응답 세션이 없습니다.</p>}
      <div className="mt-5 flex items-center justify-end gap-3"><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">이전</button><span className="text-xs font-semibold text-gray-500">{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">다음</button></div>
      {selectedResponse && <ResponseQuestionDialog response={selectedResponse} token={token} returnFocusRef={returnFocusRef} onClose={() => setSelectedResponse(null)} />}
    </section>
  );
}
