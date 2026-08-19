import { RotateCcw, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ActiveSessionEntry } from "../activeSessions";
import { useI18n } from "../i18n";

export function SessionResumeDialog({ entry, busy, onContinue, onRestart, onClose }: {
  entry: ActiveSessionEntry | null;
  busy: boolean;
  onContinue: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const ko = locale === "ko";
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!entry) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const buttons = [continueRef.current, document.getElementById("restart-session")].filter(Boolean) as HTMLElement[];
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index - 1 + buttons.length) % buttons.length : (index + 1) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [busy, entry, onClose]);
  if (!entry) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="resume-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h2 id="resume-title" className="text-xl font-semibold text-gray-900">{ko ? "진행 중인 시험이 있습니다" : "You have a test in progress"}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{ko ? `${entry.lastPosition}번 문제까지 이동한 기록이 있습니다. 이어서 풀거나 처음부터 다시 시작할 수 있습니다.` : `You reached question ${entry.lastPosition}. Continue where you left off or restart from the beginning.`}</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button ref={continueRef} disabled={busy} onClick={onContinue} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Play className="size-4" /> {ko ? "계속하기" : "Continue"}</button>
        <button id="restart-session" disabled={busy} onClick={onRestart} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-50"><RotateCcw className="size-4" /> {ko ? "다시하기" : "Restart"}</button>
      </div>
    </section>
  </div>;
}
