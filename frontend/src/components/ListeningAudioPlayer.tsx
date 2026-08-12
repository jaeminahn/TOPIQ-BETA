import { Headphones, LoaderCircle, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { useI18n } from "../i18n";
import type { ExamMode } from "../types";

export function ListeningAudioPlayer({
  sessionId, token, audioAssetId, repeatCount, mode,
}: { sessionId: string; token: string; audioAssetId: string; repeatCount: number; mode: ExamMode }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentPlayId = useRef<string | null>(null);
  const startingPlayId = useRef<string | null>(null);
  const startedPlayId = useRef<string | null>(null);
  const startConfirmation = useRef<Promise<void> | null>(null);
  const autoPlayTimer = useRef<number | null>(null);
  const playIndex = useRef(0);
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const [src, setSrc] = useState("");
  const [displayPlayIndex, setDisplayPlayIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "waiting" | "loading" | "playing" | "complete" | "blocked" | "error">("idle");
  const [message, setMessage] = useState("");

  const start = async (delayMs = 0, resetForGroup = false) => {
    if (!resetForGroup && (status === "loading" || status === "waiting")) return;
    if (autoPlayTimer.current !== null) window.clearTimeout(autoPlayTimer.current);
    if (startedPlayId.current && !audioRef.current?.ended) {
      audioRef.current?.pause();
      void api.audioPlayback(sessionId, token, audioAssetId, startedPlayId.current, "interrupted").catch(() => undefined);
    }
    const playAt = Date.now() + delayMs;
    setStatus(delayMs ? "waiting" : "loading"); setMessage("");
    const generation = requestGeneration.current;
    const id = crypto.randomUUID();
    currentPlayId.current = id;
    startingPlayId.current = null;
    startedPlayId.current = null;
    startConfirmation.current = null;
    try {
      const result = await api.audioPlayback(sessionId, token, audioAssetId, id, "prepared");
      if (!mounted.current || generation !== requestGeneration.current || !result.audioUrl) return;
      setSrc(result.audioUrl);
      const playPreparedAudio = () => {
        autoPlayTimer.current = null;
        void audioRef.current?.play().catch(() => {
          if (currentPlayId.current !== id) return;
          setStatus("blocked"); setMessage(t("audioBlocked"));
        });
      };
      const remainingDelay = Math.max(0, playAt - Date.now());
      if (remainingDelay) autoPlayTimer.current = window.setTimeout(playPreparedAudio, remainingDelay);
      else playPreparedAudio();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "AUDIO_REPLAY_LIMIT") { setStatus("complete"); setMessage(t("audioReplayLimit")); }
      else { setStatus("error"); setMessage(cause instanceof Error ? cause.message : t("audioLoadFailed")); }
    }
  };

  useEffect(() => {
    mounted.current = true; requestGeneration.current += 1; playIndex.current = 0; setDisplayPlayIndex(0); currentPlayId.current = null; startingPlayId.current = null; startedPlayId.current = null; startConfirmation.current = null; setSrc(""); setStatus("idle"); setMessage("");
    if (mode === "timed") void start(3000, true);
    return () => {
      mounted.current = false; requestGeneration.current += 1;
      if (autoPlayTimer.current !== null) window.clearTimeout(autoPlayTimer.current);
      autoPlayTimer.current = null;
      const audio = audioRef.current;
      const interruptedPlayId = startedPlayId.current && !audio?.ended ? startedPlayId.current : null;
      if (audio) {
        audio.pause(); audio.currentTime = 0; audio.removeAttribute("src"); audio.load();
      }
      if (interruptedPlayId) void api.audioPlayback(sessionId, token, audioAssetId, interruptedPlayId, "interrupted").catch(() => undefined);
    };
    // A new asset represents a new listening group; start() intentionally runs once per group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioAssetId, mode, sessionId, token]);

  const confirmStarted = () => {
    const id = currentPlayId.current;
    if (!id || startedPlayId.current === id || startingPlayId.current === id) return;
    const generation = requestGeneration.current;
    startingPlayId.current = id;
    setStatus("playing"); setMessage("");
    startConfirmation.current = (async () => {
      try {
        const result = await api.audioPlayback(sessionId, token, audioAssetId, id, "started");
        if (!mounted.current || generation !== requestGeneration.current || currentPlayId.current !== id) {
          void api.audioPlayback(sessionId, token, audioAssetId, id, "interrupted").catch(() => undefined);
          return;
        }
        startedPlayId.current = id;
        playIndex.current = result.playNumber ?? playIndex.current + 1;
        setDisplayPlayIndex(playIndex.current);
        setStatus("playing");
      } catch (cause) {
        if (currentPlayId.current !== id) return;
        audioRef.current?.pause();
        void api.audioPlayback(sessionId, token, audioAssetId, id, "interrupted").catch(() => undefined);
        if (cause instanceof ApiError && cause.code === "AUDIO_REPLAY_LIMIT") { setStatus("complete"); setMessage(t("audioReplayLimit")); }
        else { setStatus("error"); setMessage(cause instanceof Error ? cause.message : t("audioLoadFailed")); }
      } finally {
        if (startingPlayId.current === id) startingPlayId.current = null;
      }
    })();
  };

  const ended = async () => {
    await startConfirmation.current;
    const id = startedPlayId.current;
    if (!id) return;
    if (id) await api.audioPlayback(sessionId, token, audioAssetId, id, "completed").catch(() => undefined);
    if (mode === "timed" && playIndex.current < repeatCount) void start();
    else setStatus("complete");
  };

  const statusLabel = status === "waiting" ? t("audioAutoPlayWaiting")
    : status === "loading" ? t("audioLoading")
    : status === "playing" ? t("audioPlaying")
      : status === "complete" ? t("audioComplete")
        : status === "blocked" || status === "error" ? t("audioError")
          : t("audioReady");

  return (
    <section className="mb-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5 shadow-sm sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary"><Headphones className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[.12em] text-primary">{t("listening")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-gray-700">
            {status === "loading" && <LoaderCircle className="size-4 animate-spin text-primary" />}
            {status === "playing" && <Volume2 className="size-4 animate-pulse text-primary" />}
            <span>{statusLabel}</span>
            {status !== "waiting" && <><span className="text-gray-300">·</span><span className="text-xs text-gray-500">{mode === "timed" ? t("audioAutoPlay") : t("audioFreeReplay")}</span></>}
          </p>
        </div>
        {mode === "timed" ? <div className="ml-auto flex items-center gap-2"><span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-black text-gray-600">{Math.min(displayPlayIndex, repeatCount)} / {repeatCount}</span>{(status === "blocked" || status === "error") && <button onClick={() => void (src && audioRef.current ? audioRef.current.play().catch(() => undefined) : start())} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-dark"><Play className="size-4" /> {t("audioPlay")}</button>}</div> : <button onClick={() => void start()} disabled={status === "loading"} className="focus-ring ml-auto flex min-h-11 items-center gap-2 rounded-xl border border-primary-100 bg-primary-50 px-4 py-2 text-sm font-black text-primary disabled:opacity-50 hover:bg-primary-100">{src ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {src ? t("audioReplay") : t("audioPlay")}</button>}
      </div>
      {message && <p role="status" className="mt-2 text-sm font-bold text-orange-500">{message}</p>}
      <audio ref={audioRef} src={src || undefined} controls={mode === "practice"} onPlaying={confirmStarted} onEnded={() => void ended()} className={mode === "practice" && src ? "mt-2 h-10 w-full" : "hidden"} />
    </section>
  );
}
