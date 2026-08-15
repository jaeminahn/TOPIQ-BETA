import { ArrowLeft, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n";
import { questionTypeLabel } from "../../questionTypeLabels";
import type { Results } from "../../types";
import { QuestionCard } from "../QuestionCard";

export function IncorrectReview({ results }: { results: Results }) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const incorrectGroups = useMemo(() => {
    const groups = new Map<string, Results["incorrect"]>();
    for (const question of results.incorrect) {
      const key = `${question.section}:${question.itemType}`;
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    return Array.from(groups.values());
  }, [results.incorrect]);

  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold text-primary">REVIEW</p><h2 className="mt-1 text-xl font-semibold text-gray-900">{t("incorrect")} · {results.incorrectCount}</h2></div><Link to="/" className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"><ArrowLeft className="size-4" /> {t("home")}</Link></div>
      {results.incorrect.length === 0 ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-7 text-center font-medium text-green-700">{t("perfect")}</div> : (
        <>
          <div className="mt-5 rounded-2xl border border-gray-300 bg-white p-6">
            <p className="text-xs font-semibold tracking-[.12em] text-primary">{t("wrongAnswerSummary")}</p>
            <h3 className="mt-2 text-xl font-semibold text-gray-900">{t("wrongTypesAndQuestions")}</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{incorrectGroups.map((questions) => <button key={`${questions[0].section}-${questions[0].itemType}`} onClick={() => { const order = questions[0].itemOrder; setExpanded((current) => new Set(current).add(order)); document.getElementById(`incorrect-${order}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="focus-ring flex min-h-11 items-center justify-between rounded-xl border border-gray-300 p-3 text-left hover:border-primary-200 hover:bg-primary-50"><span><b className="block text-sm font-medium text-gray-900">{questionTypeLabel(questions[0].itemType, questions[0].section, locale)}</b><span className="mt-1 block text-xs font-medium text-gray-400">{questions.map((question) => `${question.itemOrder}${t("questionNumberSuffix")}`).join(", ")}</span></span><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">{questions.length}</span></button>)}</div>
          </div>
          <div className="mt-4 space-y-2">{results.incorrect.map((question) => {
            const isOpen = expanded.has(question.itemOrder);
            return <article id={`incorrect-${question.itemOrder}`} key={question.itemOrder} className="scroll-mt-20 overflow-hidden rounded-2xl border border-gray-300 bg-white"><button onClick={() => setExpanded((current) => { const next = new Set(current); isOpen ? next.delete(question.itemOrder) : next.add(question.itemOrder); return next; })} className="focus-ring flex min-h-11 w-full items-center gap-3 p-4 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-sm font-medium text-red-600">{question.itemOrder}</span><span className="min-w-0 flex-1"><b className="block text-sm font-medium text-gray-900">{questionTypeLabel(question.itemType, question.section, locale)}</b><span className="mt-1 block text-xs font-medium text-gray-500">{t("yourAnswer")} {question.selectedOption ?? t("noAnswer")} · {t("correctAnswer")} {question.correctAnswer}</span></span><ChevronDown className={`size-5 shrink-0 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`} /></button>{isOpen && <div className="border-t border-gray-100 bg-gray-50 p-3 sm:p-4"><QuestionCard question={question} disabled showResult={{ correctAnswer: question.correctAnswer }} /><div className="mx-3 rounded-b-2xl border border-t-0 border-primary-100 bg-primary-50 p-4 sm:mx-5 sm:p-5"><p className="text-xs font-semibold text-primary">{t("explanation")}</p><p className="question-copy mt-2 text-sm font-medium text-gray-700 sm:text-base">{question.explanation || "—"}</p></div></div>}</article>;
          })}</div>
        </>
      )}
    </section>
  );
}
