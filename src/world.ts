import * as C from "./constants";
import type { Body, Direction, FathomState, ReadState } from "./game";
export const directions: Direction[] = ["up", "right", "down", "left"];
export const vector: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Direction): Direction =>
  directions[(directions.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
});
export const body = (tx: number, ty: number): Body => ({
  ...center(tx, ty),
  tx,
  ty,
  dir: "up",
  moving: false,
});
export function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export const layer = (char: string) =>
  Array.from({ length: C.GRID_ROWS }, () => char.repeat(C.GRID_COLS));
export function put(rows: string[], x: number, y: number, value: string) {
  rows[y] = rows[y].slice(0, x) + value + rows[y].slice(x + 1);
}
export function maze(): string[] {
  const rows = layer("#");
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (let x = 1; x < C.GRID_COLS - 1; x++)
      if (
        [1, 3, 5, 11, 13, 16].includes(y) ||
        [1, 5, 9, 13, 22, 26, 30, 34].includes(x)
      )
        put(rows, x, y, ".");
  for (let x = 0; x <= 13; x++) {
    put(rows, x, 8, ".");
    put(rows, C.GRID_COLS - 1 - x, 8, ".");
  }
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) put(rows, x, y, "d");
  put(rows, 17, 6, "g");
  return rows;
}
export function open(s: ReadState, x: number, y: number, den = false): boolean {
  const t = s.tiles[y]?.[x];
  return t === "." || (den && (t === "d" || t === "g"));
}
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  d: Direction,
): { tx: number; ty: number } | null {
  const [dx, dy] = vector[d];
  let tx = x + dx;
  const ty = y + dy;
  const wrap = s.tiles.findIndex(
    (row) => row[0] !== "#" && row[C.GRID_COLS - 1] !== "#",
  );
  if (y === wrap && dy === 0) tx = (tx + C.GRID_COLS) % C.GRID_COLS;
  return tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS
    ? { tx, ty }
    : null;
}
export function exits(
  s: ReadState,
  b: { tx: number; ty: number },
  den = false,
): Direction[] {
  return directions.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return n !== null && open(s, n.tx, n.ty, den);
  });
}
export function distances(
  s: ReadState,
  tx: number,
  ty: number,
  den = true,
): number[][] {
  const dist = Array.from({ length: C.GRID_ROWS }, () =>
    Array<number>(C.GRID_COLS).fill(Infinity),
  );
  if (!open(s, tx, ty, den)) return dist;
  dist[ty][tx] = 0;
  const queue = [{ tx, ty }];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const d of exits(s, p, den)) {
      const n = neighbor(s, p.tx, p.ty, d)!;
      if (dist[n.ty][n.tx] !== Infinity) continue;
      dist[n.ty][n.tx] = dist[p.ty][p.tx] + 1;
      queue.push(n);
    }
  }
  return dist;
}
export function random(s: FathomState): number {
  s.random = (Math.imul(s.random, 1664525) + 1013904223) >>> 0;
  return s.random / 4294967296;
}
export function wander(s: FathomState, b: Body, den = false): Direction {
  const all = exits(s, b, den);
  const forward = all.filter((d) => d !== opposite(b.dir));
  const choices = forward.length ? forward : all;
  return choices[Math.floor(random(s) * choices.length)] ?? b.dir;
}
export function toward(
  s: ReadState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
): Direction {
  const dist = distances(s, target.tx, target.ty, den);
  let best = Infinity;
  let result = b.dir;
  for (const d of exits(s, b, den)) {
    const n = neighbor(s, b.tx, b.ty, d)!;
    if (dist[n.ty][n.tx] < best) {
      best = dist[n.ty][n.tx];
      result = d;
    }
  }
  return result;
}
export function atCenter(b: Readonly<Body>): boolean {
  const c = center(b.tx, b.ty);
  return Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
}
/** Spend distance in center-to-center segments, retaining the overshoot at turns and wraps. */
export function move(
  s: FathomState,
  b: Body,
  speed: number | (() => number),
  choose: () => Direction | null,
  den = false,
) {
  b.moving = false;
  if (!open(s, b.tx, b.ty, den)) return;
  let left = C.TICK_DT;
  while (left > 1e-8) {
    const c = center(b.tx, b.ty);
    if (atCenter(b)) {
      const chosen = choose();
      if (chosen === null) break;
      b.dir = chosen;
      if (!exits(s, b, den).includes(b.dir)) break;
    }
    const [dx, dy] = vector[b.dir];
    const offset = dx ? (b.x - c.x) * dx : (b.y - c.y) * dy;
    const next = offset < -1e-7 ? -offset : C.TILE - offset;
    const rate = typeof speed === "number" ? speed : speed();
    const step = Math.min(left * rate, next);
    b.x += dx * step;
    b.y += dy * step;
    left -= step / rate;
    b.moving = true;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
    if (step === next) {
      const target = center(b.tx, b.ty);
      b.x = target.x;
      b.y = target.y;
    }
  }
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
/** Grid traversal along a segment; the destination wall itself is visible. */
export function sight(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE),
    ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
  const crossings = [0, 1];
  for (let x = 0; x <= C.GRID_COLS; x++) {
    const t = (C.GRID_ORIGIN_X + x * C.TILE - a.x) / (b.x - a.x);
    if (t > 0 && t < 1) crossings.push(t);
  }
  for (let y = 0; y <= C.GRID_ROWS; y++) {
    const t = (C.GRID_ORIGIN_Y + y * C.TILE - a.y) / (b.y - a.y);
    if (t > 0 && t < 1) crossings.push(t);
  }
  crossings.sort((a, b) => a - b);
  for (let i = 1; i < crossings.length; i++) {
    const t = (crossings[i - 1] + crossings[i]) / 2;
    const x = Math.floor((a.x + (b.x - a.x) * t - C.GRID_ORIGIN_X) / C.TILE);
    const y = Math.floor((a.y + (b.y - a.y) * t - C.GRID_ORIGIN_Y) / C.TILE);
    if (x === tx && y === ty) continue;
    if (s.tiles[y]?.[x] === "#") return false;
  }
  return true;
}
export function blinded(s: ReadState, p: { x: number; y: number }): boolean {
  const f = s.forager,
    dx = f.x - p.x,
    dy = f.y - p.y,
    dd = dx * dx + dy * dy;
  return s.inkClouds.some((c) => {
    const t =
      dd === 0
        ? 0
        : Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / dd));
    return Math.hypot(c.x - p.x - t * dx, c.y - p.y - t * dy) <= c.radius;
  });
}
