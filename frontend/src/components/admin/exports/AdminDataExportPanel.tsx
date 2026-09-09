import {
  BarChart3, CheckCircle2, Download, Filter, Info, LoaderCircle, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { questionTypeLabel } from "../../../questionTypeLabels";
import type { AdminExportFilters } from "../../../types";
import { ResponseDataGuide } from "./ResponseDataGuide";
import { exportDatasets, exportFieldGuides, exportFilterSummary } from "./exportConfig";
import { useAdminExport } from "./useAdminExport";

export function AdminDataExportPanel({ token }: { token: string }) {
  const {
    dataset, filters, options, preview, busy, error, selected,
    updateFilter, changeDataset, loadPreview, download,
  } = useAdminExport(token);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold tracking-[.14em] text-primary">DATA EXPORT</p>
            <h2 className="mt-2 text-2xl font-semibold">분석 데이터 추출</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-gray-500">CSV마다 한 행의 의미가 다릅니다. 아래 설명을 확인하고 조건을 적용한 뒤, 예상 행 수를 확인해야 다운로드할 수 있습니다.</p>
          </div>
          {dataset === "sessions" ? (
            <span className="flex w-fit items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"><TriangleAlert className="size-4" />개인정보: 이메일 원문 포함</span>
          ) : (
            <span className="flex w-fit items-center gap-2 rounded-full bg-green-50 px-3 py-2 text-xs font-semibold text-green-700"><ShieldCheck className="size-4" />이메일·접근 토큰 제외</span>
          )}
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-3" role="radiogroup" aria-label="추출 데이터 종류">
          {exportDatasets.map(({ id, title, description, rowUnit, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={dataset === id} onClick={() => changeDataset(id)} className={`focus-ring rounded-2xl border p-5 text-left transition ${dataset === id ? "border-primary bg-primary-50 shadow-sm" : "border-gray-200 hover:border-primary-200"}`}>
              <Icon className={`size-6 ${dataset === id ? "text-primary" : "text-gray-400"}`} />
              <b className="mt-4 block text-base text-gray-900">{title}</b>
              <span className="mt-2 block text-sm font-medium leading-6 text-gray-500">{description}</span>
              <span className="mt-3 block rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-600">{rowUnit}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-gray-900"><Info className="size-5 text-primary" />{selected.title}에 포함되는 데이터</h3>
            <ul className="mt-4 space-y-2 text-sm font-medium text-gray-600">{selected.highlights.map((entry) => <li key={entry} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />{entry}</li>)}</ul>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">{exportFieldGuides[dataset].map((guide) => <div key={guide.title} className="rounded-xl border border-gray-200 bg-white p-3"><b className="text-xs text-gray-900">{guide.title}</b><p className="mt-1 text-xs font-medium leading-5 text-gray-500">{guide.fields}</p></div>)}</div>
          </article>
          {dataset === "questions" ? (
            <article className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <h3 className="flex items-center gap-2 font-semibold text-blue-800"><BarChart3 className="size-5" />정답률을 두 가지로 제공합니다</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-gray-700"><b>응답자 기준 정답률</b>은 답을 고른 사람 중 정답 비율입니다. <b>전체 기준 정답률</b>은 미응답까지 포함한 모든 출제 건 중 정답 비율입니다.</p>
              <p className="mt-3 text-xs font-semibold text-blue-700">응답이 0건이면 정답률은 0%가 아니라 빈 셀로 표시됩니다.</p>
            </article>
          ) : dataset === "sessions" ? (
            <article className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <h3 className="flex items-center gap-2 font-semibold text-red-700"><TriangleAlert className="size-5" />개인정보 포함 안내</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-gray-700"><b>result_email</b> 열에 세션별 최신 Brevo 접수 완료 이메일 원문이 포함됩니다. 접수 완료 이력이 없으면 빈 셀이며, 결과 링크와 인증 토큰은 포함하지 않습니다.</p>
              <p className="mt-3 text-xs font-semibold text-red-700">다운로드한 파일은 개인정보 처리 기준에 따라 보관·공유·폐기해 주세요.</p>
            </article>
          ) : (
            <article className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <h3 className="flex items-center gap-2 font-semibold text-amber-800"><Info className="size-5" />익명 데이터 안내</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-gray-700">사용자와 세션은 UUID로만 구분합니다. 이메일 주소, IP, 결과 링크와 인증 토큰은 포함하지 않습니다.</p>
            </article>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Filter className="size-5 text-primary" />추출 조건</h3>
          {busy === "options" ? <p className="mt-4 flex items-center gap-2 text-sm text-gray-500"><LoaderCircle className="size-4 animate-spin" />조건을 불러오는 중...</p> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-semibold text-gray-600">시험<select aria-label="시험" value={filters.mockTestId ?? ""} onChange={(event) => updateFilter("mockTestId", event.target.value || undefined)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">전체 시험</option>{options.mockTests.map((test) => <option key={test.mockTestId} value={test.mockTestId}>{test.titleKo}{test.isPublished ? "" : " (비공개)"}</option>)}</select></label>
              <label className="text-xs font-semibold text-gray-600">영역<select aria-label="영역" value={filters.section ?? ""} onChange={(event) => updateFilter("section", (event.target.value || undefined) as AdminExportFilters["section"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">전체 영역</option><option value="reading">읽기</option><option value="listening">듣기</option></select></label>
              <label className="text-xs font-semibold text-gray-600">응시 모드<select aria-label="응시 모드" value={filters.mode ?? ""} onChange={(event) => updateFilter("mode", (event.target.value || undefined) as AdminExportFilters["mode"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">전체 모드</option><option value="timed">실전</option><option value="practice">연습</option></select></label>
              <label className="text-xs font-semibold text-gray-600">세션 상태<select aria-label="세션 상태" value={filters.status} onChange={(event) => updateFilter("status", event.target.value as AdminExportFilters["status"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="submitted">제출 완료</option><option value="abandoned">폐기됨</option><option value="all">제출+폐기 전체</option></select></label>
              <label className="text-xs font-semibold text-gray-600">시작일 (KST)<input aria-label="시작일" type="date" value={filters.from ?? ""} onChange={(event) => updateFilter("from", event.target.value || undefined)} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" /></label>
              <label className="text-xs font-semibold text-gray-600">종료일 (KST)<input aria-label="종료일" type="date" value={filters.to ?? ""} onChange={(event) => updateFilter("to", event.target.value || undefined)} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" /></label>
              {dataset === "questions" && <>
                <label className="text-xs font-semibold text-gray-600">문항 유형<select aria-label="문항 유형" value={filters.itemType ?? ""} onChange={(event) => updateFilter("itemType", event.target.value || undefined)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">전체 유형</option>{options.itemTypes.map((itemType) => <option key={itemType} value={itemType}>{questionTypeLabel(itemType, filters.section ?? "", "ko")} · {itemType}</option>)}</select></label>
                <label className="text-xs font-semibold text-gray-600">최소 출제 횟수<input aria-label="최소 출제 횟수" type="number" min={0} max={1_000_000} value={filters.minAssignedCount} onChange={(event) => updateFilter("minAssignedCount", Math.max(0, Number(event.target.value) || 0))} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" /></label>
              </>}
              {dataset === "responses" && <label className="text-xs font-semibold text-gray-600">응답 결과<select aria-label="응답 결과" value={filters.outcome} onChange={(event) => updateFilter("outcome", event.target.value as AdminExportFilters["outcome"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="all">전체 (미응답 포함)</option><option value="answered">응답 문항만</option><option value="correct">정답만</option><option value="incorrect">오답만</option><option value="unanswered">미응답만</option></select></label>}
              {dataset === "sessions" && <>
                <label className="text-xs font-semibold text-gray-600">별점<select aria-label="별점" value={filters.rating} onChange={(event) => updateFilter("rating", event.target.value as AdminExportFilters["rating"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="all">전체 별점</option><option value="none">별점 없음</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}점</option>)}</select></label>
                <label className="text-xs font-semibold text-gray-600">결과 메일<select aria-label="결과 메일" value={filters.resultEmail} onChange={(event) => updateFilter("resultEmail", event.target.value as AdminExportFilters["resultEmail"])} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="all">전체</option><option value="accepted">Brevo 접수 완료</option><option value="not_accepted">접수 기록 없음</option></select></label>
              </>}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={Boolean(busy)} onClick={() => void loadPreview()} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-primary-200 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-50">{busy === "preview" ? <LoaderCircle className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}추출 대상 확인</button>
            <button type="button" disabled={!preview?.rowCount || Boolean(busy)} onClick={() => void download()} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === "download" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}CSV 다운로드</button>
            <span className="text-xs font-medium text-gray-400">필터를 변경하면 다시 확인해야 합니다.</span>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {preview && <div className={`mt-4 rounded-xl border p-4 ${preview.rowCount ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
            <p className="font-semibold text-gray-900">{preview.rowCount ? `${preview.rowCount.toLocaleString()}행을 추출할 예정입니다.` : "현재 조건에 해당하는 데이터가 없습니다."}</p>
            <p className="mt-1 text-sm font-medium text-gray-600">대상 세션 {preview.sessionCount.toLocaleString()}개 · 기준 시각 {new Date(preview.generatedAt).toLocaleString("ko-KR")}</p>
            <p className="mt-2 text-xs font-medium leading-5 text-gray-500">적용 조건: {exportFilterSummary(dataset, preview.filters, options)}</p>
            {preview.rowCount >= 500_000 && <p className="mt-2 text-xs font-semibold text-orange-700">파일이 매우 큽니다. 시험이나 기간 조건을 좁히면 Excel에서 더 안정적으로 열 수 있습니다.</p>}
          </div>}
        </div>
      </section>
      <ResponseDataGuide />
    </div>
  );
}

