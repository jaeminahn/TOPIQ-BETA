import { Image as ImageIcon, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cropGeometry, cropImageToWebp, type CropOffset, type CropSize } from "./imageCrop";

const EMPTY_SIZE: CropSize = { width: 0, height: 0 };
const EMPTY_OFFSET: CropOffset = { x: 0, y: 0 };

export function AdminImageCropDialog({ file, title, onCancel, onConfirm }: {
  file: File;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState<CropSize>(EMPTY_SIZE);
  const [viewport, setViewport] = useState<CropSize>(EMPTY_SIZE);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>(EMPTY_OFFSET);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageSize(EMPTY_SIZE);
    setZoom(1);
    setOffset(EMPTY_OFFSET);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const measureViewport = useCallback(() => {
    const width = viewportRef.current?.getBoundingClientRect().width ?? 0;
    if (width > 0) setViewport({ width, height: width * 3 / 4 });
  }, []);

  useEffect(() => {
    measureViewport();
    const element = viewportRef.current;
    if (element && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measureViewport);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measureViewport);
    return () => window.removeEventListener("resize", measureViewport);
  }, [measureViewport]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing) onCancel();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus();
    };
  }, [onCancel, processing]);

  const clampOffset = useCallback((next: CropOffset, nextZoom = zoom) => {
    if (!imageSize.width || !viewport.width) return EMPTY_OFFSET;
    return cropGeometry(imageSize, viewport, nextZoom, next).offset;
  }, [imageSize, viewport, zoom]);

  useEffect(() => {
    setOffset((current) => clampOffset(current, zoom));
  }, [clampOffset, zoom]);

  const move = (x: number, y: number) => setOffset((current) => clampOffset({ x: current.x + x, y: current.y + y }));
  const geometry = imageSize.width && viewport.width
    ? cropGeometry(imageSize, viewport, zoom, offset)
    : null;

  const confirm = async () => {
    if (!imageRef.current || !geometry || processing) return;
    setProcessing(true);
    setError("");
    try {
      onConfirm(await cropImageToWebp(file, imageRef.current, viewport, zoom, offset));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지 크롭에 실패했습니다.");
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-gray-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !processing) onCancel(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="image-crop-title" className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold text-primary">4:3 IMAGE CROP</p><h2 id="image-crop-title" className="mt-1 text-xl font-semibold">{title}</h2></div>
          <button ref={closeRef} type="button" disabled={processing} onClick={onCancel} aria-label="크롭 취소" className="focus-ring grid size-10 place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40"><X className="size-4" /></button>
        </div>

        <div
          ref={viewportRef}
          data-testid="image-crop-viewport"
          tabIndex={0}
          aria-label="4대3 이미지 크롭 영역"
          onKeyDown={(event) => {
            const distance = event.shiftKey ? 30 : 10;
            const movement = event.key === "ArrowLeft" ? [distance, 0] : event.key === "ArrowRight" ? [-distance, 0] : event.key === "ArrowUp" ? [0, distance] : event.key === "ArrowDown" ? [0, -distance] : null;
            if (movement) { event.preventDefault(); move(movement[0]!, movement[1]!); }
          }}
          onPointerDown={(event) => {
            if (!geometry || processing) return;
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || drag.current.pointerId !== event.pointerId) return;
            const movementX = event.clientX - drag.current.x;
            const movementY = event.clientY - drag.current.y;
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            move(movementX, movementY);
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId === event.pointerId) drag.current = null;
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { drag.current = null; }}
          className="relative mt-5 aspect-[4/3] w-full touch-none overflow-hidden rounded-xl bg-gray-900 outline-none ring-primary focus-visible:ring-2"
          style={{ cursor: geometry ? "grab" : "default" }}
        >
          {imageUrl && <img
            ref={imageRef}
            src={imageUrl}
            alt="크롭할 이미지 미리보기"
            draggable={false}
            onLoad={(event) => {
              const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
              if (!next.width || !next.height) { setError("이미지 크기를 확인하지 못했습니다."); return; }
              if (next.width < 4 || next.height < 3) { setError("이미지가 너무 작아 4:3으로 크롭할 수 없습니다."); return; }
              setImageSize(next);
              measureViewport();
            }}
            onError={() => setError("이미지 파일을 열지 못했습니다.")}
            className="pointer-events-none absolute max-w-none select-none"
            style={geometry ? {
              width: geometry.rendered.width,
              height: geometry.rendered.height,
              left: `calc(50% + ${geometry.offset.x}px)`,
              top: `calc(50% + ${geometry.offset.y}px)`,
              transform: "translate(-50%, -50%)",
            } : { visibility: "hidden" }}
          />}
          {!geometry && <div className="absolute inset-0 grid place-items-center text-white"><div className="text-center"><ImageIcon className="mx-auto size-8 opacity-60" /><p className="mt-2 text-sm font-semibold">이미지를 준비하고 있습니다.</p></div></div>}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,.25)]" />
        </div>

        <p className="mt-3 text-xs leading-5 text-gray-500">이미지를 드래그하거나 방향키로 이동하고, 확대 슬라이더로 영역을 맞춰 주세요. 확정된 4:3 영역만 업로드됩니다.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-gray-600">확대 <span className="text-primary">{zoom.toFixed(2)}×</span><input aria-label="이미지 확대" type="range" min="1" max="3" step="0.01" value={zoom} disabled={!geometry || processing} onChange={(event) => setZoom(Number(event.target.value))} className="mt-2 block w-full accent-primary disabled:opacity-40" /></label>
          <button type="button" disabled={processing || (!offset.x && !offset.y && zoom === 1)} onClick={() => { setZoom(1); setOffset(EMPTY_OFFSET); }} className="focus-ring flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-xs font-semibold text-gray-600 disabled:opacity-40"><RotateCcw className="size-3.5" />초기화</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={processing} onClick={onCancel} className="focus-ring min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold disabled:opacity-40">취소</button><button type="button" disabled={!geometry || processing} onClick={() => void confirm()} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-40">{processing && <LoaderCircle className="size-4 animate-spin" />}{processing ? "크롭 중" : "크롭 후 업로드"}</button></div>
      </section>
    </div>
  );
}
