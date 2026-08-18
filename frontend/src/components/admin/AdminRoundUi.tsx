import { ArrowLeft, CalendarDays, LoaderCircle, Search, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AdminRoundMetric = { label: string; value: string; icon: LucideIcon };

export function AdminRoundListHeader({ eyebrow, title, description, registeredCount, newCount }: {
  eyebrow: string;
  title: string;
  description: string;
  registeredCount: number;
  newCount: number;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold tracking-[.14em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm font-medium text-gray-500">{description}</p>
      </div>
      <div className="flex gap-2 text-xs font-semibold">
        <span className="rounded-full bg-primary-50 px-3 py-2 text-primary">등록 회차 {registeredCount}</span>
        <span className="rounded-full bg-gray-100 px-3 py-2 text-gray-600">새 세트 {newCount}</span>
      </div>
    </div>
  );
}

export function AdminRoundStatusBadge({ linked, published }: { linked: boolean; published: boolean | null }) {
  const label = published ? "공개" : linked ? "비공개" : "미등록";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${published ? "bg-green-50 text-green-700" : linked ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"}`}>{label}</span>;
}

export function AdminRoundCard({ testId, roundLabel, linked, published, title, setId, metrics, createdAt, readiness, actions }: {
  testId: string;
  roundLabel: string;
  linked: boolean;
  published: boolean | null;
  title: string;
  setId: string;
  metrics: AdminRoundMetric[];
  createdAt: string;
  readiness?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <article data-testid={testId} className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${linked ? "bg-primary-100 text-primary-dark" : "bg-gray-100 text-gray-700"}`}>{roundLabel}</span>
        <AdminRoundStatusBadge linked={linked} published={published} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 truncate text-[11px] font-medium text-gray-400" title={setId}>{setId}</p>
      <div className={`mt-4 grid gap-2 text-xs font-semibold ${metrics.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {metrics.map(({ label, value, icon: Icon }) => <p key={label} className="rounded-xl bg-gray-50 p-3"><Icon className="mb-2 size-4 text-primary" />{label}<b className="float-right text-gray-700">{value}</b></p>)}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-400"><CalendarDays className="size-3.5" />{new Date(createdAt).toLocaleDateString("ko-KR")}</p>
      {readiness && <div className="mt-3">{readiness}</div>}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">{actions}</div>
    </article>
  );
}

export function AdminRoundDetailHeader({ eyebrow, title, summary, onBack, actions }: {
  eyebrow: string;
  title: string;
  summary: string;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <button type="button" onClick={onBack} className="focus-ring mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"><ArrowLeft className="size-4" />회차 목록</button>
        <p className="text-xs font-semibold tracking-[.14em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-xs font-semibold text-gray-400">{summary}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function AdminRoundSearch({ value, onChange, placeholder, width = "w-56" }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width?: string;
}) {
  return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3"><Search className="size-4 text-gray-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${width} py-2.5 text-sm font-medium outline-none`} /></label>;
}

export function AdminRoundLoading() {
  return <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>;
}

export function AdminRoundEmpty({ children }: { children: ReactNode }) {
  return <p className="py-16 text-center text-sm font-semibold text-gray-400">{children}</p>;
}
