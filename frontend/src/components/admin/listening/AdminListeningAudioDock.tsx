import { AudioLines, ChevronDown, ChevronUp, LoaderCircle, Play, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminListeningGroup, AdminNarrationScript, TtsStyle } from "../../../types";

export type BulkAudioProgress = {
  phase: "configure" | "submitting" | "running";
  targetCount: number;
  total: number;
  completed: number;
  failed: number;
  active: number;
};

const isGenerating = (group: AdminListeningGroup | null) =>
  group?.generationStatus === "queued" || group?.generationStatus === "processing";

const MIN_SPEAKING_RATE = 0.8;
const MAX_SPEAKING_RATE = 1.2;
const SPEAKING_RATE_STEP = 0.025;
const formatSpeakingRate = (rate: number) => rate.toFixed(3).replace(/0$/, "");

const styleSummary = (style: TtsStyle | null) => style
  ? `${formatSpeakingRate(style.speakingRate)}× · ${style.stylePrompt.trim() || "기본 스타일"}`
  : "적용된 음원 없음";

function timeline(group: AdminListeningGroup) {
  const script: AdminNarrationScript | null = isGenerating(group) && group.generationScript
    ? group.generationScript
    : group.audioStatus === "ready"
      ? group.appliedScript
      : null;
  if (script) return script.segments.map((segment) => {
    if (segment.kind === "bell") return "띵동 벨";
    if (segment.kind === "speech") return segment.text;
    if (segment.kind === "silence") return `${segment.durationMs / 1_000}초`;
    return `지문 ${segment.repeatIndex}회`;
  });
  const first = group.positions[0]!;
  if (group.positions.length === 1) return [
    "띵동 벨", "1초", `${first}번. ${group.questionPrompts[0] ?? ""}`.trim(), "1초", "지문 1회",
  ];
  return [
    "띵동 벨", "1초", "다음을 듣고 물음에 답하십시오.", "1초",
    "지문 1회", "1초", "다시 읽겠습니다.", "1초", "지문 2회", "1초",
    ...group.positions.flatMap((position, index) => index < group.positions.length - 1 ? [`${position}번.`, "1초"] : [`${position}번.`]),
  ];
}

export function AdminListeningAudioDock({
  group,
  bulk,
  draftStyle,
  audioUrl,
  audioLoading,
  audioError,
  busy,
  onDraftStyleChange,
  onPlay,
  onGenerate,
  onClose,
}: {
  group: AdminListeningGroup | null;
  bulk: BulkAudioProgress | null;
  draftStyle: TtsStyle;
  audioUrl: string;
  audioLoading: boolean;
  audioError: string;
  busy: boolean;
  onDraftStyleChange: (style: TtsStyle) => void;
  onPlay: () => void;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const identity = group?.leaderItemId ?? (bulk ? "bulk" : "");
  useEffect(() => setExpanded(true), [identity]);

  const generating = isGenerating(group) || bulk?.phase === "submitting" || Boolean(bulk?.active);
  const bulkFinished = Boolean(bulk?.phase === "running" && bulk.total > 0 && bulk.active === 0);
  const canPlay = Boolean(group?.audioAssetId) && !generating && !audioLoading;
  const canGenerate = !busy && !generating && (group !== null || bulk?.phase === "configure")
    && (group !== null || Boolean(bulk?.targetCount));
  const progress = bulk?.total ? Math.round(((bulk.completed + bulk.failed) / bulk.total) * 100) : 0;

  let status = "음원 설정";
  if (group?.generationStatus === "queued") status = "음원 생성 대기 중";
  else if (group?.generationStatus === "processing") status = "새 음원을 생성하고 적용하는 중";
  else if (group?.generationStatus === "failed") status = group.audioAssetId
    ? "재생성 실패 · 기존 음원 유지"
    : "음원 생성 실패";
  else if (audioLoading) status = "음원 불러오는 중";
  else if (audioUrl) status = "재생 준비";
  else if (group?.audioStatus === "legacy") status = "구형 음원 · 재생성 필요";
  else if (group?.audioAssetId) status = "음원 준비";
  else if (group) status = "음원 없음";
  else if (bulk?.phase === "configure") status = `${bulk.targetCount}개 누락 음원 생성 설정`;
  else if (bulk?.phase === "submitting") status = "생성 요청 등록 중";
  else if (bulk?.total === 0) status = "생성할 누락 음원이 없습니다";
  else if (bulkFinished && bulk) status = bulk.failed
    ? `일괄 생성 완료 · 성공 ${bulk.completed} · 실패 ${bulk.failed}`
    : `일괄 생성 완료 · ${bulk.completed}개 성공`;
  else if (bulk) status = `${bulk.total}개 중 ${bulk.completed}개 완료 · ${bulk.active}개 진행 중`;

  return (
    <aside
      role="region"
      aria-label="관리자 듣기 음원 재생바"
      data-testid="admin-listening-audio-dock"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-primary-100 bg-white/95 shadow-[0_-12px_32px_rgba(17,24,39,.14)] backdrop-blur"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-[1500px] px-5 pt-4 sm:px-8">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
            {generating ? <GenerationEffect /> : <AudioLines className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">
              {group ? `${group.positions.length > 1 ? `${group.positions[0]}~${group.positions.at(-1)}` : group.positions[0]}번 음원` : "누락 음원 일괄 생성"}
            </p>
            <p aria-live="polite" className={`mt-0.5 text-xs font-semibold ${group?.generationStatus === "failed" || bulk?.failed ? "text-red-600" : generating ? "text-primary" : "text-gray-500"}`}>{status}</p>
          </div>
          <button type="button" onClick={() => setExpanded((current) => !current)} className="focus-ring grid size-10 place-items-center rounded-lg text-gray-500 lg:hidden" aria-label={expanded ? "재생바 접기" : "재생바 펼치기"}>
            {expanded ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
          </button>
          <button type="button" onClick={onClose} className="focus-ring grid size-10 place-items-center rounded-lg text-gray-500" aria-label="재생바 닫기"><X className="size-5" /></button>
        </div>

        {bulk?.phase === "running" && bulk.total > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-label={`일괄 생성 진행률 ${progress}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className={`h-full rounded-full transition-[width] ${bulk.failed ? "bg-orange-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
          </div>
        )}

        {group && expanded && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-gray-400">
              {group.audioStatus === "ready" ? "적용된 재생 순서" : "생성 예정 순서"}
            </p>
            <ol aria-label="완성형 음원 재생 순서" className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold text-gray-600">
              {timeline(group).map((entry, index) => <li key={`${index}-${entry}`} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${entry === "1초" ? "bg-orange-50 text-orange-700" : "bg-gray-100"}`}>
                <span className="text-gray-400">{index + 1}</span>{entry}
              </li>)}
            </ol>
          </div>
        )}

        <div className={`${expanded ? "grid" : "hidden"} mt-4 gap-4 lg:grid lg:grid-cols-[minmax(260px,.9fr)_minmax(420px,1.4fr)_auto] lg:items-end`}>
          <div className="min-w-0">
            {group ? (
              <>
                <p className="mb-2 truncate text-[11px] font-semibold text-gray-400" title={styleSummary(group.ttsStyle)}>적용값 {styleSummary(group.ttsStyle)}</p>
                {audioUrl && !generating
                  ? <audio key={audioUrl} src={audioUrl} controls autoPlay className="h-10 w-full" />
                  : <button type="button" disabled={!canPlay} onClick={onPlay} className="focus-ring flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">
                    {audioLoading ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : <Play className="size-4" />}{audioLoading ? "불러오는 중" : generating ? "적용 후 재생 가능" : "음원 재생"}
                  </button>}
                {(audioError || group.lastError) && <p role="alert" className="mt-2 line-clamp-2 text-xs font-semibold text-red-600">{audioError || group.lastError}</p>}
              </>
            ) : (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
                {bulk?.phase === "configure"
                  ? `준비된 음원을 제외한 ${bulk.targetCount}개 그룹을 생성합니다.`
                  : bulk?.phase === "submitting"
                    ? "작업을 등록한 뒤 자동으로 진행률을 갱신합니다."
                    : bulk?.total
                      ? `완료 ${bulk.completed} · 진행 ${bulk.active} · 실패 ${bulk.failed}`
                      : "현재 생성 대상이 없습니다."}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[.65fr_1.35fr]">
            <label className="text-xs font-semibold text-gray-600">
              생성 말하기 속도 <span className="text-primary">{formatSpeakingRate(draftStyle.speakingRate)}×</span>
              <input aria-label="생성 말하기 속도" type="range" min={MIN_SPEAKING_RATE} max={MAX_SPEAKING_RATE} step={SPEAKING_RATE_STEP} value={draftStyle.speakingRate} disabled={generating} onChange={(event) => onDraftStyleChange({ ...draftStyle, speakingRate: Number(event.target.value) })} className="mt-2 block w-full accent-primary disabled:opacity-40" />
              <span className="mt-1 block text-[11px] font-normal text-gray-500">0.80×~1.20× · 0.025 단위</span>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              음원 스타일
              <input aria-label="음원 스타일" value={draftStyle.stylePrompt} maxLength={300} disabled={generating} onChange={(event) => onDraftStyleChange({ ...draftStyle, stylePrompt: event.target.value })} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-primary disabled:bg-gray-100 disabled:opacity-60" placeholder="예: 차분하고 또렷하게" />
              <span className="mt-1 block text-[11px] font-normal text-gray-500">말투 특성만 반영되며 반복·내용 지시는 안전하게 제외됩니다.</span>
            </label>
          </div>

          <button type="button" disabled={!canGenerate} onClick={onGenerate} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {generating || busy ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : <Sparkles className="size-4" />}
            {group ? (group.audioAssetId ? "음원 재생성 시작" : "음원 생성 시작") : bulk?.phase === "configure" ? "누락 음원 생성 시작" : bulkFinished ? "생성 완료" : "생성 중"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function GenerationEffect() {
  return <span aria-hidden="true" className="flex h-5 items-end gap-0.5">
    {[10, 18, 13, 20, 11].map((height, index) => <span key={index} className="w-0.5 rounded-full bg-white motion-safe:animate-pulse" style={{ height, animationDelay: `${index * 110}ms` }} />)}
  </span>;
}
