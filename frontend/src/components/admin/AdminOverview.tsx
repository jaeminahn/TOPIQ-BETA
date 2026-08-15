import { Activity, AudioLines, BookOpen, CheckCircle2, Database, Headphones, Image, LayoutDashboard, MessageSquareText, Users, XCircle } from "lucide-react";
import type { AdminSummary, TtsJob } from "../../types";

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return <div className="flex items-center gap-3 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><Icon className="size-4" /></span><div><p className="text-xs font-semibold text-gray-400">{label}</p><p className="mt-0.5 text-xl font-semibold text-gray-900">{value.toLocaleString()}</p></div></div>;
}

export function AdminOverview({ summary, jobs }: { summary: AdminSummary; jobs: TtsJob[] }) {
  const latestJobs = new Map<string, TtsJob>();
  for (const job of jobs) {
    const key = `${job.itemId}:${job.itemVersion}`;
    if (!latestJobs.has(key)) latestJobs.set(key, job);
  }
  const failedJobs = Array.from(latestJobs.values()).filter((job) => job.status === "failed");

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-6 sm:p-8"><p className="text-xs font-semibold tracking-[.14em] text-primary">DASHBOARD</p><h2 className="mt-2 text-2xl font-semibold">서비스 요약</h2></div>
      <div className="grid divide-y divide-gray-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <div className="p-6 sm:p-8"><h3 className="font-semibold">문제은행</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 문항" value={summary.totalItems} icon={Database} /><Metric label="전체 세트" value={summary.setCount} icon={LayoutDashboard} /><Metric label="읽기 문항" value={summary.readingVersions} icon={BookOpen} /><Metric label="듣기 문항" value={summary.listeningVersions} icon={Headphones} /></div></div>
        <div className="p-6 sm:p-8"><h3 className="font-semibold">듣기 자산</h3><div className="mt-3 grid grid-cols-2"><Metric label="준비 음원" value={summary.audioReady} icon={AudioLines} /><Metric label="누락 음원" value={summary.audioMissing} icon={Headphones} /><Metric label="이미지" value={summary.visualReady} icon={Image} /><Metric label="진행 작업" value={summary.jobsQueued + summary.jobsProcessing} icon={Activity} /></div>{failedJobs.length > 0 && <details className="mt-4 rounded-xl bg-red-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-red-700">최근 실패 {failedJobs.length}건</summary><div className="mt-3 space-y-2">{failedJobs.map((job) => <p key={job.jobId} className="break-all text-xs text-red-700">{job.errorMessage}</p>)}</div></details>}</div>
        <div className="p-6 sm:p-8"><h3 className="font-semibold">사용자 응답</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 응답" value={summary.responseCount} icon={MessageSquareText} /><Metric label="실제 응답" value={summary.answeredResponseCount} icon={CheckCircle2} /><Metric label="미응답" value={summary.unansweredResponseCount} icon={XCircle} /><Metric label="오늘 세션" value={summary.sessionsToday} icon={Users} /></div></div>
      </div>
    </section>
  );
}
