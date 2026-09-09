import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function AdminPublishDialog({ open, publishing, busy, onClose, onConfirm }: {
  open: boolean; publishing: boolean; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden"; confirmRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [busy, onClose, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[75] grid place-items-center bg-gray-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="publish-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div className={`grid size-11 place-items-center rounded-xl ${publishing ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{publishing ? <Eye className="size-5" /> : <EyeOff className="size-5" />}</div><button disabled={busy} onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-gray-200"><X className="size-4" /></button></div>
      <h2 id="publish-dialog-title" className="mt-4 text-xl font-semibold">{publishing ? "이 회차를 공개할까요?" : "이 회차를 비공개로 전환할까요?"}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{publishing ? "준비 상태를 확인한 뒤 홈페이지 시험 목록에 즉시 노출합니다." : "신규 응시는 막히지만 이미 시작한 사용자는 저장된 문항으로 계속 풀 수 있습니다."}</p>
      <div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold">취소</button><button ref={confirmRef} disabled={busy} onClick={onConfirm} className={`min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50 ${publishing ? "bg-green-600" : "bg-red-600"}`}>{publishing ? "시험 공개" : "비공개 전환"}</button></div>
    </section>
  </div>;
}
