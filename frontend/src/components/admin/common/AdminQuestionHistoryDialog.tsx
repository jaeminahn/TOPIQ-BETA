import { History, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import type { AdminQuestionVersion, TranscriptTurn } from "../../../types";

const text = (value: unknown) => typeof value === "string" ? value : "";
const transcript = (value: unknown): TranscriptTurn[] => Array.isArray(value) ? value.flatMap((entry) => {
  if (!entry || typeof entry !== "object") return [];
  const turn = entry as Record<string, unknown>;
  return text(turn.speaker) && text(turn.text) ? [{ speaker: text(turn.speaker), text: text(turn.text) }] : [];
}) : [];

export function AdminQuestionHistoryDialog({ token, setId, itemId, position, onClose }: {
  token: string; setId: string; itemId: string; position: number; onClose: () => void;
}) {
  const [versions, setVersions] = useState<AdminQuestionVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void adminApi.questionVersions(token, setId, itemId).then((result) => {
      if (active) setVersions(result.versions);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "버전 이력을 불러오지 못했습니다.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [itemId, setId, token]);

  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-gray-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="question-history-title" className="mx-auto my-4 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><p className="flex items-center gap-2 text-xs font-semibold text-primary"><History className="size-4" /> VERSION HISTORY</p><h2 id="question-history-title" className="mt-1 text-xl font-semibold">{position}번 문항 버전 이력</h2><p className="mt-1 text-xs text-gray-500">최신 버전부터 표시합니다. 과거 버전은 열람만 가능합니다.</p></div>
        <button type="button" aria-label="버전 이력 닫기" onClick={onClose} className="focus-ring grid size-10 place-items-center rounded-xl border border-gray-200"><X className="size-4" /></button>
      </div>
      {loading && <div className="grid min-h-48 place-items-center"><LoaderCircle aria-label="불러오는 중" className="size-6 animate-spin text-primary" /></div>}
      {error && <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && <div className="mt-6 space-y-4">{versions.map((version) => <VersionCard key={version.itemVersion} version={version} />)}{!versions.length && <p className="py-12 text-center text-sm text-gray-500">저장된 버전이 없습니다.</p>}</div>}
    </section>
  </div>;
}

function VersionCard({ version }: { version: AdminQuestionVersion }) {
  const prompt = text(version.contentJson.question_prompt);
  const passage = text(version.contentJson.passage);
  const auxiliary = text(version.contentJson.auxiliary_text);
  const turns = transcript(version.contentJson.dialogue_turns);
  return <article className={`rounded-2xl border p-5 ${version.isCurrent ? "border-primary-200 bg-primary-50" : "border-gray-200 bg-gray-50"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="font-semibold">문항 v{version.itemVersion}</h3>{version.isCurrent && <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">현재</span>}</div><time className="text-xs font-medium text-gray-500" dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString("ko-KR")}</time></div>
    <div className="mt-4 space-y-3 text-sm leading-6">
      {passage && <ReadOnlyField label="지문" value={passage} />}
      {auxiliary && <ReadOnlyField label="보조 문장" value={auxiliary} />}
      {turns.length > 0 && <div><p className="text-xs font-semibold text-gray-500">대본</p><div className="mt-1 rounded-xl bg-white p-3">{turns.map((turn, index) => <p key={index}><b>{turn.speaker}</b> {turn.text}</p>)}</div></div>}
      <ReadOnlyField label="문제" value={prompt || version.stem} />
      <ol className="grid gap-2 sm:grid-cols-2">{version.choices.map((choice, index) => <li key={index} className={`rounded-xl border bg-white px-3 py-2 ${version.correctAnswer === index + 1 ? "border-green-300 text-green-800" : "border-gray-200"}`}><b>{index + 1}.</b> {choice}</li>)}</ol>
      <ReadOnlyField label={`정답 ${version.correctAnswer ?? "—"}`} value={version.explanation || "등록된 해설이 없습니다."} />
    </div>
  </article>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold text-gray-500">{label}</p><p className="mt-1 whitespace-pre-wrap rounded-xl bg-white p-3">{value || "—"}</p></div>;
}
