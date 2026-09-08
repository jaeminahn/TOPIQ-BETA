import { Check, CircleAlert, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AdminPromptCopyButton({
  prompt,
  ariaLabel,
  onError,
}: {
  prompt: string;
  ariaLabel: string;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => { if (resetTimer.current !== null) window.clearTimeout(resetTimer.current); }, []);
  if (!prompt.trim()) return null;

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("클립보드를 사용할 수 없습니다.");
      await navigator.clipboard.writeText(prompt);
      setStatus("copied");
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2_000);
    } catch (cause) {
      setStatus("failed");
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2_000);
      onError(cause instanceof Error ? cause.message : "생성 프롬프트를 복사하지 못했습니다.");
    }
  };

  const statusText = status === "copied" ? "복사됨" : status === "failed" ? "복사 실패" : "";
  return <button type="button" aria-label={ariaLabel} title={statusText || ariaLabel} onClick={() => void copy()} className={`focus-ring grid size-9 shrink-0 place-items-center rounded-lg border bg-white ${status === "failed" ? "border-red-200 text-red-600" : "border-gray-200 text-gray-600 hover:border-primary-100 hover:text-primary"}`}>
    {status === "copied" ? <Check className="size-4 text-green-600" /> : status === "failed" ? <CircleAlert className="size-4" /> : <Copy className="size-4" />}
    <span aria-live="polite" className="sr-only">{statusText}</span>
  </button>;
}
