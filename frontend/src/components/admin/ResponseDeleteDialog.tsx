import { Trash2 } from "lucide-react";
import type { DeleteDialog } from "./AdminResponsesPanel";

export function ResponseDeleteDialog({ dialog, selectedCount, confirmation, busy, onConfirmationChange, onCancel, onConfirm }: {
  dialog: Exclude<DeleteDialog, null>;
  selectedCount: number;
  confirmation: string;
  busy: boolean;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bulkMode = dialog.mode === "all" || dialog.mode === "abandoned";
  const phrase = dialog.mode === "abandoned" ? "폐기 세션 전체 삭제" : "전체 응답 삭제";
  const title = dialog.mode === "abandoned" ? "폐기 세션 전체 삭제" : dialog.mode === "all" ? "전체 응답 삭제" : `${selectedCount}개 세션 삭제`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-7">
        <div className="grid size-11 place-items-center rounded-2xl bg-red-50 text-red-600"><Trash2 className="size-5" /></div>
        <h2 className="mt-5 text-xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-600">응답, 답안 변경 이벤트, 별점과 재생 기록이 함께 삭제되며 복구할 수 없습니다. 이메일 수신 동의는 유지됩니다.</p>
        {bulkMode && <label className="mt-5 block text-sm font-semibold text-red-700">확인을 위해 “{phrase}”를 입력하세요.<input autoFocus value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3 text-gray-900" /></label>}
        <div className="mt-6 flex justify-end gap-2"><button onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold">취소</button><button disabled={busy || (bulkMode && confirmation !== phrase)} onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">삭제</button></div>
      </div>
    </div>
  );
}
