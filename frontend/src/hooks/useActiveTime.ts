import { useCallback, useEffect, useRef } from "react";
import { api } from "../api";

export function useActiveTime(sessionId: string, token: string, itemOrder: number, enabled: boolean) {
  const activeSinceRef = useRef<number | null>(null);

  const takeDuration = useCallback(() => {
    const now = performance.now();
    const duration = activeSinceRef.current === null ? 0 : now - activeSinceRef.current;
    activeSinceRef.current = document.visibilityState === "visible" ? now : null;
    return duration;
  }, []);

  const flush = useCallback((eventType: "presented" | "hidden" | "heartbeat" = "heartbeat") => {
    if (!enabled) return;
    const duration = takeDuration();
    if (eventType === "hidden") activeSinceRef.current = null;
    void api.event(sessionId, token, itemOrder, eventType, duration).catch(() => undefined);
  }, [enabled, itemOrder, sessionId, takeDuration, token]);

  useEffect(() => {
    if (!enabled) return;
    activeSinceRef.current = document.visibilityState === "visible" ? performance.now() : null;
    void api.event(sessionId, token, itemOrder, "presented", 0).catch(() => undefined);
    const visibility = () => {
      if (document.visibilityState === "hidden") flush("hidden");
      else {
        activeSinceRef.current = performance.now();
        void api.event(sessionId, token, itemOrder, "presented", 0).catch(() => undefined);
      }
    };
    const pagehide = () => flush("hidden");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") flush("heartbeat");
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.clearInterval(heartbeat);
      if (activeSinceRef.current !== null) flush("hidden");
    };
  }, [enabled, flush, itemOrder, sessionId, token]);

  return { takeDuration, flush };
}
