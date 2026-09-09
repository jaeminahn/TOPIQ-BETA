import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../../api";
import { ApiError } from "../../../api/request";
import type { AdminExportDataset, AdminExportFilters, AdminExportOptions, AdminExportPreview } from "../../../types";
import { exportDatasets, initialExportFilters } from "./exportConfig";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.code === "INVALID_EXPORT_FILTER") {
    return "날짜 범위와 추출 조건을 다시 확인해 주세요.";
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function useAdminExport(token: string) {
  const [dataset, setDataset] = useState<AdminExportDataset>("questions");
  const [filters, setFilters] = useState<AdminExportFilters>(initialExportFilters);
  const [options, setOptions] = useState<AdminExportOptions>({ mockTests: [], itemTypes: [] });
  const [preview, setPreview] = useState<AdminExportPreview | null>(null);
  const [busy, setBusy] = useState<"options" | "preview" | "download" | "">("options");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void adminApi.exportOptions(token).then((result) => {
      if (active) setOptions(result);
    }).catch((cause) => {
      if (active) setError(exportErrorMessage(cause, "추출 조건을 불러오지 못했습니다."));
    }).finally(() => {
      if (active) setBusy("");
    });
    return () => { active = false; };
  }, [token]);

  const selected = useMemo(() => exportDatasets.find((entry) => entry.id === dataset)!, [dataset]);
  const updateFilter = <K extends keyof AdminExportFilters>(key: K, value: AdminExportFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError("");
  };
  const changeDataset = (next: AdminExportDataset) => {
    setDataset(next);
    setFilters((current) => ({
      ...current,
      itemType: undefined,
      minAssignedCount: 0,
      outcome: "all",
      rating: "all",
      resultEmail: "all",
    }));
    setPreview(null);
    setError("");
  };
  const loadPreview = async () => {
    setBusy("preview");
    setError("");
    try {
      setPreview(await adminApi.exportPreview(token, dataset, filters));
    } catch (cause) {
      setError(exportErrorMessage(cause, "추출 대상을 확인하지 못했습니다."));
    } finally {
      setBusy("");
    }
  };
  const download = async () => {
    setBusy("download");
    setError("");
    try {
      const file = await adminApi.downloadExport(token, dataset, filters);
      downloadBlob(file.blob, file.filename);
    } catch (cause) {
      setError(exportErrorMessage(cause, "CSV를 다운로드하지 못했습니다."));
    } finally {
      setBusy("");
    }
  };

  return { dataset, filters, options, preview, busy, error, selected, updateFilter, changeDataset, loadPreview, download };
}
