import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type {
  FathomState,
  ReadState,
  Predator,
  PredatorKind,
  Screen,
  Direction,
  Pulse,
} from "./game";
import {
  atCenter,
  blinded,
  body,
  center,
  directions,
  distance,
  distances,
  exits,
  layer,
  locate,
  maze,
  move,
  neighbor,
  opposite,
  put,
  sight,
  toward,
  wander,
} from "./world";
import type { Art } from "./render";
import { menuItems, menuRect } from "./ui";
export const clone = (s: ReadState): FathomState => {
  const { art, ...data } = s;
  return { ...structuredClone(data), art } as FathomState;
};
export function predator(kind: PredatorKind, tx: number, ty: number): Predator {
  return {
    ...body(tx, ty),
    kind,
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: kind === "gloamfin" ? null : C.LANTERN_RANGE_BASE,
    hearingRange: kind === "gloamfin" ? C.GLOAMFIN_HEAR : null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    releaseAt: null,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fade: 0,
  };
}
export function roster(depth: number): Predator[] {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((kind, i) => ({
    ...predator(kind, 16 + (i % 4), 8 + Math.floor(i / 4)),
    state: "den",
    released: false,
    releaseAt: i * C.DEN_RELEASE_GAP,
  }));
}
export function initialState(art: Art = {}): FathomState {
  const tiles = maze();
  return {
    art,
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((row) => row.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...body(17, 13), dir: "left" },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenTime: 0,
    playTime: 0,
    desired: "left",
    held: [],
    pending: [],
    pointerDown: null,
    start: { tx: 17, ty: 13 },
    random: 0xfa710,
    marks: Array.from({ length: C.GRID_ROWS }, () =>
      Array<number>(C.GRID_COLS).fill(0),
    ),
  };
}
export function refresh(s: FathomState): void {
  for (const b of [s.forager, ...s.predators, ...s.drifters]) locate(b);
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
}
export function reconcile(state: ReadState): FathomState {
  const s = clone(state);
  refresh(s);
  return s;
}
export function screen(s: FathomState, value: Screen) {
  const previous = s.screen;
  s.screen = value;
  s.screenTime = 0;
  s.menuIndex =
    value === "title"
      ? s.titleIndex
      : value === "paused" || value === "gameover"
        ? 0
        : null;
  s.pointerDown = null;
  if (value === "playing" && previous !== "paused") s.playTime = 0;
}
function fresh(s: FathomState, to: Screen, descend = false): FathomState {
  const next = initialState(s.art);
  next.muted = s.muted;
  next.titleIndex = s.titleIndex;
  next.simTime = s.simTime;
  next.remainder = s.remainder;
  if (descend) {
    next.depth = s.depth + 1;
    next.score = s.score;
    next.lives = s.lives;
    next.predators = roster(next.depth);
  }
  screen(next, to);
  refresh(next);
  return next;
}
function loseLife(s: FathomState) {
  if (s.lives === 0) {
    screen(s, "gameover");
    return;
  }
  s.lives--;
  s.forager = { ...body(s.start.tx, s.start.ty), dir: "left" };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.marks = s.marks.map((row) => row.map(() => 0));
  screen(s, "countdown");
}
function acquire(s: FathomState, p: Predator, always = false) {
  if (p.state !== "chase" || always) {
    if (p.kind !== "lanternjaw") p.alertLeft = C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.alert = p.alertLeft > 0;
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.state = "chase";
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flaring) p.fade = 0.4;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
    p.flareTime = 0;
  }
}
function drop(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.flareIn = C.FLARE_INTERVAL;
}
function cast(
  s: FathomState,
  p: Predator,
  index: number,
  tint: "violet" | "orange",
  cues: Set<C.CueName>,
) {
  s.pulses.push({
    source: "gloamfin",
    tint,
    ox: p.tx,
    oy: p.ty,
    front: 0,
    range: C.GLOAMFIN_PING_RANGE,
    owner: index,
    caught: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.sincePing = 0;
  cues.add(C.CUES.predatorPing);
}
function hunters(s: FathomState, cues: Set<C.CueName>) {
  s.predators.forEach((p, index) => {
    p.mark = Math.max(0, p.mark - C.TICK_DT);
    p.fade = Math.max(0, p.fade - C.TICK_DT);
    if (!p.mind) return;
    p.alertLeft = Math.max(0, p.alertLeft - C.TICK_DT);
    p.alert = p.alertLeft > 0;
    if (p.state === "den") {
      if (!s.tiles.some((r) => r.includes("d"))) return;
      if (p.releaseAt !== null && s.playTime + C.TICK_DT + 1e-8 >= p.releaseAt)
        p.released = true;
      if (!p.released) return;
      const gy = s.tiles.findIndex((r) => r.includes("g"));
      const gx = s.tiles[gy]?.indexOf("g");
      if (gy < 0 || gx === undefined) return;
      const goal = exits(s, { tx: gx, ty: gy }, true)
        .map((d) => neighbor(s, gx, gy, d)!)
        .find((n) => s.tiles[n.ty][n.tx] === ".");
      if (goal && p.travel)
        move(
          s,
          p,
          C.PREDATOR_SPEED,
          () =>
            p.tx === goal.tx && p.ty === goal.ty
              ? null
              : toward(s, p, goal, true),
          true,
        );
      if (s.tiles[p.ty]?.[p.tx] === "." && atCenter(p)) p.state = "wander";
      return;
    }
    const f = s.forager;
    if (p.kind === "gloamfin") {
      const was = p.hearingLock;
      p.hearingLock = distance(p, f) <= C.GLOAMFIN_HEAR;
      if (p.hearingLock) acquire(s, p, !was);
      p.pingIn -= C.TICK_DT;
      p.sincePing += C.TICK_DT;
      if (was && !p.hearingLock) p.pingIn = 0;
      if (p.state === "chase")
        p.chaseSpeed = Math.min(
          C.GLOAMFIN_CHASE_SPEED,
          p.chaseSpeed +
            ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
              C.GLOAMFIN_RAMP_TIME,
        );
      if (
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        atCenter(p) &&
        (f.tx !== p.tx || f.ty !== p.ty)
      ) {
        p.state = "search";
        p.searchTime = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.searchTime += C.TICK_DT;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
      }
      const orange =
        p.state === "search" &&
        !p.searchPing &&
        p.searchTime + 1e-8 >= C.GLOAMFIN_SEARCH_DELAY;
      if (
        !p.hearingLock &&
        p.sincePing + 1e-8 >= C.GLOAMFIN_PING_MIN_GAP &&
        (orange || p.pingIn <= 0)
      ) {
        cast(s, p, index, orange ? "orange" : "violet", cues);
        if (orange) p.searchPing = true;
      }
    } else {
      const blind = blinded(s, p);
      const seen =
        !blind && distance(p, f) <= (p.detectRange ?? 0) && sight(s, p, f);
      const bloomLock = !blind && p.flaring && distance(p, f) <= C.FLARE_RADIUS;
      if (blind) {
        if (p.state === "chase") drop(p);
      } else if (seen || bloomLock) acquire(s, p);
      else if (p.state === "chase") {
        p.linger -= C.TICK_DT;
        if (p.linger <= 0) drop(p);
      }
      if (p.kind === "flarefish" && p.state === "wander") {
        if (p.flareCharging) {
          p.flareTime -= C.TICK_DT;
          if (p.flareTime <= 1e-8) {
            p.flareCharging = false;
            p.flaring = true;
            p.flareRadius = C.FLARE_RADIUS;
            p.flareTime = C.FLARE_BLOOM;
            cues.add(C.CUES.flare);
          }
        } else if (p.flaring) {
          p.flareTime -= C.TICK_DT;
          if (p.flareTime <= 1e-8) {
            p.flaring = false;
            p.flareRadius = 0;
            p.fade = 0.4;
            p.flareIn = C.FLARE_INTERVAL;
          }
        } else {
          p.flareIn -= C.TICK_DT;
          if (p.flareIn <= 1e-8) {
            p.flareCharging = true;
            p.flareTime = C.FLARE_CHARGE;
          }
        }
        if (p.flaring && !blind && distance(p, f) <= C.FLARE_RADIUS)
          acquire(s, p);
      }
    }
    p.alert = p.alertLeft > 0;
    refreshPredatorSpeed(p);
    if (p.travel) {
      const stopped =
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        atCenter(p);
      if (!stopped)
        move(
          s,
          p,
          () => p.speed,
          () => {
            if (
              p.state === "chase" &&
              p.fix &&
              p.tx === p.fix.tx &&
              p.ty === p.fix.ty
            )
              return null;
            let dir: Direction;
            if (p.state === "chase" && p.fix) dir = toward(s, p, p.fix);
            else if (
              p.state === "search" &&
              p.fix &&
              Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
                C.GLOAMFIN_SEARCH_ROAM
            )
              dir = toward(s, p, p.fix);
            else dir = wander(s, p);
            if (
              p.kind === "gloamfin" &&
              p.state === "chase" &&
              dir !== p.dir &&
              dir !== opposite(p.dir)
            ) {
              p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
              p.speed = p.chaseSpeed;
            }
            return dir;
          },
        );
      else p.moving = false;
    }
  });
}
function refreshPredatorSpeed(p: Predator) {
  p.speed =
    p.kind === "lanternjaw" && p.state === "wander"
      ? C.DRIFTER_SPEED
      : p.kind === "gloamfin" && p.state === "chase"
        ? p.chaseSpeed
        : C.PREDATOR_SPEED;
}
function waves(s: FathomState) {
  for (const pulse of s.pulses) {
    const old = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const dist = distances(s, pulse.ox, pulse.oy);
    const arrived = (x: number, y: number) => {
      const d = dist[y]?.[x];
      return (
        d !== undefined &&
        d <= pulse.range &&
        d <= pulse.front &&
        (d > old || (old === 0 && d === 0))
      );
    };
    if (pulse.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (arrived(x, y)) {
            s.marks[y][x] = C.SONAR_MARK_TIME;
            for (const d of directions) {
              const n = neighbor(s, x, y, d);
              if (n && s.tiles[n.ty][n.tx] === "#")
                s.marks[n.ty][n.tx] = C.SONAR_MARK_TIME;
            }
          }
      for (const p of s.predators)
        if (p.state !== "den" && arrived(p.tx, p.ty)) {
          if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p, true);
        }
    } else if (!pulse.caught && arrived(s.forager.tx, s.forager.ty)) {
      pulse.caught = true;
      const p = pulse.owner === null ? undefined : s.predators[pulse.owner];
      if (p?.mind && p.state !== "den") acquire(s, p, true);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function light(s: FathomState) {
  const flares = s.predators.filter((p) => p.flaring);
  const passive = (x: number, y: number) => {
    const c = center(x, y);
    return distance(c, s.forager) <= s.visionRadius && sight(s, s.forager, c);
  };
  const flare = (p: { x: number; y: number }) =>
    flares.some((f) => distance(f, p) <= C.FLARE_RADIUS);
  s.visibility = s.visibility.map((row, y) =>
    [...row]
      .map((v, x) =>
        passive(x, y) || flare(center(x, y)) || s.marks[y][x] > 0
          ? "l"
          : v === "u"
            ? "u"
            : "r",
      )
      .join(""),
  );
  for (const p of s.predators)
    p.lit =
      p.state !== "den" &&
      (passive(p.tx, p.ty) ||
        flare(p) ||
        p.mark > 0 ||
        p.alert ||
        !!p.flareCharging);
  for (const d of s.drifters) d.lit = passive(d.tx, d.ty) || flare(d);
}
function play(s: FathomState, edges: Set<C.ActionName>, cues: Set<C.CueName>) {
  s.sonar.cooldown = Math.max(0, s.sonar.cooldown - C.TICK_DT);
  s.ink.cooldown = Math.max(0, s.ink.cooldown - C.TICK_DT);
  if (s.sonar.cooldown < 1e-8) s.sonar.cooldown = 0;
  if (s.ink.cooldown < 1e-8) s.ink.cooldown = 0;
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = Math.max(0, s.brightHold - C.TICK_DT);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - C.TICK_DT }))
    .filter((c) => c.remaining > 1e-8);
  s.marks = s.marks.map((row) => row.map((v) => Math.max(0, v - C.TICK_DT)));
  if (edges.has("a") && s.sonar.cooldown <= 1e-8) {
    const p: Pulse = {
      source: "forager",
      tint: "cyan",
      ox: s.forager.tx,
      oy: s.forager.ty,
      front: 0,
      range: s.sonar.range,
      owner: null,
      caught: false,
    };
    s.pulses.push(p);
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (edges.has("b") && s.ink.cooldown <= 1e-8) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  s.forager.moving = false;
  if (s.held.length) {
    if (s.desired === opposite(s.forager.dir)) s.forager.dir = s.desired;
    move(s, s.forager, C.FORAGER_SPEED, () =>
      exits(s, s.forager).includes(s.desired) ? s.desired : s.forager.dir,
    );
  }
  const f = s.forager;
  if (s.tiles[f.ty]?.[f.tx] === "." && s.plankton[f.ty]?.[f.tx] === "*") {
    put(s.plankton, f.tx, f.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      screen(s, "cleared");
      cues.add(C.CUES.descend);
      refresh(s);
      light(s);
      return;
    }
  }
  refresh(s);
  hunters(s, cues);
  waves(s);
  s.drifterIn = Math.max(0, s.drifterIn - C.TICK_DT);
  if (
    s.drifterIn <= 1e-8 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const gy = s.tiles.findIndex((r) => r.includes("g")),
      gx = s.tiles[gy]?.indexOf("g");
    if (gy >= 0 && gx !== undefined) {
      s.drifters.push({
        ...body(gx, gy),
        mind: true,
        travel: true,
        lit: false,
      });
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  for (const d of s.drifters)
    if (d.mind && d.travel) {
      const gate = s.tiles[d.ty]?.[d.tx] === "g";
      move(
        s,
        d,
        C.DRIFTER_SPEED,
        () =>
          gate
            ? (exits(s, d).find((dir) => {
                const n = neighbor(s, d.tx, d.ty, dir)!;
                return s.tiles[n.ty][n.tx] === ".";
              }) ?? d.dir)
            : wander(s, d),
        gate,
      );
    }
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (
    s.predators.some(
      (p) =>
        (p.state !== "den" || s.tiles.some((r) => r.includes("d"))) &&
        p.tx === f.tx &&
        p.ty === f.ty,
    )
  ) {
    cues.add(C.CUES.caught);
    loseLife(s);
  }
  s.playTime += C.TICK_DT;
  refresh(s);
  light(s);
}
function confirm(s: FathomState): FathomState {
  const index = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = index ?? 0;
    return index === 0 ? fresh(s, "countdown") : (screen(s, "howto"), s);
  }
  if (s.screen === "paused") {
    if (index === 0) screen(s, "playing");
    else return fresh(s, index === 1 ? "countdown" : "title");
  }
  if (s.screen === "gameover")
    return fresh(s, index === 0 ? "countdown" : "title");
  return s;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): FathomState {
  let s = clone(state);
  const edges = C.ACTIONS.filter((a) => api.input.pressed(a));
  if (edges.includes("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  const held = directions.filter((d) => api.input.value(d) > 0);
  const newly = held.filter((d) => !s.held.includes(d));
  if (newly.length) s.desired = newly[newly.length - 1];
  else if (held.length && !held.includes(s.desired))
    s.desired = held[held.length - 1];
  s.held = held;
  s.pending.push(...edges.filter((e) => e !== "mute"));
  for (const p of api.input.pointerSamples()) {
    if (!p.primary) continue;
    const index = menuItems(s.screen).findIndex((_, i) => {
      const r = menuRect(s, i)!;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    });
    if (index >= 0) s.menuIndex = index;
    if (p.type === "down")
      s.pointerDown = { id: p.id, index, screen: s.screen };
    if (p.type === "up") {
      if (
        s.pointerDown?.id === p.id &&
        s.pointerDown.screen === s.screen &&
        ((index >= 0 && s.pointerDown.index === index) || s.screen === "howto")
      )
        s.pending.push("confirm");
      s.pointerDown = null;
    }
  }
  s.remainder += dt;
  while (s.remainder + 1e-10 >= C.TICK_DT) {
    s.remainder = Math.max(0, s.remainder - C.TICK_DT);
    s.simTime += C.TICK_DT;
    const pressed = new Set(s.pending);
    s.pending = [];
    const cues = new Set<C.CueName>();
    const before = s.screen;
    if (s.screen === "playing" && pressed.has("pause")) screen(s, "paused");
    else if (
      s.screen === "paused" &&
      (pressed.has("pause") || pressed.has("back"))
    )
      screen(s, "playing");
    else if (
      s.screen === "howto" &&
      (pressed.has("confirm") || pressed.has("back"))
    )
      s = fresh(s, "title");
    else if (s.screen === "gameover" && pressed.has("back"))
      s = fresh(s, "title");
    else if (s.menuIndex !== null) {
      const count = menuItems(s.screen).length;
      if (pressed.has("up")) s.menuIndex = (s.menuIndex + count - 1) % count;
      if (pressed.has("down")) s.menuIndex = (s.menuIndex + 1) % count;
      if (pressed.has("confirm")) s = confirm(s);
    }
    if (before === s.screen) {
      if (s.screen === "playing") play(s, pressed, cues);
      else if (s.screen === "countdown") {
        s.screenTime += C.TICK_DT;
        light(s);
        if (s.screenTime + 1e-8 >= 2) screen(s, "playing");
      } else if (s.screen === "cleared") {
        s.screenTime += C.TICK_DT;
        if (s.screenTime + 1e-8 >= 2) s = fresh(s, "countdown", true);
      }
    }
    for (const cue of cues) api.audio.play(cue);
  }
  refresh(s);
  return s;
}
