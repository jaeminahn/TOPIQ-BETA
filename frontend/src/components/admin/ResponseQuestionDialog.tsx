import { Headphones, LoaderCircle, Play, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { adminApi } from "../../api";
import type { AdminResponseObservation } from "../../types";
import { QuestionCard } from "../QuestionCard";

const formatDuration = (milliseconds: number) => milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(1)}초`;

export function ResponseQuestionDialog({
  response,
  token,
  returnFocusRef,
  onClose,
}: {
  response: AdminResponseObservation;
  token: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, audio[controls], [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  const loadAudio = () => {
    if (!response.question.audioAssetId || audioLoading) return;
    setAudioLoading(true);
    setAudioError("");
    let request: ReturnType<typeof adminApi.audioUrl>;
    try {
      request = adminApi.audioUrl(token, response.question.audioAssetId);
    } catch (cause) {
      setAudioError(cause instanceof Error ? cause.message : "음원을 불러오지 못했습니다.");
      setAudioLoading(false);
      return;
    }
    void request
      .then((result) => {
        if (result.audioUrl) setAudioUrl(result.audioUrl);
        else setAudioError("음원을 불러오지 못했습니다.");
      })
      .catch((cause: unknown) => setAudioError(cause instanceof Error ? cause.message : "음원을 불러오지 못했습니다."))
      .finally(() => setAudioLoading(false))
      .catch(() => undefined);
  };

  const resultLabel = response.selectedOption === null
    ? response.timedOut ? "시간 초과 미응답" : "건너뜀"
    : response.isCorrect ? "정답" : "오답";

  return (
    <div data-testid="response-question-backdrop" className="fixed inset-0 z-50 grid place-items-center bg-gray-950/50 p-3 backdrop-blur-sm sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="response-question-title" className="flex max-h-[calc(100dvh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-gray-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[.12em] text-primary">{response.section === "listening" ? "LISTENING" : "READING"} RESPONSE</p>
            <h2 id="response-question-title" className="mt-1 text-xl font-semibold">{response.itemOrder}번 응답 문제</h2>
            <p className="mt-1 text-xs font-medium text-gray-400">문항 {response.itemId} · v{response.itemVersion}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"><X className="size-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-3 py-2 ${response.isCorrect ? "bg-green-100 text-green-700" : response.selectedOption === null ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>{resultLabel}</span>
            <span className="rounded-full bg-white px-3 py-2 text-gray-600">선택 {response.selectedOption ?? "미응답"} · 정답 {response.correctAnswer}</span>
            <span className="rounded-full bg-white px-3 py-2 text-gray-600">응답 시간 {formatDuration(response.responseTimeMs)}</span>
            {response.answerChanged && <span className="rounded-full bg-white px-3 py-2 text-gray-600">답안 변경</span>}
          </div>

          {response.section === "listening" && response.question.audioAssetId && (
            <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Headphones className="size-5 text-primary" />
                {audioUrl
                  ? <audio src={audioUrl} controls autoPlay className="h-10 min-w-0 flex-1" />
                  : <button type="button" disabled={audioLoading} onClick={loadAudio} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{audioLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}음원 재생</button>}
              </div>
              {audioError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{audioError}</p>}
            </div>
          )}

          <QuestionCard question={response.question} disabled showResult={{ correctAnswer: response.correctAnswer }} transcriptMode="visible" />

          <article className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold tracking-[.1em] text-primary">EXPLANATION</p>
            <h3 className="mt-1 font-semibold">해설</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-7 text-gray-700">{response.explanation || "등록된 해설이 없습니다."}</p>
          </article>
        </div>
      </div>
    </div>
  );
}
