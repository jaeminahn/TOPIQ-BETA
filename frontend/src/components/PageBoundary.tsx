import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { ErrorState, LoadingState } from "./States";

class PageErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  return (
    <PageErrorBoundary key={pathname} fallback={
      <div role="alert">
        <ErrorState message={t("pageLoadFailed")} retry={() => globalThis.location.reload()} />
      </div>
    }>
      <Suspense fallback={<LoadingState message={t("pageLoading")} />}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
