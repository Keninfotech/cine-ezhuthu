import type { Stroke } from './types';

export interface BBox { x0: number; y0: number; x1: number; y1: number }

export function bbox(points: [number, number, number][]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const overlaps = (a: BBox, b: BBox) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/**
 * Scratch-out gesture: a fast back-and-forth zig-zag drawn over existing ink.
 * Counts horizontal direction reversals; a flat shape with ≥ 4 reversals is a scratch.
 */
export function isScratchOut(stroke: Stroke, existing: Stroke[]): boolean {
  const pts = stroke.points;
  if (pts.length < 8 || existing.length === 0) return false;
  const b = bbox(pts);
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (w < 20) return false;
  let reversals = 0, dir = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    if (Math.abs(dx) < 2) continue;
    const d = Math.sign(dx);
    if (dir && d !== dir) reversals++;
    dir = d;
  }
  const pathLen = pts.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  return reversals >= 4 && h < w * 1.2 && pathLen > w * 3 && existing.some((s) => overlaps(bbox(s.points), b));
}

/** Remove strokes the scratch covers. */
export function applyScratch(scratch: Stroke, strokes: Stroke[]): Stroke[] {
  const b = bbox(scratch.points);
  return strokes.filter((s) => !overlaps(bbox(s.points), b));
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale = 1) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * scale;
    ctx.beginPath();
    const [x0, y0] = s.points[0];
    ctx.moveTo(x0 * scale, y0 * scale);
    if (s.points.length === 1) ctx.lineTo(x0 * scale + 0.1, y0 * scale);
    for (let i = 1; i < s.points.length - 1; i++) {
      const [x, y] = s.points[i];
      const [nx, ny] = s.points[i + 1];
      ctx.quadraticCurveTo(x * scale, y * scale, ((x + nx) / 2) * scale, ((y + ny) / 2) * scale);
    }
    if (s.points.length > 1) {
      const [lx, ly] = s.points[s.points.length - 1];
      ctx.lineTo(lx * scale, ly * scale);
    }
    ctx.stroke();
  }
}
