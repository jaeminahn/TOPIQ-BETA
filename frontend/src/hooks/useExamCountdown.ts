import { useEffect, useState } from "react";
import type { TestSession } from "../types";

export function useExamCountdown(session: TestSession | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const expiresAt = session?.expiresAt;
    const serverTime = session?.serverTime;
    if (session?.mode !== "timed" || !expiresAt || !serverTime) {
      setRemaining(null);
      return;
    }

    // Keep one stable deadline even when answer updates replace the session object.
    const clientDeadline = new Date(expiresAt).getTime() + (Date.now() - new Date(serverTime).getTime());
    const tick = () => setRemaining(Math.max(0, Math.ceil((clientDeadline - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [session?.expiresAt, session?.mode, session?.serverTime]);

  return remaining;
}
