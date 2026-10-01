import { useEffect, useRef } from "react";

const DOT_GAP = 30;
const INFLUENCE_RADIUS = 118;

type PointerState = {
  x: number;
  y: number;
  visible: boolean;
  strength: number;
};

export function InteractiveDotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = canvas?.parentElement;
    if (!canvas || !section) return;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!context) return;

    const pointer: PointerState = { x: 0, y: 0, visible: false, strength: 0 };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = 0;
    let height = 0;
    let frame = 0;

    const draw = () => {
      const ctx = context;
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      const startX = (width % DOT_GAP) / 2;
      const startY = (height % DOT_GAP) / 2;

      for (let y = startY; y <= height; y += DOT_GAP) {
        for (let x = startX; x <= width; x += DOT_GAP) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          const proximity = pointer.strength * Math.max(0, 1 - distance / INFLUENCE_RADIUS);
          const eased = proximity * proximity * (3 - 2 * proximity);
          const radius = 1.65 + eased * 1.15;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = eased > 0.01
            ? `rgba(234, 102, 65, ${0.18 + eased * 0.42})`
            : "rgba(45, 94, 197, 0.18)";
          ctx.fill();
        }
      }
    };

    const animate = () => {
      const target = pointer.visible ? 1 : 0;
      pointer.strength += (target - pointer.strength) * (reduceMotion ? 1 : 0.16);
      draw();

      if (Math.abs(target - pointer.strength) > 0.01) {
        frame = window.requestAnimationFrame(animate);
      } else {
        pointer.strength = target;
        draw();
        frame = 0;
      }
    };

    const requestDraw = () => {
      if (!frame) frame = window.requestAnimationFrame(animate);
    };

    const resize = () => {
      const bounds = section.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const bounds = section.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.visible = true;
      requestDraw();
    };

    const handlePointerLeave = () => {
      pointer.visible = false;
      requestDraw();
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(section);
    window.addEventListener("resize", resize);
    section.addEventListener("pointermove", handlePointerMove);
    section.addEventListener("pointerleave", handlePointerLeave);
    resize();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      section.removeEventListener("pointermove", handlePointerMove);
      section.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="topiq-dot-field" aria-hidden="true" />;
}
