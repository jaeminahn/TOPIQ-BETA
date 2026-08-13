import { ArrowRight, BookOpen, Clock3, Headphones, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getSessionToken } from "../api";
import { readCompletedResults } from "../completedResults";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { groupExamsByRound } from "../examRounds";
import { useI18n } from "../i18n";
import type { Exam, ExamMode } from "../types";

export function LandingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [modes, setModes] = useState<Record<string, ExamMode>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedResults] = useState(readCompletedResults);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.exams();
      setExams(data);
      setModes(Object.fromEntries(data.map((exam) => [exam.id, "timed"])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const examRounds = groupExamsByRound(exams);
  const roundPalettes = [
    { shell: "border-gray-200 bg-gray-50", badge: "bg-gray-100 text-gray-700" },
  ];

  const start = async (exam: Exam) => {
    setStarting(exam.id);
    setError(null);
    try {
      const created = await api.createSession(exam.id, modes[exam.id] ?? "timed");
      navigate(`/session/${created.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
      setStarting(null);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <section className="bg-gray-50">
        <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 pb-8 pt-6 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
          <div>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.2] tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">{t("heroBody")}</p>
            <a href="#tests" className="focus-ring mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
              {t("chooseTest")} <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="mx-auto hidden w-full max-w-md lg:block">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mt-4 border-y border-gray-100 py-4">
                <p className="text-xs font-medium text-gray-400">QUESTION 25</p>
                <p className="mt-2 text-base font-semibold leading-6 text-gray-900">다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오.</p>
                <div className="mt-3 space-y-2">
                  {["①", "②", "③", "④"].map((number, index) => (
                    <div key={number} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium ${index === 1 ? "border-primary bg-primary-50 text-primary" : "border-gray-300 text-gray-500"}`}>
                      <span>{number}</span><span className="h-2 rounded-full bg-current opacity-25" style={{ width: `${54 + index * 8}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-medium">
                <span className="text-gray-500">24 / 50</span>
                <span className="flex items-center gap-2 text-primary"><Clock3 className="size-4" /> 38:24</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tests" className="bg-gray-100 py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{t("chooseTest")}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">{t("chooseSubtitle")}</p>
          </div>
          {loading ? <LoadingState /> : error && !exams.length ? <ErrorState message={error} retry={load} /> : (
            <div className="mt-4 space-y-4">
              {examRounds.map((group, groupIndex) => {
                const palette = roundPalettes[groupIndex % roundPalettes.length];
                const roundLabel = group.round === null ? t("otherTests") : `${group.round}${t("round")}`;
                return <section key={group.key} data-testid="exam-round" data-round={group.round ?? "other"} className={`rounded-2xl border p-3 ${palette.shell}`}>
                  <div className="mb-2">
                    <h3 className={`inline-block rounded-lg px-3 py-1.5 text-sm font-semibold ${palette.badge}`}>{roundLabel}</h3>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {group.exams.map((exam) => {
                      const mode = modes[exam.id] ?? "timed";
                      const completed = completedResults[exam.id];
                      const hasResult = Boolean(completed && getSessionToken(completed.sessionId));
                      return (
                        <article key={exam.id} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4">
                          <div className="flex items-start gap-4">
                            <span className="grid size-10 place-items-center rounded-lg bg-primary text-white">{exam.section === "listening" ? <Headphones className="size-5" /> : <BookOpen className="size-5" />}</span>
                          </div>
                          <h4 className="mt-3 text-lg font-semibold text-gray-900">{exam.titleKo}</h4>
                          <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600">{exam.descriptionKo}</p>
                          {hasResult && completed && <button type="button" onClick={() => navigate(`/session/${completed.sessionId}/results`)} className="focus-ring mt-3 flex min-h-11 items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-left text-green-900 hover:bg-green-100">
                            <span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-green-700">{t("recentScore")}</span><strong className="text-lg font-semibold">{completed.score} <span className="text-sm font-medium text-green-700">/ {completed.maxScore}</span></strong></span>
                            <span className="flex items-center gap-1 text-xs font-medium text-green-700">{t("viewResults")}<ArrowRight className="size-3.5" /></span>
                          </button>}
                          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Exam mode">
                            {(["timed", "practice"] as ExamMode[]).map((value) => (
                              <button key={value} onClick={() => setModes((current) => ({ ...current, [exam.id]: value }))} className={`focus-ring min-h-[60px] rounded-lg border p-2.5 text-left ${mode === value ? "border-primary bg-primary-50" : "border-gray-300 hover:border-primary-200"}`} aria-pressed={mode === value}>
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">{value === "timed" ? <Clock3 className="size-4 text-primary" /> : <RotateCcw className="size-4 text-primary" />}{t(value)}</span>
                                <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-gray-500">{value === "timed" ? `${Math.round(exam.durationSeconds / 60)}분 · ${t("autoSubmit")}` : t("practiceDesc")}</span>
                              </button>
                            ))}
                          </div>
                          <button disabled={starting !== null} onClick={() => void start(exam)} className="focus-ring mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                            {starting === exam.id ? t("loading") : t("start")} <ArrowRight className="size-4" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>;
              })}
            </div>
          )}
          {error && exams.length > 0 && <p className="mt-5 text-sm font-medium text-red-600">{error}</p>}
        </div>
      </section>

      <footer className="bg-gray-100 py-8 pb-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-200 pt-5 text-xs text-gray-500 sm:flex-row">
            <span className="font-medium text-gray-700">UNIGATE TOPIQ</span>
            <span>© 2026 UNIGATE. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
