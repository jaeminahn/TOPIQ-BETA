import { ArrowRight, BookOpen, CheckCircle2, Clock3, Headphones, RotateCcw, ShieldCheck } from "lucide-react";
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
  const { locale, t } = useI18n();
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
    { shell: "border-primary-100 bg-primary-50/60", badge: "bg-primary-100 text-primary-dark" },
    { shell: "border-primary-100 bg-primary-50/40", badge: "bg-primary-50 text-primary-dark" },
    { shell: "border-gray-200 bg-gray-50/60", badge: "bg-gray-100 text-gray-700" },
    { shell: "border-gray-200 bg-gray-50/40", badge: "bg-gray-100 text-gray-700" },
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
      <section className="hero-glow relative overflow-hidden">
        <div className="brand-grid pointer-events-none absolute inset-0" />
        <Header />
        <div className="relative mx-auto grid max-w-5xl items-center gap-6 px-4 pb-6 pt-5 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
          <div>
            {/* <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/75 px-4 py-2 text-xs font-extrabold tracking-[0.16em] text-primary shadow-sm backdrop-blur">
              <Sparkles className="size-4" /> {t("heroEyebrow")}
            </span> */}
            <h1 className="max-w-3xl text-[30px] font-black leading-[1.12] tracking-[-0.035em] text-gray-900 sm:text-4xl lg:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-gray-600 sm:text-base sm:leading-7">{t("heroBody")}</p>
            <a href="#tests" className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(45,94,197,.24)] hover:bg-primary-dark">
              {t("chooseTest")} <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="absolute -inset-4 rounded-[36px] bg-gradient-to-br from-primary-100/55 to-primary-50/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-white bg-white/90 p-5 shadow-[0_22px_60px_rgba(35,70,130,.15)] backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-extrabold text-primary">TOPIK II · READING</span>
                <span className="text-xs font-bold text-gray-400">50 QUESTIONS</span>
              </div>
              <div className="mt-4 border-y border-gray-100 py-4">
                <p className="text-xs font-bold text-gray-400">QUESTION 25</p>
                <p className="mt-2 text-base font-extrabold leading-6 text-gray-900">다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오.</p>
                <div className="mt-3 space-y-2">
                  {["①", "②", "③", "④"].map((number, index) => (
                    <div key={number} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-semibold ${index === 1 ? "border-primary bg-primary-50 text-primary" : "border-gray-300 text-gray-500"}`}>
                      <span>{number}</span><span className="h-2 rounded-full bg-current opacity-25" style={{ width: `${54 + index * 8}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-bold">
                <span className="text-gray-500">24 / 50</span>
                <span className="flex items-center gap-2 text-primary"><Clock3 className="size-4" /> 38:24</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tests" className="scroll-mt-4 bg-gray-100 py-5">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="max-w-2xl">
            {/* <p className="text-sm font-extrabold tracking-[0.14em] text-primary">MOCK TEST</p> */}
            <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{t("chooseTest")}</h2>
            <p className="mt-1 text-sm leading-5 text-gray-600 sm:leading-6">{t("chooseSubtitle")}</p>
          </div>
          {loading ? <LoadingState /> : error && !exams.length ? <ErrorState message={error} retry={load} /> : (
            <div className="mt-4 space-y-4">
              {examRounds.map((group, groupIndex) => {
                const palette = roundPalettes[groupIndex % roundPalettes.length];
                const roundLabel = group.round === null ? t("otherTests") : locale === "ko" ? `${group.round}${t("round")}` : `${t("round")} ${group.round}`;
                return <section key={group.key} data-testid="exam-round" data-round={group.round ?? "other"} className={`rounded-2xl border p-3 ${palette.shell}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className={`rounded-lg px-3 py-1.5 text-sm font-black ${palette.badge}`}>{roundLabel}</h3>
                    <span className="text-xs font-bold text-gray-400">TOPIK II</span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {group.exams.map((exam) => {
                      const mode = modes[exam.id] ?? "timed";
                      const completed = completedResults[exam.id];
                      const hasResult = Boolean(completed && getSessionToken(completed.sessionId));
                      return (
                        <article key={exam.id} className="flex min-w-0 flex-col rounded-3xl border border-white/90 bg-white p-4 shadow-[0_10px_26px_rgba(30,51,86,.05)]">
                          <div className="flex items-start justify-between gap-4">
                            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">{exam.section === "listening" ? <Headphones className="size-5" /> : <BookOpen className="size-5" />}</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-extrabold text-gray-500">{exam.section.toUpperCase()} · 50 × 2 PTS</span>
                          </div>
                          <h4 className="mt-3 text-xl font-black text-gray-900">{locale === "id" ? exam.titleId : exam.titleKo}</h4>
                          <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600">{locale === "id" ? exam.descriptionId : exam.descriptionKo}</p>
                          {hasResult && completed && <button type="button" onClick={() => navigate(`/session/${completed.sessionId}/results`)} className="focus-ring mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-left text-green-900 hover:bg-green-100/70">
                            <span className="min-w-0 flex-1"><span className="block text-[11px] font-black text-green-700">{t("recentScore")}</span><strong className="text-lg font-black">{completed.score} <span className="text-sm text-green-700">/ {completed.maxScore}</span></strong></span>
                            <span className="flex items-center gap-1 text-xs font-black text-green-700">{t("viewResults")}<ArrowRight className="size-3.5" /></span>
                          </button>}
                          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Exam mode">
                            {(["timed", "practice"] as ExamMode[]).map((value) => (
                              <button key={value} onClick={() => setModes((current) => ({ ...current, [exam.id]: value }))} className={`focus-ring min-h-[60px] rounded-xl border p-2.5 text-left ${mode === value ? "border-primary bg-primary-50 shadow-[0_0_0_1px_#2D5EC5]" : "border-gray-300 hover:border-primary-200"}`} aria-pressed={mode === value}>
                                <span className="flex items-center gap-1.5 text-sm font-extrabold text-gray-900">{value === "timed" ? <Clock3 className="size-4 text-primary" /> : <RotateCcw className="size-4 text-primary" />}{t(value)}</span>
                                <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-gray-500">{value === "timed" ? `${Math.round(exam.durationSeconds / 60)}${locale === "ko" ? "분" : " menit"} · ${t("autoSubmit")}` : t("practiceDesc")}</span>
                              </button>
                            ))}
                          </div>
                          <button disabled={starting !== null} onClick={() => void start(exam)} className="focus-ring mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white hover:bg-primary-dark disabled:opacity-60">
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
          {error && exams.length > 0 && <p className="mt-5 text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </section>

      <section id="guide" className="bg-gray-100 py-10 sm:py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="rounded-3xl bg-primary-dark px-5 py-8 text-white sm:px-8 lg:px-10">
            <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
              <div><BookOpen className="size-7 text-primary-100" /><h2 className="mt-3 text-2xl font-black leading-tight">{t("guideTitle")}</h2><p className="mt-3 text-sm leading-6 text-primary-100/80">{t("privacy")}</p></div>
              <div className="grid gap-3">
                {[t("guide1"), t("guide2"), t("guide3")].map((copy) => <div key={copy} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-100" /><p className="text-sm font-semibold leading-5 text-gray-100">{copy}</p></div>)}
              </div>
            </div>
          </div>
          <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-gray-300 pt-5 text-xs text-gray-500 sm:flex-row">
            <span className="flex items-center gap-2 font-bold text-gray-700"><ShieldCheck className="size-4 text-primary" /> UNIGATE TOPIK LAB</span>
            <span>© 2026 UNIGATE. All rights reserved.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
