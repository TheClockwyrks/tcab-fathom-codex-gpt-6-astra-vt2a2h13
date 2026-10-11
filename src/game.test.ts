/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type FathomState,
  type FathomDebugApi,
} from "./game";
import * as C from "./constants";
import { center, distances, exits, layer, put } from "./world";

const engines: Engine<FathomState, FathomDebugApi>[] = [];
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(new Uint8Array(await readFile(path))),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function setup(hz = 120) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    game,
    layout: C.LAYOUT,
    clock: new ConstantClock(1000 / hz),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(e);
  await e.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const pointer = (type: string, x: number, y: number) =>
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  const pose = (
    fn: (d: FathomDebugApi, s: Readonly<FathomState>) => FathomState,
  ) => e.apply((s) => fn(e.debug, s as Readonly<FathomState>));
  const empty = () => {
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
  };
  return { e, key, pointer, pose, empty, canvas };
}
function fixture(cells: [number, number][]) {
  const rows = layer("#");
  for (const [x, y] of cells) put(rows, x, y, ".");
  return rows;
}

describe("engine integration and menus", () => {
  it("registers and loads the complete game and renders all screens", async () => {
    const { e } = await setup();
    expect(e.state.screen).toBe("title");
    expect(e.debug.version).toBe(C.FATHOM_DEBUG_VERSION);
    expect(Object.values(e.state.art).reduce((a, v) => a + v.length, 0)).toBe(
      75,
    );
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "cleared",
      "gameover",
    ] as const) {
      e.apply((s) => e.debug.setScreen(s, screen));
      await e.advance(1);
    }
    expect(e.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("remembers title selection, supports pointer confirmation and rejects split clicks", async () => {
    const { e, key, pointer } = await setup();
    key("ArrowDown");
    await e.advance(1);
    key("ArrowDown", false);
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    expect(e.state.screen).toBe("howto");
    expect(e.state.titleIndex).toBe(1);
    pointer("pointerdown", 20, 20);
    pointer("pointerup", 30, 30);
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    const first = e.debug.menuItemRect(e.state, 0)!;
    const second = e.debug.menuItemRect(e.state, 1)!;
    pointer("pointerdown", first.x + 10, first.y + 10);
    pointer("pointerup", second.x + 10, second.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    pointer("pointerdown", first.x + 10, first.y + 10);
    pointer("pointerup", first.x + 10, first.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    await e.advance(240);
    expect(e.state.screen).toBe("playing");
  });
  it("Escape opens and closes pause once, freezing the board but not simulation time", async () => {
    const { e, key, empty } = await setup();
    empty();
    key("ArrowLeft");
    await e.advance(20);
    key("Escape");
    await e.advance(1);
    key("Escape", false);
    expect(e.state.screen).toBe("paused");
    const old = structuredClone(e.debug.snapshot(e.state));
    const x = e.state.forager.x;
    const time = e.state.simTime;
    await e.advance(30);
    expect(e.state.forager.x).toBe(x);
    expect(e.state.simTime).toBeGreaterThan(time);
    expect(old).toBeDefined();
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
  });
  it("mutes on every screen and emits the exact event cues", async () => {
    const { e, key } = await setup();
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    key("KeyM");
    await e.advance(1);
    key("KeyM", false);
    expect(e.state.muted).toBe(true);
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    key("Space");
    key("ShiftLeft");
    await e.advance(1);
    expect(cues.sort()).toEqual([C.CUES.eat, C.CUES.ink, C.CUES.sonar].sort());
  });
});
describe("maze and movement", () => {
  it("satisfies connectivity, symmetry, den enclosure, density, branching and corridor-run bounds", async () => {
    const { e } = await setup();
    const s = e.state;
    const corridors: { tx: number; ty: number }[] = [];
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x],
          mirror = s.tiles[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t === ".") {
          corridors.push({ tx: x, ty: y });
          expect(exits(s, { tx: x, ty: y }).length).toBeGreaterThanOrEqual(2);
          expect(
            s.tiles[y + 1]?.[x] === "." &&
              s.tiles[y][x + 1] === "." &&
              s.tiles[y + 1]?.[x + 1] === ".",
          ).toBe(false);
        }
        if (t === "d") expect(exits(s, { tx: x, ty: y })).toHaveLength(0);
      }
    const dist = distances(s, s.forager.tx, s.forager.ty, false);
    expect(corridors.every((p) => Number.isFinite(dist[p.ty][p.tx]))).toBe(
      true,
    );
    const density = corridors.length / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2));
    expect(density).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(density).toBeLessThanOrEqual(C.MAZE_DENSITY_MAX);
    const openness =
      corridors.reduce((n, p) => n + exits(s, p).length, 0) / corridors.length;
    expect(openness).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(openness).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const pending = new Set(
      corridors
        .filter((p) => exits(s, p).length === 2)
        .map((p) => `${p.tx},${p.ty}`),
    );
    const lengths: number[] = [];
    while (pending.size) {
      const first = pending.values().next().value!;
      pending.delete(first);
      const queue = [first];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i].split(",").map(Number);
        for (const key of pending) {
          const [a, b] = key.split(",").map(Number);
          if (Math.abs(x - a) + Math.abs(y - b) === 1) {
            pending.delete(key);
            queue.push(key);
          }
        }
      }
      lengths.push(queue.length);
    }
    const run = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(run).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(run).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
  it("moves at the fixed rate, buffers turns, reverses immediately and stops without a held key", async () => {
    const { e, key, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 12, 13));
    e.apply((s) => e.debug.setForagerDir(s, "right"));
    key("ArrowRight");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(center(12, 13).x + 16);
    key("ArrowUp");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(center(13, 13).x);
    await e.advance(15);
    expect(e.state.forager.y).toBeCloseTo(center(13, 13).y - 16);
    key("ArrowUp", false);
    key("ArrowRight", false);
    await e.advance(10);
    expect(e.state.forager.moving).toBe(false);
    key("ArrowDown");
    await e.advance(15);
    expect(e.state.forager.y).toBeCloseTo(center(13, 13).y);
  });
  it("crosses the wrap continuously in one tile of travel", async () => {
    const { e, key, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 0, 8));
    e.apply((s) => e.debug.setForagerDir(s, "left"));
    key("ArrowLeft");
    await e.advance(30);
    expect(e.state.forager.tx).toBe(C.GRID_COLS - 1);
    expect(e.state.forager.x).toBeCloseTo(center(C.GRID_COLS - 1, 8).x);
  });
  it("holds bodies on closed or isolated fixture tiles", async () => {
    const { e, key, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setMaze(s, fixture([[3, 3]])));
    e.apply((s) => e.debug.setForagerTile(s, 3, 3));
    key("ArrowRight");
    await e.advance(120);
    expect(e.state.forager).toMatchObject({ ...center(3, 3), moving: false });
    e.apply((s) => e.debug.setMaze(s, layer("#")));
    await e.advance(120);
    expect(e.state.forager.tx).toBe(3);
  });
  it("produces identical fixed-step results under different frame partitions", async () => {
    const a = await setup(30),
      b = await setup(120);
    a.empty();
    b.empty();
    a.key("ArrowLeft");
    b.key("ArrowLeft");
    await a.e.advance(30);
    await b.e.advance(120);
    expect(a.e.debug.snapshot(a.e.state)).toEqual(
      b.e.debug.snapshot(b.e.state),
    );
  });
});
describe("senses and hunters", () => {
  it("eats on tile entry, holds brightness and then halves it on the specified curve", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON);
    expect(e.state.brightness).toBe(C.BRIGHT_PER_EAT);
    await e.advance(120);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    await e.advance(108);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2);
    expect(e.state.windowRadius).toBeCloseTo(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * e.state.brightness,
    );
  });
  it("stops passive light at rock and remembers explored tiles outside the window", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) =>
      e.debug.setMaze(
        s,
        fixture([
          [3, 3],
          [5, 3],
          [20, 3],
        ]),
      ),
    );
    e.apply((s) => e.debug.setForagerTile(s, 3, 3));
    e.apply((s) => e.debug.clearFog(s));
    await e.advance(1);
    expect(e.state.visibility[3][4]).toBe("l");
    expect(e.state.visibility[3][5]).toBe("u");
    e.apply((s) => e.debug.setForagerTile(s, 20, 3));
    await e.advance(1);
    expect(e.state.visibility[3][3]).toBe("r");
  });
  it("sonar bends around corners, marks sound hunters on arrival and leaves amber bodies unresolved", async () => {
    const { e, key, empty } = await setup();
    empty();
    e.apply((s) =>
      e.debug.setMaze(
        s,
        fixture([
          [2, 2],
          [3, 2],
          [4, 2],
          [4, 3],
          [4, 4],
          [4, 5],
          [4, 6],
        ]),
      ),
    );
    e.apply((s) => e.debug.setForagerTile(s, 2, 2));
    for (const kind of ["gloamfin", "lanternjaw"] as const) {
      e.apply((s) => e.debug.addPredator(s, kind, 4, 6));
      e.apply((s) =>
        e.debug.setPredatorTravel(s, s.predators.length - 1, false),
      );
    }
    key("Space");
    await e.advance(20);
    expect(e.state.predators[0].state).toBe("wander");
    await e.advance(32);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].lit).toBe(true);
    expect(e.state.predators[1].lit).toBe(false);
    expect(e.state.visibility[6][4]).toBe("l");
  });
  it("ink breaks sight fixes immediately but has no effect on close hearing through rock", async () => {
    const { e, key, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 13, 13));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 15, 13));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 13, 11));
    e.apply((s) => e.debug.setPredatorTravel(s, 1, false));
    await e.advance(1);
    expect(e.state.predators[1].hearingLock).toBe(true);
    expect(e.state.predators[1].alert).toBe(true);
  });
  it("releases the den roster in order and keeps travel disabled independently of sensing", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    for (let i = 0; i < 3; i++)
      e.apply((s) => e.debug.setPredatorTravel(s, i, false));
    await e.advance(1);
    expect(e.state.predators.map((p) => p.released)).toEqual([
      true,
      false,
      false,
    ]);
    await e.advance(600);
    expect(e.state.predators.map((p) => p.released)).toEqual([
      true,
      true,
      false,
    ]);
    expect(e.state.predators.every((p) => p.state === "den")).toBe(true);
  });
  it("frozen minds keep their posed state, position and fix", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 16, 13));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    const before = e.state.predators[0];
    await e.advance(240);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].x).toBe(before.x);
    expect(e.state.predators[0].fix).toEqual(before.fix);
  });
  it("flare charges, lights through walls beyond the window, and returns lit terrain to memory", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 1, 1));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 30, 13));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(840);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(60);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.visibility[12][30]).toBe("l");
    await e.advance(120);
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.visibility[12][30]).toBe("r");
  });
  it("a wandering Gloamfin emits non-revealing violet pings", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 1, 1));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 30, 13));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(482);
    expect(e.state.pulses.some((p) => p.tint === "violet")).toBe(true);
    expect(e.state.visibility[13][30]).toBe("u");
    expect(e.state.predators[0].speed).toBe(C.PREDATOR_SPEED);
  });
});
describe("progression and poses", () => {
  it("loses reserves, preserves the maze and reaches game over on the fourth catch", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setScore(s, 90));
    for (let i = 0; i < 4; i++) {
      e.apply((s) => e.debug.setScreen(s, "playing"));
      e.apply((s) =>
        e.debug.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty),
      );
      e.apply((s) => e.debug.setPredatorMind(s, s.predators.length - 1, false));
      await e.advance(1);
      expect(e.state.score).toBe(90);
      expect(e.state.lives).toBe(Math.max(0, 2 - i));
    }
    expect(e.state.screen).toBe("gameover");
  });
  it("clears only by eating the last mote and descends preserving score and lives", async () => {
    const { e, empty } = await setup();
    empty();
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    e.apply((s) => e.debug.setPlankton(s, s.forager.tx, s.forager.ty, true));
    await e.advance(1);
    expect(e.state.screen).toBe("cleared");
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    await e.advance(240);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.depth).toBe(2);
    expect(e.state.predators).toHaveLength(4);
    expect(e.state.sonar.range).toBe(8);
  });
  it("spawns cadence drifters and eats posed drifters regardless of mind and travel", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    e.apply((s) => e.debug.spawnDrifter(s, s.forager.tx, s.forager.ty));
    e.apply((s) => e.debug.setDrifterMind(s, 1, false));
    e.apply((s) => e.debug.setDrifterTravel(s, 1, false));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_DRIFTER + C.SCORE_PLANKTON);
  });
  it("reconciles without advancing or sensing, validates domains and leaves input values untouched", async () => {
    const { e } = await setup();
    const old = e.state;
    const next = e.debug.setBrightness(old, 1);
    expect(old.brightness).toBe(0);
    expect(next.windowRadius).toBe(C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN);
    const cleared = e.debug.clearFog(next);
    expect(e.debug.reconcile(cleared)).toEqual(cleared);
    expect(
      e.debug.reconcile(cleared).visibility.every((r) => /^u+$/.test(r)),
    ).toBe(true);
    expect(() => e.debug.setBrightness(old, 1.1)).toThrow();
    expect(() => e.debug.setMaze(old, ["."])).toThrow();
    expect(() => e.debug.setForagerTile(old, 0, 0)).toThrow();
    expect(() => e.debug.setPredatorMind(old, 8, false)).toThrow();
    expect(() =>
      e.debug.setMenuIndex(e.debug.setScreen(old, "playing"), 0),
    ).toThrow();
    expect(e.debug.menuItemRect(old, 99)).toBeNull();
    expect(e.debug.setDepth(old, 50).predators).toHaveLength(6);
    expect(e.debug.setDepth(old, 50).sonar.range).toBe(C.SONAR_RANGE_MIN);
    const reset = e.debug.reset(e.debug.setScore(next, 100));
    expect(reset.score).toBe(0);
    expect(reset.simTime).toBe(0);
    expect(reset.titleIndex).toBe(0);
  });
});

describe("pursuit edge cases", () => {
  it("takes the shortest corridor route around intervening rock", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) =>
      e.debug.setMaze(
        s,
        fixture([
          [2, 2],
          [2, 3],
          [2, 4],
          [3, 4],
          [4, 4],
          [4, 3],
          [4, 2],
        ]),
      ),
    );
    e.apply((s) => e.debug.setForagerTile(s, 4, 2));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 2, 2));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    await e.advance(60);
    expect(e.state.predators[0].x).toBeCloseTo(center(2, 2).x);
    expect(e.state.predators[0].y).toBeGreaterThan(center(2, 3).y);
    expect(
      e.state.tiles[e.state.predators[0].ty][e.state.predators[0].tx],
    ).toBe(".");
  });

  it("searches an abandoned sound fix and sends the guaranteed orange ping", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) => e.debug.setForagerTile(s, 10, 11));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 13, 11));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    e.apply((s) => e.debug.setForagerTile(s, 30, 11));
    await e.advance(1);
    expect(e.state.predators[0].speed).toBe(C.GLOAMFIN_CORNER_SPEED);
    expect(e.state.predators[0].x).toBeCloseTo(
      center(13, 11).x - C.GLOAMFIN_CORNER_SPEED * C.TICK_DT,
    );
    await e.advance(119);
    expect(e.state.predators[0].state).toBe("search");
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(125);
    expect(e.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    expect(e.state.predators[0].searchPing).toBe(true);
    await e.advance(480);
    expect(e.state.predators[0].state).toBe("wander");
  });

  it("a flare locks through rock at bloom onset and extinguishes on acquisition", async () => {
    const { e, empty } = await setup();
    empty();
    e.apply((s) =>
      e.debug.setMaze(
        s,
        fixture([
          [4, 4],
          [4, 6],
        ]),
      ),
    );
    e.apply((s) => e.debug.setForagerTile(s, 4, 4));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 4, 6));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(899);
    expect(e.state.predators[0].state).toBe("wander");
    await e.advance(1);
    expect(e.state.predators[0]).toMatchObject({
      state: "chase",
      alert: true,
      flaring: false,
      flareRadius: 0,
    });
  });
});
