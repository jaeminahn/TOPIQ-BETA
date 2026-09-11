import { LoaderCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../../api";
import type { AdminReadingItem, AdminReadingSet } from "../../../types";
import { AdminImageCropDialog } from "../common/AdminImageCropDialog";
import { AdminPublishDialog } from "../common/AdminPublishDialog";
import { AdminQuestionEditorDialog } from "../common/AdminQuestionEditorDialog";
import { AdminQuestionHistoryDialog } from "../common/AdminQuestionHistoryDialog";
import { AdminRoundDetailHeader, AdminRoundEmpty, AdminRoundLoading, AdminRoundSearch } from "../common/AdminRoundUi";
import { ReadingQuestionCard } from "./ReadingQuestionCard";
import { ReadingSetList } from "./ReadingSetList";

export function ReadingAdminPanel({
  token,
  sets,
  busy,
  onPublish,
  onTogglePublish = async () => undefined,
  onSetsChanged = async () => undefined,
  onError,
}: {
  token: string;
  sets: AdminReadingSet[];
  busy: string;
  onPublish: (set: AdminReadingSet) => Promise<void>;
  onTogglePublish?: (set: AdminReadingSet) => Promise<void>;
  onSetsChanged?: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selectedSet, setSelectedSet] = useState<AdminReadingSet | null>(null);
  const [items, setItems] = useState<AdminReadingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminReadingItem | null>(null);
  const [historyItem, setHistoryItem] = useState<AdminReadingItem | null>(null);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [visualBusy, setVisualBusy] = useState("");
  const [cropTarget, setCropTarget] = useState<{
    file: File; itemId: string; itemVersion: number; position: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedSet) return;
    const refreshed = sets.find((set) => set.setId === selectedSet.setId);
    if (refreshed) setSelectedSet(refreshed);
  }, [sets, selectedSet?.setId]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.position} ${item.itemType} ${item.stem}`.toLocaleLowerCase().includes(query));
  }, [items, search]);

  const loadItems = useCallback(async (set: AdminReadingSet, showLoading = false) => {
    if (showLoading) setLoadingItems(true);
    try {
      const result = await adminApi.readingItems(token, { setId: set.setId });
      setItems(result.items);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "읽기 문항을 불러오지 못했습니다.");
    } finally {
      if (showLoading) setLoadingItems(false);
    }
  }, [onError, token]);

  const openSet = async (set: AdminReadingSet) => {
    setCropTarget(null);
    setSelectedSet(set);
    setItems([]);
    setSearch("");
    await loadItems(set, true);
  };

  const hasActiveVisualJob = items.some((item) => item.materialVisual?.generationStatus === "queued" || item.materialVisual?.generationStatus === "processing");
  useEffect(() => {
    if (!selectedSet || !hasActiveVisualJob) return;
    const timer = window.setInterval(() => void loadItems(selectedSet), 4_000);
    return () => window.clearInterval(timer);
  }, [hasActiveVisualJob, loadItems, selectedSet]);

  const runVisualAction = async (key: string, operation: () => Promise<unknown>) => {
    if (!selectedSet) return;
    setVisualBusy(key);
    onError("");
    try {
      await operation();
      await Promise.all([loadItems(selectedSet), onSetsChanged()]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "그래프 이미지 요청에 실패했습니다.");
    } finally {
      setVisualBusy("");
    }
  };

  if (!selectedSet) {
    return <ReadingSetList sets={sets} busy={busy} onOpen={(set) => void openSet(set)} onPublish={(set) => void onPublish(set)} />;
  }

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
    <AdminRoundDetailHeader
      eyebrow="READING BANK"
      title={`${selectedSet.round !== null ? `읽기 ${selectedSet.round}회` : "새 읽기 세트"} · 문항 관리`}
      summary={`문항 ${selectedSet.itemCount}/50 · 유효 ${selectedSet.validItemCount}/50 · 그래프 ${selectedSet.visualReady}/${selectedSet.visualRequired}`}
      onBack={() => { setCropTarget(null); setHistoryItem(null); setSelectedSet(null); setItems([]); setSearch(""); }}
      actions={<>
        <AdminRoundSearch value={search} onChange={setSearch} placeholder="번호·유형·본문 검색" />
        <button type="button" disabled={Boolean(visualBusy) || selectedSet.visualRequired === 0 || selectedSet.visualReady >= selectedSet.visualRequired} onClick={() => void runVisualAction("generate-set", () => adminApi.generateReadingSetVisuals(token, selectedSet.setId))} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-primary-100 px-4 text-sm font-semibold text-primary disabled:opacity-40">{visualBusy === "generate-set" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 누락 그래프 생성</button>
        {selectedSet.mockTestId && <button type="button" title={!selectedSet.mockTestPublished && selectedSet.visualReady < selectedSet.visualRequired ? "10번 그래프를 준비한 뒤 공개할 수 있습니다." : undefined} disabled={Boolean(busy) || (!selectedSet.mockTestPublished && selectedSet.visualReady < selectedSet.visualRequired)} onClick={() => setPublishConfirm(true)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40 ${selectedSet.mockTestPublished ? "border-red-200 text-red-700" : "border-green-200 text-green-700"}`}>{selectedSet.mockTestPublished ? "비공개 전환" : "시험 공개"}</button>}
      </>}
    />

    {loadingItems ? <AdminRoundLoading /> : <div className="mt-6 space-y-3">
      {visibleItems.map((item) => <ReadingQuestionCard
        key={`${item.setId}-${item.position}`}
        item={item}
        token={token}
        visualBusy={visualBusy}
        onRunVisualAction={runVisualAction}
        onEdit={() => setEditing(item)}
        onHistory={() => setHistoryItem(item)}
        onCrop={(file) => setCropTarget({ file, itemId: item.itemId, itemVersion: item.itemVersion, position: item.position })}
        onError={onError}
      />)}
      {!visibleItems.length && <AdminRoundEmpty>표시할 문항이 없습니다.</AdminRoundEmpty>}
    </div>}

    {editing && <AdminQuestionEditorDialog token={token} section="reading" setId={editing.setId} question={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void Promise.all([loadItems(selectedSet), onSetsChanged()]); }} />}
    {historyItem && <AdminQuestionHistoryDialog token={token} setId={historyItem.setId} itemId={historyItem.itemId} position={historyItem.position} onClose={() => setHistoryItem(null)} />}
    <AdminPublishDialog open={publishConfirm} publishing={!selectedSet.mockTestPublished} busy={Boolean(busy)} onClose={() => setPublishConfirm(false)} onConfirm={() => { void onTogglePublish(selectedSet).finally(() => setPublishConfirm(false)); }} />
    {cropTarget && <AdminImageCropDialog file={cropTarget.file} title={`${cropTarget.position}번 그래프 크롭`} onCancel={() => setCropTarget(null)} onConfirm={(file) => {
      const target = cropTarget;
      setCropTarget(null);
      void runVisualAction(`${target.itemId}:upload`, () => adminApi.uploadReadingMaterial(token, target.itemId, target.itemVersion, file));
    }} />}
  </section>;
}
