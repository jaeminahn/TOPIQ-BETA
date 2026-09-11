import { History, Image, LoaderCircle, Pencil, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { adminApi } from "../../../api";
import type { AdminReadingItem } from "../../../types";
import { RichQuestionText } from "../../question/QuestionContent";
import { AdminPromptCopyButton } from "../common/AdminPromptCopyButton";

const text = (value: unknown) => typeof value === "string" ? value : "";

export function ReadingQuestionCard({
  item, token, visualBusy, onRunVisualAction, onEdit, onHistory, onCrop, onError,
}: {
  item: AdminReadingItem;
  token: string;
  visualBusy: string;
  onRunVisualAction: (key: string, operation: () => Promise<unknown>) => Promise<void>;
  onEdit: () => void;
  onHistory: () => void;
  onCrop: (file: File) => void;
  onError: (message: string) => void;
}) {
  const material = item.materialVisual;
  const active = material?.generationStatus === "queued" || material?.generationStatus === "processing";
  const itemBusy = visualBusy.startsWith(`${item.itemId}:`);

  return <details className="rounded-2xl border border-gray-200 p-4 open:border-primary-100 open:bg-primary-50">
    <summary className="flex cursor-pointer list-none items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-white">{item.position}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.stem}</b><span className="text-xs font-semibold text-gray-400">{item.itemType}</span></span>
      {material && <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${material.imageUrl ? "bg-green-50 text-green-700" : active ? "bg-blue-50 text-blue-700" : material.generationStatus === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{material.imageUrl ? "그래프 준비" : active ? "그래프 생성 중" : material.generationStatus === "failed" ? "생성 실패" : "그래프 필요"}</span>}
      <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold">정답 {item.correctAnswer ?? "—"}</span>
    </summary>
    <div className="mt-5 border-t border-gray-200 pt-5">
      <div className="flex justify-end">
        <button type="button" aria-label={`${item.position}번 버전 이력`} onClick={onHistory} className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600"><History className="size-3" />이력</button>
      </div>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="whitespace-pre-wrap text-sm font-medium leading-7"><RichQuestionText text={item.stem} highlights={[text(item.contentJson.highlight_text)]} /></p>
          {material && <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="relative grid min-h-56 place-items-center bg-gray-50 p-4">
              {material.imageUrl ? <img src={material.imageUrl} alt={material.description || `${item.position}번 그래프`} className="max-h-[420px] w-full object-contain" /> : <div className="text-center text-gray-400"><Image className="mx-auto size-9" /><p className="mt-2 text-sm font-semibold">그래프 이미지가 아직 없습니다.</p></div>}
              {active && <div className="absolute inset-0 grid place-items-center bg-white/80"><div className="text-center text-primary"><LoaderCircle className="mx-auto size-8 animate-spin motion-reduce:animate-none" /><p aria-live="polite" className="mt-2 text-sm font-semibold">Gemini가 그래프를 생성하고 있습니다.</p></div></div>}
            </div>
            <div className="border-t border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={active || itemBusy} onClick={() => void onRunVisualAction(`${item.itemId}:generate`, () => adminApi.generateReadingMaterial(token, item.itemId, item.itemVersion, Boolean(material.visualAssetId)))} className="focus-ring flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-40">{visualBusy === `${item.itemId}:generate` ? <LoaderCircle className="size-4 animate-spin" /> : material.visualAssetId ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}{material.visualAssetId ? "다시 생성" : "그래프 생성"}</button>
                <AdminPromptCopyButton prompt={material.imagePrompt} ariaLabel={`${item.position}번 그래프 생성 프롬프트 복사`} onError={onError} />
                <label aria-label={`${item.position}번 그래프 업로드`} title="그래프 업로드" className={`focus-ring grid size-10 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 ${active || itemBusy ? "pointer-events-none opacity-40" : ""}`}><Upload className="size-4" /><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={active || itemBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onCrop(file); }} /></label>
                {material.visualAssetId && <button type="button" aria-label={`${item.position}번 그래프 삭제`} title="그래프 삭제" disabled={active || itemBusy} onClick={() => { if (window.confirm("이 그래프 이미지를 삭제할까요? 공개 시험에는 다시 텍스트 자료가 표시됩니다.")) void onRunVisualAction(`${item.itemId}:delete`, () => adminApi.deleteReadingMaterial(token, item.itemId, item.itemVersion, material.visualAssetId!)); }} className="focus-ring grid size-10 place-items-center rounded-lg border border-red-200 bg-white text-red-600 disabled:opacity-40"><Trash2 className="size-4" /></button>}
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">{material.description}</p>
              {material.generationError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{material.generationError}</p>}
            </div>
          </div>}
          <ol className="mt-4 space-y-2">{item.choices.map((choice, index) => <li key={index} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${item.correctAnswer === index + 1 ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>{index + 1}. {choice}</li>)}</ol>
          {item.visualOptions?.some((option) => option.imagePrompt.trim()) && <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold text-primary">그림·그래프 생성 프롬프트</p><div className="mt-3 space-y-2">{item.visualOptions.filter((option) => option.imagePrompt.trim()).map((option) => <div key={option.optionNumber} className="flex items-start gap-3 rounded-xl bg-white p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-gray-900 text-xs font-semibold text-white">{option.optionNumber}</span><p className="min-w-0 flex-1 text-xs leading-5 text-gray-600">{option.imagePrompt}</p><AdminPromptCopyButton prompt={option.imagePrompt} ariaLabel={`${item.position}번 ${option.optionNumber}번 보기 생성 프롬프트 복사`} onError={onError} /></div>)}</div></div>}
        </div>
        <div className="rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-primary">해설</p><button type="button" onClick={onEdit} className="flex min-h-10 items-center gap-1 rounded-lg border border-primary-100 px-3 text-xs font-semibold text-primary"><Pencil className="size-3" /> 문제 수정</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{item.explanation || "등록된 해설이 없습니다."}</p></div>
      </div>
    </div>
  </details>;
}
