import { LogOut, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

export function ExitConfirmationDialog({ open, variant, answered = 0, total = 0, onStay, onLeave }: {
  open: boolean;
  variant: "test" | "results";
  answered?: number;
  total?: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { locale } = useI18n();
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    stayRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStay();
      if (event.key !== "Tab") return;
      const controls = [stayRef.current, document.getElementById("confirm-exit")].filter(Boolean) as HTMLElement[];
      const current = controls.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      controls[event.shiftKey ? (current - 1 + controls.length) % controls.length : (current + 1) % controls.length]?.focus();
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onStay, open]);
  if (!open) return null;
  const ko = locale === "ko";
  const title = variant === "test" ? (ko ? "정말 시험을 나가시겠어요?" : "Leave this test?") : (ko ? "결과 확인을 그만할까요?" : "Leave your results?");
  const body = variant === "test"
    ? (ko ? `${total}문제 중 ${answered}문제를 풀었고 ${Math.max(0, total - answered)}문제가 남았습니다. 진행 내용은 저장되며 다음에 이어서 풀 수 있습니다.` : `You answered ${answered} of ${total} questions. Your progress is saved so you can continue later.`)
    : (ko ? "시험 결과는 저장되어 있습니다. 지금 나가면 오답과 해설 확인을 중단합니다." : "Your result is saved. Leaving now stops your answer review.");
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-gray-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onStay(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="exit-title" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
      <h2 id="exit-title" className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button ref={stayRef} onClick={onStay} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><RotateCcw className="size-4" />{variant === "test" ? (ko ? "계속 풀기" : "Keep solving") : (ko ? "결과 계속 보기" : "Keep reviewing")}</button>
        <button id="confirm-exit" onClick={onLeave} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700"><LogOut className="size-4" />{ko ? "나가기" : "Leave"}</button>
      </div>
    </section>
  </div>;
}
