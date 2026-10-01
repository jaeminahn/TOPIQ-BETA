import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function AccessibleDialog({ title, closeLabel, busy = false, onClose, children }: {
  title: string; closeLabel: string; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const controls = useRef({ busy, onClose });
  useEffect(() => { controls.current = { busy, onClose }; }, [busy, onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
    ) ?? []);
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!controls.current.busy) controls.current.onClose();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      if (!elements.length) { panel.current?.focus(); return; }
      const next = index === -1 ? (event.shiftKey ? elements.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      elements[next]?.focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className="topiq-dialog-backdrop fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-gray-950/50 p-4" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} className="topiq-dialog-panel w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-xl font-semibold text-gray-900">{title}</h2>
        <button type="button" disabled={busy} aria-label={closeLabel} onClick={onClose} className="focus-ring rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"><X className="size-5" /></button>
      </div>
      {children}
    </section>
  </div>;
}
