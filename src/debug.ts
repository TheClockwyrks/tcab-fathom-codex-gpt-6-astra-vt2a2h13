import * as C from "./constants";
import type {
  FathomDebugApi,
  FathomState,
  ReadState,
  Direction,
  Screen,
  PredatorKind,
} from "./game";
import {
  clone,
  initialState,
  predator,
  reconcile,
  refresh,
  roster,
  screen,
} from "./simulation";
import { body, directions, layer, open, put } from "./world";
import { menuItems, menuRect } from "./ui";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new RangeError(`Fathom: ${message}`);
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  assert(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
    "invalid numeric argument",
  );
}
function flag(v: boolean) {
  assert(typeof v === "boolean", "expected boolean");
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  assert(open(s, x, y, den), "tile is closed");
}
function direction(d: Direction) {
  assert(directions.includes(d), "invalid direction");
}
function pose(s: ReadState, fn: (next: FathomState) => void): FathomState {
  const next = clone(s);
  fn(next);
  refresh(next);
  return next;
}
function hunter(s: FathomState, index: number) {
  number(index, 0, s.predators.length - 1, true);
  return s.predators[index];
}
function drifter(s: FathomState, index: number) {
  number(index, 0, s.drifters.length - 1, true);
  return s.drifters[index];
}
export const debug: FathomDebugApi = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s) => {
    const next = initialState(clone(s).art);
    next.muted = s.muted;
    refresh(next);
    return next;
  },
  snapshot: (s) => {
    const n = reconcile(s);
    return {
      version: n.version,
      screen: n.screen,
      menuIndex: n.menuIndex,
      titleIndex: n.titleIndex,
      depth: n.depth,
      score: n.score,
      lives: n.lives,
      muted: n.muted,
      planktonRemaining: n.planktonRemaining,
      drifterIn: n.drifterIn,
      brightness: n.brightness,
      brightHold: n.brightHold,
      visionRadius: n.visionRadius,
      windowRadius: n.windowRadius,
      sonar: n.sonar,
      ink: n.ink,
      grid: n.grid,
      tiles: n.tiles,
      plankton: n.plankton,
      visibility: n.visibility,
      forager: n.forager,
      drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: n.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
      inkClouds: n.inkClouds,
      simTime: n.simTime,
    };
  },
  reconcile,
  setScreen: (s, value) =>
    pose(s, (n) => {
      assert(
        (
          [
            "title",
            "howto",
            "countdown",
            "playing",
            "paused",
            "cleared",
            "gameover",
          ] as Screen[]
        ).includes(value),
        "invalid screen",
      );
      screen(n, value);
    }),
  setMenuIndex: (s, index) =>
    pose(s, (n) => {
      number(index, 0, menuItems(n.screen).length - 1, true);
      n.menuIndex = index;
    }),
  setTitleIndex: (s, index) =>
    pose(s, (n) => {
      number(index, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = index;
    }),
  menuItemRect: menuRect,
  setScore: (s, points) =>
    pose(s, (n) => {
      number(points, 0, Infinity, true);
      n.score = points;
    }),
  setLives: (s, lives) =>
    pose(s, (n) => {
      number(lives, 0, Infinity, true);
      n.lives = lives;
    }),
  setDepth: (s, depth) =>
    pose(s, (n) => {
      number(depth, 1, Infinity, true);
      n.depth = depth;
      n.predators = roster(depth);
      n.playTime = 0;
    }),
  setMaze: (s, rows) =>
    pose(s, (n) => {
      assert(
        Array.isArray(rows) &&
          rows.length === C.GRID_ROWS &&
          rows.every(
            (row) =>
              typeof row === "string" &&
              row.length === C.GRID_COLS &&
              /^[#.dg]+$/.test(row),
          ),
        "invalid maze dimensions or alphabet",
      );
      const all = rows.join("");
      assert(
        !/[dg]/.test(all) || all.split("g").length - 1 === 1,
        "den requires exactly one gate",
      );
      n.tiles = [...rows];
    }),
  setPlankton: (s, x, y, present) =>
    pose(s, (n) => {
      tile(n, x, y);
      flag(present);
      put(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.marks = n.marks.map((row) => row.map(() => 0));
    }),
  setForagerTile: (s, x, y) =>
    pose(s, (n) => {
      tile(n, x, y);
      n.forager = { ...body(x, y), dir: n.forager.dir };
      n.held = [];
    }),
  setForagerDir: (s, dir) =>
    pose(s, (n) => {
      direction(dir);
      n.forager.dir = dir;
      n.forager.moving = false;
      n.desired = dir;
    }),
  setBrightness: (s, g) =>
    pose(s, (n) => {
      number(g, 0, 1);
      n.brightness = g;
    }),
  setBrightHold: (s, seconds) =>
    pose(s, (n) => {
      number(seconds, 0, C.BRIGHT_HOLD);
      n.brightHold = seconds;
    }),
  clearPredators: (s) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s, kind, x, y) =>
    pose(s, (n) => {
      assert(
        (C.DEN_ORDER as readonly PredatorKind[]).includes(kind),
        "invalid predator kind",
      );
      tile(n, x, y);
      n.predators.push(predator(kind, x, y));
    }),
  setPredatorTile: (s, index, x, y) =>
    pose(s, (n) => {
      const p = hunter(n, index);
      tile(n, x, y, true);
      Object.assign(p, { ...body(x, y), dir: p.dir });
    }),
  setPredatorDir: (s, index, dir) =>
    pose(s, (n) => {
      direction(dir);
      hunter(n, index).dir = dir;
    }),
  setPredatorState: (s, index, value) =>
    pose(s, (n) => {
      const p = hunter(n, index);
      assert(
        ["den", "wander", "chase"].includes(value),
        "invalid predator state",
      );
      assert(
        value === "den"
          ? /[dg]/.test(n.tiles[p.ty]?.[p.tx] ?? "#")
          : n.tiles[p.ty]?.[p.tx] === ".",
        "predator state incompatible with tile",
      );
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = value === "chase" ? C.LINGER_TIME : 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    }),
  setPredatorReleased: (s, i, v) =>
    pose(s, (n) => {
      flag(v);
      hunter(n, i).released = v;
    }),
  setPredatorMind: (s, i, v) =>
    pose(s, (n) => {
      flag(v);
      hunter(n, i).mind = v;
    }),
  setPredatorTravel: (s, i, v) =>
    pose(s, (n) => {
      flag(v);
      hunter(n, i).travel = v;
    }),
  spawnDrifter: (s, x, y) =>
    pose(s, (n) => {
      tile(n, x, y);
      n.drifters.push({ ...body(x, y), lit: false, mind: true, travel: true });
    }),
  clearDrifters: (s) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s, i, v) =>
    pose(s, (n) => {
      flag(v);
      drifter(n, i).mind = v;
    }),
  setDrifterTravel: (s, i, v) =>
    pose(s, (n) => {
      flag(v);
      drifter(n, i).travel = v;
    }),
  setDrifterIn: (s, seconds) =>
    pose(s, (n) => {
      number(seconds, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = seconds;
    }),
  setSonarCooldown: (s, seconds) =>
    pose(s, (n) => {
      number(seconds);
      n.sonar.cooldown = seconds;
    }),
  setInkCooldown: (s, seconds) =>
    pose(s, (n) => {
      number(seconds);
      n.ink.cooldown = seconds;
    }),
};
