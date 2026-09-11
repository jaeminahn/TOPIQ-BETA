import { Activity, AudioLines, BookOpen, CheckCircle2, Database, Headphones, Image, LayoutDashboard, Mail, MessageSquareText, TriangleAlert, Users, XCircle } from "lucide-react";
import type { AdminSummary, TtsJob } from "../../../types";

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return <div className="flex items-center gap-3 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><Icon className="size-4" /></span><div><p className="text-xs font-semibold text-gray-400">{label}</p><p className="mt-0.5 text-xl font-semibold text-gray-900">{value.toLocaleString()}</p></div></div>;
}

const displayDate = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return displayDate(new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10));
}

export function AdminOverview({ summary, jobs, emailBusy = false, onToggleEmail = async () => undefined }: {
  summary: AdminSummary; jobs: TtsJob[]; emailBusy?: boolean; onToggleEmail?: (enabled: boolean) => Promise<void>;
}) {
  const latestJobs = new Map<string, TtsJob>();
  for (const job of jobs) {
    const key = `${job.itemId}:${job.itemVersion}`;
    if (!latestJobs.has(key)) latestJobs.set(key, job);
  }
  const failedJobs = Array.from(latestJobs.values()).filter((job) => job.status === "failed");

  const email = summary.emailUsage;
  const used = email.acceptedCount + email.pendingCount;
  const progress = Math.min(100, email.limit ? used / email.limit * 100 : 0);
  const warningLabel = email.warningStatus === "accepted" ? "경고 발송 완료"
    : email.warningStatus === "pending" ? "경고 발송 대기"
      : email.warningStatus === "failed" ? "경고 발송 실패" : `${email.warningThreshold.toLocaleString()}건에서 경고`;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-6 sm:p-8"><p className="text-xs font-semibold tracking-[.14em] text-primary">DASHBOARD</p><h2 className="mt-2 text-2xl font-semibold">서비스 요약</h2></div>
      <div className="grid divide-y divide-gray-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <div className="p-6 sm:p-8"><h3 className="font-semibold">문제은행</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 문항" value={summary.totalItems} icon={Database} /><Metric label="전체 세트" value={summary.setCount} icon={LayoutDashboard} /><Metric label="읽기 문항" value={summary.readingVersions} icon={BookOpen} /><Metric label="듣기 문항" value={summary.listeningVersions} icon={Headphones} /></div></div>
        <div className="p-6 sm:p-8"><h3 className="font-semibold">듣기 자산</h3><div className="mt-3 grid grid-cols-2"><Metric label="준비 음원" value={summary.audioReady} icon={AudioLines} /><Metric label="누락 음원" value={summary.audioMissing} icon={Headphones} /><Metric label="이미지" value={summary.visualReady} icon={Image} /><Metric label="진행 작업" value={summary.jobsQueued + summary.jobsProcessing} icon={Activity} /></div>{failedJobs.length > 0 && <details className="mt-4 rounded-xl bg-red-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-red-700">최근 실패 {failedJobs.length}건</summary><div className="mt-3 space-y-2">{failedJobs.map((job) => <p key={job.jobId} className="break-all text-xs text-red-700">{job.errorMessage}</p>)}</div></details>}</div>
        <div className="p-6 sm:p-8"><h3 className="font-semibold">사용자 응답</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 응답" value={summary.responseCount} icon={MessageSquareText} /><Metric label="실제 응답" value={summary.answeredResponseCount} icon={CheckCircle2} /><Metric label="미응답" value={summary.unansweredResponseCount} icon={XCircle} /><Metric label="오늘 세션" value={summary.sessionsToday} icon={Users} /></div></div>
      </div>
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8" aria-labelledby="email-usage-title">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs font-semibold tracking-[.14em] text-primary">BREVO</p><h2 id="email-usage-title" className="mt-2 flex items-center gap-2 text-xl font-semibold"><Mail className="size-5 text-primary" />결과 이메일</h2><p className="mt-2 text-sm text-gray-500">{displayDate(email.cycleStart)} ~ {previousDate(email.cycleEnd)} · 수신자 기준</p></div>
        <div className="flex items-center gap-3"><span className={`text-sm font-semibold ${email.enabled ? "text-green-700" : "text-gray-500"}`}>{email.enabled ? "메일 ON" : "메일 OFF"}</span><button type="button" role="switch" aria-label="결과 이메일 발송" aria-checked={email.enabled} disabled={emailBusy || !email.configured} onClick={() => { const next = !email.enabled; if (!next && !window.confirm("신규 결과 이메일 발송을 중지할까요? 기존 결과 링크와 관리자 경고 메일은 유지됩니다.")) return; void onToggleEmail(next); }} className={`focus-ring relative h-7 w-12 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${email.enabled ? "bg-primary" : "bg-gray-300"}`}><span className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${email.enabled ? "left-6" : "left-1"}`} /></button></div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><div className="flex items-end justify-between gap-3"><p className="text-sm font-semibold text-gray-600">이번 결제 주기</p><p className="text-2xl font-semibold text-gray-900">{email.acceptedCount.toLocaleString()} <span className="text-sm text-gray-400">/ {email.limit.toLocaleString()}</span></p></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${used >= email.warningThreshold ? "bg-orange-500" : "bg-primary"}`} style={{ width: `${progress}%` }} /></div>{email.pendingCount > 0 && <p className="mt-2 text-xs font-semibold text-blue-600">처리 중 {email.pendingCount.toLocaleString()}건 포함</p>}</div>
        <div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-primary-50 px-5 py-3"><p className="text-xs font-semibold text-primary">남은 발송</p><p className="mt-1 text-lg font-semibold text-primary-dark">{email.remaining.toLocaleString()}</p></div><div className="rounded-xl bg-orange-50 px-5 py-3"><p className="flex items-center justify-center gap-1 text-xs font-semibold text-orange-700"><TriangleAlert className="size-3" />경고</p><p className="mt-1 text-xs font-semibold text-orange-800">{warningLabel}</p></div></div>
      </div>
      {!email.configured && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Brevo API·발신자·경고 수신자 설정을 확인해 주세요.</p>}
    </section>
  </div>;
}
