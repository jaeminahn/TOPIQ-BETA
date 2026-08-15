import { Clock3, TimerOff } from "lucide-react";
import { useI18n } from "../../i18n";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function ExamTimerBar({ title, remaining }: { title: string; remaining: number | null }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-10 border-b border-primary-100 bg-primary text-white">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span>{title}</span></div>
        <div className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-primary">
          {remaining === null ? <TimerOff className="size-4" /> : <Clock3 className="size-4" />}
          <span>{remaining === null ? t("practiceMode") : `${t("timeLeft")} ${formatTime(remaining)}`}</span>
        </div>
      </div>
    </div>
  );
}
