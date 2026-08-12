import { ArrowLeft, CheckCircle2, ChevronDown, CircleX, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, getSessionToken } from "../api";
import { saveCompletedResult } from "../completedResults";
import { Header } from "../components/Header";
import { QuestionCard } from "../components/QuestionCard";
import { ErrorState, LoadingState } from "../components/States";
import { useI18n } from "../i18n";
import type { Results } from "../types";
import { questionTypeLabel } from "../questionTypeLabels";

export function ResultsPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const token = sessionId ? getSessionToken(sessionId) : null;
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!sessionId || !token) return setLoading(false);
    setLoading(true);
    try {
      const loaded = await api.results(sessionId, token);
      saveCompletedResult(loaded);
      setResults(loaded);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "RESULTS_LOCKED") {
        navigate(`/session/${sessionId}/feedback`, { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : "Unable to load results");
    } finally {
      setLoading(false);
    }
  }, [navigate, sessionId, token]);
  useEffect(() => { void load(); }, [load]);

  const incorrectGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof results>["incorrect"]>();
    for (const question of results?.incorrect ?? []) {
      const key = `${question.section}:${question.itemType}`;
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    return Array.from(groups.values());
  }, [results]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !results) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={load} /></div>;

  const percentage = Math.round((results.score / results.maxScore) * 100);
  return (
    <div className="min-h-screen bg-gray-100">
      <Header compact />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <section className="rounded-2xl border border-gray-300 bg-white p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-primary">{locale === "id" ? results.titleId : results.titleKo}</p>
              <h1 className="mt-2 text-2xl font-semibold text-gray-900 sm:text-3xl">{t("resultTitle")}</h1>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                <span className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-green-700"><CheckCircle2 className="size-4 text-green-500" /> {50 - results.incorrectCount} / 50</span>
                <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-red-700"><CircleX className="size-4 text-red-500" /> {results.incorrectCount} {t("incorrect")}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <span className="grid size-11 place-items-center rounded-xl bg-primary-50 text-primary"><Trophy className="size-6" /></span>
              <div><p className="text-[11px] font-semibold text-gray-400">{t("score")}</p><p className="text-3xl font-semibold text-gray-900"><span className="text-primary">{results.score}</span><span className="text-lg text-gray-400"> / {results.maxScore}</span></p><p className="text-[11px] font-medium text-gray-500">{percentage}%</p></div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs font-semibold text-primary">REVIEW</p><h2 className="mt-1 text-xl font-semibold text-gray-900">{t("incorrect")} · {results.incorrectCount}</h2></div>
            <Link to="/" className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"><ArrowLeft className="size-4" /> {t("home")}</Link>
          </div>
          {results.incorrect.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-7 text-center font-medium text-green-700">{t("perfect")}</div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-gray-300 bg-white p-6">
                <p className="text-xs font-semibold tracking-[.12em] text-primary">WRONG ANSWER SUMMARY</p>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">{locale === "ko" ? "틀린 유형과 문제" : "Jenis dan nomor soal yang salah"}</h3>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {incorrectGroups.map((questions) => <button key={`${questions[0].section}-${questions[0].itemType}`} onClick={() => { const order = questions[0].itemOrder; setExpanded((current) => new Set(current).add(order)); document.getElementById(`incorrect-${order}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="focus-ring flex min-h-11 items-center justify-between rounded-xl border border-gray-300 p-3 text-left hover:border-primary-200 hover:bg-primary-50"><span><b className="block text-sm font-medium text-gray-900">{questionTypeLabel(questions[0].itemType, questions[0].section, locale)}</b><span className="mt-1 block text-xs font-medium text-gray-400">{questions.map((question) => `${question.itemOrder}${locale === "ko" ? "번" : ""}`).join(", ")}</span></span><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">{questions.length}</span></button>)}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {results.incorrect.map((question) => {
                  const isOpen = expanded.has(question.itemOrder);
                  return <article id={`incorrect-${question.itemOrder}`} key={question.itemOrder} className="scroll-mt-20 overflow-hidden rounded-2xl border border-gray-300 bg-white"><button onClick={() => setExpanded((current) => { const next = new Set(current); isOpen ? next.delete(question.itemOrder) : next.add(question.itemOrder); return next; })} className="focus-ring flex min-h-11 w-full items-center gap-3 p-4 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-sm font-medium text-red-600">{question.itemOrder}</span><span className="min-w-0 flex-1"><b className="block text-sm font-medium text-gray-900">{questionTypeLabel(question.itemType, question.section, locale)}</b><span className="mt-1 block text-xs font-medium text-gray-500">{t("yourAnswer")} {question.selectedOption ?? t("noAnswer")} · {t("correctAnswer")} {question.correctAnswer}</span></span><ChevronDown className={`size-5 shrink-0 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`} /></button>{isOpen && <div className="border-t border-gray-100 bg-gray-50 p-3 sm:p-4"><QuestionCard question={question} disabled showResult={{ correctAnswer: question.correctAnswer }} /><div className="mx-3 rounded-b-2xl border border-t-0 border-primary-100 bg-primary-50 p-4 sm:mx-5 sm:p-5"><p className="text-xs font-semibold text-primary">{t("explanation")}</p><p className="question-copy mt-2 text-sm font-medium text-gray-700 sm:text-base">{question.explanation || "—"}</p></div></div>}</article>;
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
