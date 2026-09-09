import { LoaderCircle, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../../api";
import type { AdminQuestionRevision, TranscriptTurn } from "../../../types";
import { QuestionCard } from "../../QuestionCard";

export interface EditableAdminQuestion {
  position: number; itemId: string; itemVersion: number; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
}

const text = (value: unknown) => typeof value === "string" ? value : "";
const turns = (value: unknown): TranscriptTurn[] => Array.isArray(value) ? value.flatMap((entry) => {
  if (!entry || typeof entry !== "object") return [];
  const row = entry as Record<string, unknown>;
  return text(row.speaker) && text(row.text) ? [{ speaker: text(row.speaker), text: text(row.text) }] : [];
}) : [];

export function AdminQuestionEditorDialog({ token, section, setId, setVersion, question, groupQuestions = [question], onClose, onSaved }: {
  token: string; section: "reading" | "listening"; setId: string; setVersion: number;
  question: EditableAdminQuestion; groupQuestions?: EditableAdminQuestion[];
  onClose: () => void; onSaved: (setVersion: number) => void;
}) {
  const [stem, setStem] = useState(question.stem);
  const [prompt, setPrompt] = useState(text(question.contentJson.question_prompt));
  const [passage, setPassage] = useState(text(question.contentJson.passage));
  const [auxiliary, setAuxiliary] = useState(text(question.contentJson.auxiliary_text));
  const [highlight, setHighlight] = useState(text(question.contentJson.highlight_text));
  const [choices, setChoices] = useState(() => Array.from({ length: 4 }, (_, index) => question.choices[index] ?? ""));
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer ?? 1);
  const [explanation, setExplanation] = useState(question.explanation);
  const [dialogue, setDialogue] = useState(() => turns(question.contentJson.dialogue_turns).map((turn) => `${turn.speaker}|${turn.text}`).join("\n"));
  const [repeatCount, setRepeatCount] = useState(Math.max(1, Number(question.contentJson.repeat_count) || 1));
  const originalVisuals = Array.isArray(question.contentJson.visual_options) ? question.contentJson.visual_options as Array<Record<string, unknown>> : [];
  const [visualDescriptions, setVisualDescriptions] = useState(() => originalVisuals.map((option) => text(option.description)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const originalDialogue = JSON.stringify(turns(question.contentJson.dialogue_turns));
  const parsedDialogue = dialogue.split("\n").flatMap((line) => {
    const divider = line.indexOf("|");
    if (divider < 1) return [];
    const speaker = line.slice(0, divider).trim(); const value = line.slice(divider + 1).trim();
    return speaker && value ? [{ speaker, text: value }] : [];
  });
  const commonChanged = section === "listening" && (JSON.stringify(parsedDialogue) !== originalDialogue || repeatCount !== Math.max(1, Number(question.contentJson.repeat_count) || 1));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden"; closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [busy, onClose]);

  const preview = useMemo(() => ({
    itemOrder: question.position, section, testPosition: question.position, itemId: question.itemId,
    itemVersion: question.itemVersion, itemType: "admin-preview", stem, passage, auxiliaryText: auxiliary,
    questionPrompt: prompt, highlightText: highlight, choices, selectedOption: null,
  }), [auxiliary, choices, highlight, passage, prompt, question, section, stem]);

  const makeRevision = (target: EditableAdminQuestion, selected: boolean): AdminQuestionRevision => {
    const contentJson = { ...target.contentJson };
    if (section === "listening") {
      if (commonChanged) { contentJson.dialogue_turns = parsedDialogue; contentJson.repeat_count = repeatCount; }
      if (selected) contentJson.question_prompt = prompt;
    } else if (selected) {
      contentJson.stem = stem; contentJson.passage = passage; contentJson.auxiliary_text = auxiliary;
      contentJson.highlight_text = highlight; contentJson.question_prompt = prompt;
    }
    if (selected && originalVisuals.length) {
      contentJson.visual_options = originalVisuals.map((option, index) => ({ ...option, description: visualDescriptions[index] ?? "" }));
    }
    if (selected) contentJson.choices = choices;
    return {
      position: target.position, itemId: target.itemId, itemVersion: target.itemVersion,
      stem: selected ? stem : target.stem,
      choices: selected ? choices : target.choices,
      correctAnswer: selected ? correctAnswer : target.correctAnswer ?? 1,
      explanation: selected ? explanation : target.explanation,
      contentJson,
    };
  };

  const save = async () => {
    if (section === "listening" && !parsedDialogue.length) return setError("대본은 ‘화자|내용’ 형식으로 한 줄 이상 입력해 주세요.");
    if (!originalVisuals.length && choices.some((choice) => !choice.trim())) return setError("선택지 4개를 모두 입력해 주세요.");
    setBusy(true); setError("");
    try {
      const targets = commonChanged ? groupQuestions : [question];
      const result = await adminApi.reviseQuestionSet(token, setId, setVersion, targets.map((target) => makeRevision(target, target.itemId === question.itemId)));
      onSaved(result.setVersion);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문항을 수정하지 못했습니다."); setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-gray-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="question-editor-title" className="mx-auto my-4 w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-primary">QUESTION REVISION</p><h2 id="question-editor-title" className="mt-1 text-xl font-semibold">{question.position}번 문제 수정</h2><p className="mt-1 text-xs text-gray-500">저장하면 문항과 세트 버전이 증가하고 연결 회차가 자동 비공개됩니다.</p></div><button ref={closeRef} onClick={onClose} disabled={busy} className="focus-ring grid size-10 place-items-center rounded-xl border border-gray-200"><X className="size-4" /></button></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><div className="space-y-4">
        {section === "reading" && <><Field label="지문" value={passage} onChange={setPassage} rows={5} /><Field label="보조 문장" value={auxiliary} onChange={setAuxiliary} /><Field label="강조 문장" value={highlight} onChange={setHighlight} /></>}
        {section === "listening" && <><Field label="공통 대본 (화자|내용, 한 줄에 한 발화)" value={dialogue} onChange={setDialogue} rows={7} /><label className="block text-sm font-semibold">반복 횟수<input type="number" min={1} max={5} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3" /></label></>}
        <Field label="문제 문장" value={section === "reading" ? stem : prompt} onChange={section === "reading" ? setStem : setPrompt} rows={3} />
        {!originalVisuals.length ? choices.map((choice, index) => <Field key={index} label={`선택지 ${index + 1}`} value={choice} onChange={(value) => setChoices((current) => current.map((entry, choiceIndex) => choiceIndex === index ? value : entry))} />) : visualDescriptions.map((description, index) => <Field key={index} label={`그림 선택지 ${index + 1} 설명`} value={description} onChange={(value) => setVisualDescriptions((current) => current.map((entry, choiceIndex) => choiceIndex === index ? value : entry))} />)}
        <label className="block text-sm font-semibold">정답<select value={correctAnswer} onChange={(event) => setCorrectAnswer(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3">{[1,2,3,4].map((value) => <option key={value} value={value}>{value}번</option>)}</select></label>
        <Field label="해설" value={explanation} onChange={setExplanation} rows={5} />
      </div><div><p className="mb-3 text-sm font-semibold text-gray-700">미리보기</p><QuestionCard question={preview} transcriptMode="hidden" onAnswer={() => undefined} /></div></div>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-gray-200 px-5 text-sm font-semibold">취소</button><button disabled={busy} onClick={() => void save()} className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} 새 버전 저장</button></div>
    </section>
  </div>;
}

function Field({ label, value, onChange, rows = 1 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label className="block text-sm font-semibold">{label}{rows > 1 ? <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 font-normal" /> : <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal" />}</label>;
}
