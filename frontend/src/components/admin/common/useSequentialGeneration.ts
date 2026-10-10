import { useEffect, useRef, useState } from "react";

export type GenerationTask = { key: string; run: () => Promise<unknown>; isComplete?: () => boolean };
const initial = { total: 0, completed: 0, failed: 0, running: false, activeKey: "" };

export function useSequentialGeneration() {
  const [progress, setProgress] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const epoch = useRef(0);
  const active = useRef(false);
  const failedTasks = useRef<GenerationTask[]>([]);
  useEffect(() => () => { epoch.current += 1; active.current = false; }, []);

  const reset = () => {
    epoch.current += 1; active.current = false; failedTasks.current = [];
    setProgress(initial); setErrors({});
  };
  const run = async (tasks: GenerationTask[], refresh: () => Promise<unknown>) => {
    if (active.current) return;
    active.current = true;
    const runId = ++epoch.current;
    failedTasks.current = [];
    setProgress({ ...initial, total: tasks.length, running: true });
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !tasks.some((task) => task.key === key))));
    let completed = 0, failed = 0;
    for (const task of tasks) {
      if (epoch.current !== runId) return;
      setProgress({ total: tasks.length, completed, failed, running: true, activeKey: task.key });
      try {
        if (!task.isComplete?.()) await task.run();
        completed += 1;
      } catch (error) {
        if (epoch.current !== runId) return;
        failed += 1; failedTasks.current.push(task);
        setErrors((previous) => ({ ...previous, [task.key]: error instanceof Error ? error.message : "생성에 실패했습니다." }));
      }
      if (epoch.current !== runId) return;
      // Refresh even on a lost response: a completed asset may already be saved.
      try { await refresh(); } catch { /* Keep the generation outcome; the page can refresh manually. */ }
      if (epoch.current !== runId) return;
      if (failedTasks.current.includes(task) && task.isComplete?.()) {
        failedTasks.current = failedTasks.current.filter((failedTask) => failedTask !== task);
        failed -= 1; completed += 1;
        setErrors((previous) => { const next = { ...previous }; delete next[task.key]; return next; });
      }
    }
    if (epoch.current !== runId) return;
    active.current = false;
    setProgress({ total: tasks.length, completed, failed, running: false, activeKey: "" });
  };
  return { ...progress, errors, reset, run, retry: (refresh: () => Promise<unknown>) => run([...failedTasks.current], refresh) };
}
