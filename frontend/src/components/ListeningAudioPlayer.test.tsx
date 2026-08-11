import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { I18nProvider } from "../i18n";
import { ListeningAudioPlayer } from "./ListeningAudioPlayer";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  api: { audioPlayback: vi.fn() },
}));

const playbackMock = vi.mocked(api.audioPlayback);
const renderWithI18n = (ui: ReactElement) => {
  localStorage.setItem("unigate.topik.locale", "ko");
  return render(ui, { wrapper: I18nProvider });
};

describe("ListeningAudioPlayer", () => {
  beforeEach(() => {
    playbackMock.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stops and reports the previous playback when the audio group changes", async () => {
    playbackMock.mockImplementation((_sessionId, _token, _assetId, _playId, eventType) => Promise.resolve(
      eventType === "prepared"
        ? { submitted: false, playNumber: 1, audioUrl: "https://example.com/old.mp3" }
        : { submitted: false, playNumber: 1 },
    ));
    const { container, rerender } = renderWithI18n(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-old"
        repeatCount={2}
        mode="practice"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "재생 시작" }));
    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith(
      "session-id", "session-token", "asset-old", expect.any(String), "prepared",
    ));
    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "https://example.com/old.mp3"));
    fireEvent.playing(container.querySelector("audio")!);
    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith(
      "session-id", "session-token", "asset-old", expect.any(String), "started",
    ));

    rerender(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-new"
        repeatCount={2}
        mode="practice"
      />,
    );

    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith(
      "session-id", "session-token", "asset-old", expect.any(String), "interrupted",
    ));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  it("ignores an old audio URL that resolves after navigation", async () => {
    let resolveOld!: (value: { submitted: false; playNumber: number; audioUrl: string }) => void;
    playbackMock.mockImplementation((_sessionId, _token, _assetId, _playId, eventType) => {
      if (eventType === "interrupted") return Promise.resolve({ submitted: false });
      return new Promise((resolve) => { resolveOld = resolve; });
    });
    const { container, rerender } = renderWithI18n(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-old"
        repeatCount={2}
        mode="practice"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "재생 시작" }));
    rerender(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-new"
        repeatCount={2}
        mode="practice"
      />,
    );
    resolveOld({ submitted: false, playNumber: 1, audioUrl: "https://example.com/stale.mp3" });

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toHaveAttribute("src", "https://example.com/stale.mp3");
    });
  });

  it("waits three seconds and records playback only after media actually starts in StrictMode", async () => {
    vi.useFakeTimers();
    playbackMock.mockImplementation((_sessionId, _token, _assetId, _playId, eventType) => Promise.resolve(
      eventType === "prepared"
        ? { submitted: false, playNumber: 1, audioUrl: "https://example.com/timed.mp3" }
        : { submitted: false, playNumber: 1 },
    ));
    const { container } = renderWithI18n(
      <StrictMode>
        <ListeningAudioPlayer sessionId="session-id" token="session-token" audioAssetId="asset-timed" repeatCount={2} mode="timed" />
      </StrictMode>,
    );

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector("audio")).toHaveAttribute("src", "https://example.com/timed.mp3");
    expect(screen.getByText("3초 후 자동 재생")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(playbackMock.mock.calls.some((call) => call[4] === "started")).toBe(false);
    expect(screen.queryByText("재생 중")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();

    fireEvent.playing(container.querySelector("audio")!);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(playbackMock.mock.calls.filter((call) => call[4] === "started")).toHaveLength(1);
    expect(screen.getByText("재생 중")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("keeps the play count at zero when autoplay is blocked", async () => {
    vi.useFakeTimers();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("autoplay blocked"));
    playbackMock.mockResolvedValue({ submitted: false, playNumber: 1, audioUrl: "https://example.com/blocked.mp3" });
    renderWithI18n(
      <ListeningAudioPlayer sessionId="session-id" token="session-token" audioAssetId="asset-blocked" repeatCount={2} mode="timed" />,
    );

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "재생 시작" })).toBeInTheDocument();
    expect(playbackMock.mock.calls.some((call) => call[4] === "started")).toBe(false);
    expect(screen.queryByText("재생 중")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
  });

  it("cancels and restarts the three-second timer when the audio group changes", async () => {
    vi.useFakeTimers();
    playbackMock.mockImplementation((_sessionId, _token, assetId, _playId, eventType) => Promise.resolve(
      eventType === "prepared"
        ? { submitted: false, playNumber: 1, audioUrl: `https://example.com/${assetId}.mp3` }
        : { submitted: false, playNumber: 1 },
    ));
    const { rerender } = renderWithI18n(
      <ListeningAudioPlayer sessionId="session-id" token="session-token" audioAssetId="asset-old" repeatCount={2} mode="timed" />,
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(2000); });

    rerender(<ListeningAudioPlayer sessionId="session-id" token="session-token" audioAssetId="asset-new" repeatCount={2} mode="timed" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });
});
