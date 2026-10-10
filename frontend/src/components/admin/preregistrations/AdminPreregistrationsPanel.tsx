import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../../api/adminApi";
import type { AdminPreregistration, AdminPreregistrationFilters, AdminPreregistrationList } from "../../../types";
import { AccessibleDialog } from "../../AccessibleDialog";

const initialFilters: AdminPreregistrationFilters = { deduplicate: false, search: "" };
const inputClass = "focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900";
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const sourceLabel = (source: AdminPreregistration["source"]) => source === "landing" ? "랜딩 페이지" : "TOPIK 결과 확인";

export function AdminPreregistrationsPanel({ token }: { token: string }) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AdminPreregistrationList>({ registrations: [], total: 0, page: 1, pageSize: 50 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminPreregistration | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const deleteInFlight = useRef(false);
  const downloadInFlight = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    void adminApi.preregistrations(token, filters, page).then((result) => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(result.total / 50));
      if (page > lastPage) {
        setPage(lastPage);
      } else {
        setData(result);
      }
    }).catch(() => {
      if (active) {
        setLoadFailed(true);
        setError("신청 목록을 불러오지 못했습니다. 날짜 범위와 필터를 확인한 뒤 다시 시도해 주세요.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, filters, page, refresh]);

  const updateFilter = <K extends keyof AdminPreregistrationFilters>(key: K, value: AdminPreregistrationFilters[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const applyFilters = () => {
    setFilters({ ...draft });
    setPage(1);
    setLoading(true);
  };
  const download = async () => {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    setDownloading(true);
    setError("");
    try {
      const file = await adminApi.downloadPreregistrations(token, filters);
      const url = URL.createObjectURL(file.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally { URL.revokeObjectURL(url); }
    } catch {
      setError("CSV를 다운로드하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      downloadInFlight.current = false;
      setDownloading(false);
    }
  };
  const closeDelete = () => { if (!deleteInFlight.current) { setDeleteTarget(null); setDeleteError(""); } };
  const confirmDelete = async () => {
    if (!deleteTarget || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await adminApi.deletePreregistration(token, deleteTarget.registrationId);
      setDeleteTarget(null);
      setLoading(true);
      setRefresh((current) => current + 1);
    } catch {
      setDeleteError("신청을 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-semibold text-gray-900">사전등록 신청</h2><p className="mt-2 text-sm leading-6 text-gray-500">신청 이력을 조회하고 조건에 맞는 전체 목록을 CSV로 내려받습니다.</p></div>
      <button type="button" disabled={loading || downloading || dirty || loadFailed} onClick={() => void download()} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Download className="size-4" />{downloading ? "다운로드 중..." : "CSV 다운로드"}</button>
    </div>
    <form className="mt-6 rounded-xl border border-gray-200 p-4" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-gray-600">유입 경로<select value={draft.source ?? ""} onChange={(event) => updateFilter("source", (event.target.value || undefined) as AdminPreregistrationFilters["source"])} className={inputClass}><option value="">전체 경로</option><option value="landing">랜딩 페이지 (001)</option><option value="topik_result">TOPIK 결과 확인 (002)</option></select></label>
        <label className="text-xs font-semibold text-gray-600">시작일 (KST)<input type="date" value={draft.from ?? ""} onChange={(event) => updateFilter("from", event.target.value || undefined)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-600">종료일 (KST)<input type="date" value={draft.to ?? ""} onChange={(event) => updateFilter("to", event.target.value || undefined)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-600">이메일 검색<input type="search" maxLength={320} value={draft.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="이메일 일부 입력" className={inputClass} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.deduplicate} onChange={(event) => updateFilter("deduplicate", event.target.checked)} className="focus-ring size-4 accent-primary" />이메일 중복 제거 (조건 내 최신 신청)</label>
        <button type="submit" disabled={downloading} className="focus-ring min-h-11 rounded-xl border border-primary px-5 text-sm font-semibold text-primary disabled:opacity-50">필터 적용</button>
      </div>
      {dirty && <p className="mt-3 text-xs text-gray-500">변경한 조건을 적용하면 목록과 CSV에 함께 반영됩니다.</p>}
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-gray-700">총 {data.total.toLocaleString()}건</p><button type="button" disabled={loading} onClick={() => setRefresh((current) => current + 1)} aria-label="사전등록 새로고침" className="focus-ring rounded-lg p-2 text-gray-600 disabled:opacity-50"><RefreshCw className="size-4" /></button></div>
    {loading ? <p role="status" className="py-10 text-center text-sm text-gray-500">신청 목록을 불러오는 중...</p> : loadFailed ? null : <div className="mt-3 overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600"><tr>{["신청 ID", "이메일", "유입 경로", "신청일 (KST)", "언어", "동의", "관리"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
        <tbody>{data.registrations.map((row) => <tr key={row.registrationId} className="border-b border-gray-100">
          <td className="px-3 py-4 font-mono text-xs">{row.registrationId}</td><td className="px-3 py-4">{row.email}</td><td className="px-3 py-4">{sourceLabel(row.source)}</td><td className="px-3 py-4">{dateFormat.format(new Date(row.consentedAt))}</td><td className="px-3 py-4">{row.locale === "ko" ? "한국어" : "English"}</td>
          <td className="px-3 py-4 text-xs text-gray-500"><span className="block">개인정보 {row.privacyConsent ? "동의" : "미동의"} · 마케팅 {row.marketingConsent ? "동의" : "미동의"}</span><span className="mt-1 block">{row.consentVersion}</span></td>
          <td className="px-3 py-4"><button type="button" aria-label={`${row.registrationId} 신청 삭제`} onClick={() => { setDeleteError(""); setDeleteTarget(row); }} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 className="size-4" />삭제</button></td>
        </tr>)}</tbody>
      </table>
      {!data.registrations.length && <p className="py-10 text-center text-sm text-gray-500">조건에 맞는 사전등록 신청이 없습니다.</p>}
    </div>}
    <div className="mt-5 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={loading || page === 1} onClick={() => setPage((current) => current - 1)} className="focus-ring min-h-11 rounded-xl border border-gray-200 px-4 disabled:opacity-40">이전</button><span>{page} / {Math.max(1, Math.ceil(data.total / 50))}</span><button type="button" disabled={loading || page * 50 >= data.total} onClick={() => setPage((current) => current + 1)} className="focus-ring min-h-11 rounded-xl border border-gray-200 px-4 disabled:opacity-40">다음</button></div>
    {deleteTarget && <AccessibleDialog title="사전등록 신청 삭제" closeLabel="닫기" busy={deleting} onClose={closeDelete}>
      <p className="mt-4 text-sm leading-6 text-gray-600">다음 신청 한 건을 영구 삭제합니다. 삭제한 신청은 복구할 수 없습니다.</p>
      <dl className="mt-4 rounded-xl bg-gray-50 p-4 text-sm"><dt className="text-xs text-gray-500">신청 ID</dt><dd className="mt-1 font-mono">{deleteTarget.registrationId}</dd><dt className="mt-3 text-xs text-gray-500">이메일</dt><dd className="mt-1 break-all">{deleteTarget.email}</dd></dl>
      {filters.deduplicate && <p className="mt-4 text-xs leading-5 text-gray-500">같은 이메일의 이전 신청이 있으면 삭제 후 해당 기록이 표시될 수 있습니다.</p>}
      {deleteError && <p role="alert" className="mt-4 text-sm text-red-700">{deleteError}</p>}
      <div className="mt-6 flex justify-end gap-2"><button data-autofocus type="button" disabled={deleting} onClick={closeDelete} className="focus-ring min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold">취소</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="focus-ring min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{deleting ? "삭제 중..." : "삭제"}</button></div>
    </AccessibleDialog>}
  </section>;
}
