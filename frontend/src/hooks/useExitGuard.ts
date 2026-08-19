import { useCallback, useContext, useEffect } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";

const noop = () => undefined;

export function useExitGuard(enabled: boolean, isAllowedPath: (pathname: string) => boolean = () => false) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [enabled]);
  if (!dataRouter) return { blocked: false, stay: noop, leave: noop };
  return useDataRouterExitGuard(enabled, isAllowedPath);
}

function useDataRouterExitGuard(enabled: boolean, isAllowedPath: (pathname: string) => boolean) {
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => (
    enabled && currentLocation.pathname !== nextLocation.pathname && !isAllowedPath(nextLocation.pathname)
  ), [enabled, isAllowedPath]));

  return {
    blocked: blocker.state === "blocked",
    stay: useCallback(() => { if (blocker.state === "blocked") blocker.reset(); }, [blocker]),
    leave: useCallback(() => { if (blocker.state === "blocked") blocker.proceed(); }, [blocker]),
  };
}
