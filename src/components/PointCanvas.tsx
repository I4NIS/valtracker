import { useEffect, useLayoutEffect, useRef } from "react";

export type CanvasPoint = { x: number; y: number; zone: string | null };

type Props = {
  points: CanvasPoint[];
  focus: string | null;
  className?: string;
  color?: string;
  glow?: string;
  opacity?: number;
  focusScale: number;
  ring?: boolean;
  bleed?: number;
};

const DOT = 5;
const BLOB = 64;
const BLOB_FOCUS = 1.15;
const BLOB_REFERENCE = 600;
const BLOB_MIN_SCALE = 0.5;
const DIM = 0.12;
const DURATION = 200;
const RING = "rgba(8, 9, 12, 0.6)";

function bezier(u: number, a: number, b: number) {
  const v = 1 - u;
  return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
}

function slope(u: number, a: number, b: number) {
  const v = 1 - u;
  return 3 * v * v * a + 6 * v * u * (b - a) + 3 * u * u * (1 - b);
}

function ease(progress: number) {
  let u = progress;
  for (let step = 0; step < 8; step += 1) {
    const error = bezier(u, 0.25, 0.25) - progress;
    const rate = slope(u, 0.25, 0.25);
    if (Math.abs(error) < 1e-4 || rate === 0) break;
    u = Math.min(1, Math.max(0, u - error / rate));
  }
  return bezier(u, 0.1, 1);
}

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(glow: string, ratio: number) {
  const key = `${glow}|${ratio}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const size = Math.ceil(BLOB * BLOB_FOCUS * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const center = size / 2;
    const gradient = context.createRadialGradient(center, center, 0, center, center, 0.7 * center * Math.SQRT2);
    gradient.addColorStop(0, `rgba(${glow}, 0.55)`);
    gradient.addColorStop(1, `rgba(${glow}, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, center, 0, Math.PI * 2);
    context.fill();
  }
  sprites.set(key, canvas);
  return canvas;
}

type Frame = { opacity: Float32Array; scale: Float32Array; glow: Float32Array };

function frame(count: number): Frame {
  return { opacity: new Float32Array(count), scale: new Float32Array(count), glow: new Float32Array(count) };
}

export function PointCanvas({ points, focus, className, color, glow, opacity = 1, focusScale, ring = false, bleed = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ width: 0, height: 0, ratio: 1 });
  const props = useRef({ points, focus, glow, opacity, ring, bleed });
  props.current = { points, focus, glow, opacity, ring, bleed };
  const motion = useRef({ from: frame(0), to: frame(0), now: frame(0), start: 0, raf: 0 });

  const target = (count: number, active: string | null) => {
    const next = frame(count);
    const list = props.current.points;
    for (let index = 0; index < count; index += 1) {
      const inZone = active !== null && list[index].zone === active;
      const dim = active !== null && !inZone;
      next.opacity[index] = dim ? DIM : props.current.opacity;
      next.scale[index] = inZone ? focusScale : 1;
      next.glow[index] = inZone ? BLOB_FOCUS : 1;
    }
    return next;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { width, height, ratio } = size.current;
    const current = props.current;
    const state = motion.current.now;
    const list = current.points;
    const inner = { width: width - 2 * current.bleed, height: height - 2 * current.bleed };
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (list.length === 0 || inner.width <= 0) return;
    const at = (point: CanvasPoint) => ({ x: current.bleed + point.x * inner.width, y: current.bleed + point.y * inner.height });
    if (current.glow) {
      const image = sprite(current.glow, ratio);
      const full = BLOB * BLOB_FOCUS * Math.min(1, Math.max(BLOB_MIN_SCALE, inner.width / BLOB_REFERENCE));
      list.forEach((point, index) => {
        const spot = at(point);
        const side = full * (state.glow[index] / BLOB_FOCUS);
        context.globalAlpha = state.opacity[index] / current.opacity;
        context.drawImage(image, spot.x - side / 2, spot.y - side / 2, side, side);
      });
    }
    const fill = getComputedStyle(canvas).color;
    list.forEach((point, index) => {
      const spot = at(point);
      const scale = state.scale[index];
      const radius = (DOT / 2) * scale;
      context.globalAlpha = state.opacity[index];
      if (current.ring && current.focus !== null && point.zone === current.focus) {
        context.fillStyle = RING;
        context.beginPath();
        context.arc(spot.x, spot.y, radius + scale, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = fill;
      context.beginPath();
      context.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useLayoutEffect(() => {
    const state = motion.current;
    cancelAnimationFrame(state.raf);
    const settled = target(points.length, focus);
    state.from = settled;
    state.to = settled;
    state.now = settled;
    drawRef.current();
  }, [points, color, glow, opacity]);

  const lastFocus = useRef(focus);
  useLayoutEffect(() => {
    if (lastFocus.current === focus) return;
    lastFocus.current = focus;
    const state = motion.current;
    cancelAnimationFrame(state.raf);
    const count = props.current.points.length;
    if (state.now.opacity.length !== count) state.now = target(count, focus);
    state.from = state.now;
    state.to = target(count, focus);
    state.start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - state.start) / DURATION);
      const eased = ease(progress);
      const next = frame(count);
      for (let index = 0; index < count; index += 1) {
        next.opacity[index] = state.from.opacity[index] + (state.to.opacity[index] - state.from.opacity[index]) * eased;
        next.scale[index] = state.from.scale[index] + (state.to.scale[index] - state.from.scale[index]) * eased;
        next.glow[index] = state.from.glow[index] + (state.to.glow[index] - state.from.glow[index]) * eased;
      }
      state.now = next;
      drawRef.current();
      if (progress < 1) state.raf = requestAnimationFrame(tick);
    };
    drawRef.current();
    state.raf = requestAnimationFrame(tick);
  }, [focus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = (width: number, height: number, pixels?: { inlineSize: number; blockSize: number }) => {
      const ratio = window.devicePixelRatio || 1;
      size.current = { width, height, ratio };
      canvas.width = pixels ? pixels.inlineSize : Math.round(width * ratio);
      canvas.height = pixels ? pixels.blockSize : Math.round(height * ratio);
      drawRef.current();
    };
    const observer = new ResizeObserver(([entry]) => {
      resize(entry.contentRect.width, entry.contentRect.height, entry.devicePixelContentBoxSize?.[0]);
    });
    try {
      observer.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(canvas);
    }
    const theme = new MutationObserver(() => drawRef.current());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      theme.disconnect();
      cancelAnimationFrame(motion.current.raf);
    };
  }, []);

  const style = bleed
    ? { left: -bleed, top: -bleed, width: `calc(100% + ${2 * bleed}px)`, height: `calc(100% + ${2 * bleed}px)`, color }
    : { color };

  return <canvas ref={canvasRef} className={`point-canvas${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}
