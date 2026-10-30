import { useEffect, useRef } from 'react';
import type { Stroke } from '../lib/types';
import { drawStrokes } from '../lib/ink';

interface Props {
  strokes: Stroke[];
  /** called with the finished stroke; return the new stroke list */
  onStroke: (s: Stroke) => void;
  onStrokeStart?: () => void;
  color?: string;
  width?: number;
  penOnly?: boolean;
  /** store points in a fixed coordinate space so ink survives resizes */
  logicalWidth?: number;
  guides?: boolean;
  className?: string;
  ariaLabel: string;
}

let penSeen = false;

export function InkCanvas({ strokes, onStroke, onStrokeStart, color = '#111', width = 3, penOnly, logicalWidth, guides, className, ariaLabel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const scale = () => {
    const c = canvas.current!;
    return logicalWidth ? c.clientWidth / logicalWidth : 1;
  };

  const redraw = () => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (guides) {
      const css = getComputedStyle(c);
      ctx.strokeStyle = css.getPropertyValue('--guide').trim() || '#ccd';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      const gap = Math.max(70, h / 2);
      for (let y = gap * 0.72; y < h; y += gap) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(w - 16, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const s = scale();
    drawStrokes(ctx, strokesRef.current, s);
    if (live.current) drawStrokes(ctx, [live.current], s);
  };

  useEffect(redraw);
  useEffect(() => {
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas.current!);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: PointerEvent | React.PointerEvent): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const s = scale();
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s, Math.round(e.timeStamp)];
  };

  const reject = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') penSeen = true;
    // palm rejection: once a stylus is used, fingers are ignored on the canvas
    return e.pointerType === 'touch' && (penOnly || penSeen);
  };

  return (
    <canvas
      ref={canvas}
      className={className}
      aria-label={ariaLabel}
      role="img"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (reject(e) || e.button > 0) return;
        e.preventDefault();
        canvas.current!.setPointerCapture(e.pointerId);
        onStrokeStart?.();
        const w = e.pointerType === 'pen' && e.pressure ? width * (0.6 + e.pressure * 0.8) : width;
        live.current = { color, width: w / scale(), points: [point(e)] };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!live.current) return;
        const evs = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
        for (const ev of evs) live.current.points.push(point(ev));
        redraw();
      }}
      onPointerUp={() => {
        const s = live.current;
        live.current = null;
        if (s) onStroke(s);
      }}
      onPointerCancel={() => {
        live.current = null;
        redraw();
      }}
    />
  );
}
