import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Direction, ReadState } from "./game";
import { center, distance, distances } from "./world";
import { menuItems, menuRect } from "./ui";
export type Art = Record<string, ImageBitmap[]>;
const abyss = "#03060c",
  cyan = "#8df6e8",
  dim = "#52777e",
  white = "#d5f7f2",
  amber = "#ff9968";
const font = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
export function createRenderer() {
  return (s: ReadState, api: RenderApi): void => {
    const art = s.art;
    const ctx = api.ctx;
    ctx.imageSmoothingEnabled = false;
    const text = (
      value: string,
      x: number,
      y: number,
      size = 16,
      color = white,
      align: CanvasTextAlign = "left",
    ) => {
      ctx.font = `${size}px ${font}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    };
    const line = (
      x: number,
      y: number,
      x2: number,
      y2: number,
      color = "#16353e",
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const circle = (
      x: number,
      y: number,
      r: number,
      color: string | CanvasGradient,
    ) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const glow = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      circle(x, y, r, g);
    };
    const sprite = (
      sheet: string,
      frame: number,
      x: number,
      y: number,
      size = C.TILE,
    ) => {
      const image = art[sheet]?.[frame];
      if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    };
    const facing = (dir: Direction) =>
      ({ down: 0, up: 2, left: 4, right: 6 })[dir];
    const swim = Math.floor(s.playTime * 8) % 2,
      sway = Math.floor(s.playTime * 8) % 8;
    const mote = (x: number, y: number) => {
      glow(x, y, 22, "#ed78354d");
      circle(x, y, 3, amber);
      circle(x, y, 1.2, "#fff1c3");
    };
    const tile = (x: number, y: number, visibility: string) => {
      if (visibility === "u") return;
      const kind = s.tiles[y][x],
        c = center(x, y);
      let frame = 16;
      if (kind === "#")
        frame =
          (s.tiles[y - 1]?.[x] === "#" ? 1 : 0) +
          (s.tiles[y]?.[x + 1] === "#" ? 2 : 0) +
          (s.tiles[y + 1]?.[x] === "#" ? 4 : 0) +
          (s.tiles[y]?.[x - 1] === "#" ? 8 : 0);
      if (kind === "g") frame = 18;
      ctx.globalAlpha = visibility === "r" ? 0.25 : 0.95;
      sprite("trench-walls", frame, c.x, c.y);
      ctx.globalAlpha = 1;
      if (s.plankton[y][x] === "*") {
        ctx.globalAlpha = visibility === "r" ? 0.28 : 1;
        glow(c.x, c.y, 10, "#79e9d53a");
        circle(c.x, c.y, C.PLANKTON_DOT / 2, "#a5e9cc");
        ctx.globalAlpha = 1;
      }
    };
    const mazeView = () => {
      ctx.fillStyle = abyss;
      ctx.fillRect(
        C.GRID_ORIGIN_X,
        C.GRID_ORIGIN_Y,
        C.GRID_COLS * C.TILE,
        C.GRID_ROWS * C.TILE,
      );
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        C.GRID_ORIGIN_X,
        C.GRID_ORIGIN_Y,
        C.GRID_COLS * C.TILE,
        C.GRID_ROWS * C.TILE,
      );
      ctx.clip();
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
      ctx.clip();
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++) tile(x, y, s.visibility[y][x]);
      glow(s.forager.x, s.forager.y, s.windowRadius, "#2abbad14");
      for (const d of s.drifters) {
        if (d.lit) sprite("drifter", sway, d.x, d.y);
        mote(d.x, d.y);
      }
      for (const p of s.predators)
        if (p.kind === "lanternjaw" && p.state !== "den") mote(p.x, p.y);
      ctx.restore();
      for (const p of s.predators)
        if (p.flaring) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
          ctx.clip();
          for (let y = 0; y < C.GRID_ROWS; y++)
            for (let x = 0; x < C.GRID_COLS; x++) tile(x, y, "l");
          for (const d of s.drifters)
            if (distance(p, d) <= C.FLARE_RADIUS) {
              sprite("drifter", sway, d.x, d.y);
              mote(d.x, d.y);
            }
          ctx.restore();
        }
      for (const cloud of s.inkClouds) {
        glow(cloud.x, cloud.y, cloud.radius, "#000008f5");
        circle(cloud.x, cloud.y, cloud.radius * 0.8, "#000008d9");
      }
      for (const p of s.pulses) {
        const dist = distances(s, p.ox, p.oy);
        const color =
          p.tint === "cyan"
            ? "#8af7ed"
            : p.tint === "violet"
              ? "#b094ff"
              : "#ffa168";
        for (let y = 0; y < C.GRID_ROWS; y++)
          for (let x = 0; x < C.GRID_COLS; x++) {
            const d = dist[y][x];
            if (d > p.range || Math.abs(d - p.front) > 0.8) continue;
            const c = center(x, y);
            ctx.globalAlpha = 0.8 * (1 - Math.abs(d - p.front) / 1.1);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(c.x - 12, c.y - 12, 24, 24);
            glow(c.x, c.y, 20, `${color}38`);
            ctx.globalAlpha = 1;
          }
      }
      for (const p of s.predators) {
        if (p.state === "den") continue;
        if (p.lit) {
          if (p.alert)
            glow(
              p.x,
              p.y,
              45,
              p.kind === "gloamfin" ? "#ad83ff70" : "#ffad5b70",
            );
          const frame =
            p.kind === "lanternjaw" && p.state === "wander"
              ? 8 + sway
              : facing(p.dir) + (p.mind && p.travel ? swim : 0);
          sprite(p.kind, frame, p.x, p.y);
          if (p.alert)
            text(
              "!",
              p.x,
              p.y - 24,
              20,
              p.kind === "gloamfin" ? "#c3a9ff" : amber,
              "center",
            );
        }
        if (
          p.kind === "flarefish" &&
          (p.flareCharging || p.flaring || p.fade > 0)
        ) {
          const frame = p.flareCharging
            ? Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_CHARGE) * 3))
            : p.flaring
              ? 3 +
                Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_BLOOM) * 3))
              : p.fade > 0.2
                ? 6
                : 7;
          ctx.globalAlpha = p.flaring ? 0.5 : 0.7;
          sprite("flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
          ctx.globalAlpha = 1;
        }
      }
      glow(s.forager.x, s.forager.y, 40, "#63ffda50");
      sprite(
        "glimmerfin",
        facing(s.forager.dir) + (s.forager.moving ? swim : 0),
        s.forager.x,
        s.forager.y,
      );
      ctx.restore();
      line(64, 79, 1216, 79);
      line(64, 657, 1216, 657);
      text("F A T H O M", 64, 36, 18, cyan);
      text(C.DIVE_LABEL, 64, 60, 11, dim);
      text(String(s.score).padStart(6, "0"), 640, 58, 48, white, "center");
      text("PLANKTON", 1216, 31, 11, dim, "right");
      text(
        String(s.planktonRemaining).padStart(3, "0"),
        1216,
        59,
        23,
        cyan,
        "right",
      );
      text(`DEPTH ${s.depth}`, 64, 693, 17, white);
      for (let i = 0; i < s.lives; i++)
        sprite("glimmerfin", 6, 216 + i * 28, 687, 24);
      const gauge = (
        label: string,
        key: string,
        x: number,
        value: number,
        color: string,
      ) => {
        text(key, x, 686, 11, dim);
        text(label, x + 58, 686, 13, color);
        ctx.fillStyle = "#11252c";
        ctx.fillRect(x + 58, 696, 150, 3);
        ctx.fillStyle = color;
        ctx.fillRect(x + 58, 696, 150 * Math.max(0, Math.min(1, value)), 3);
      };
      gauge(
        "SONAR",
        "SPACE",
        465,
        1 - s.sonar.cooldown / C.SONAR_COOLDOWN,
        cyan,
      );
      gauge(
        "INK",
        "SHIFT",
        765,
        1 - s.ink.cooldown / C.INK_COOLDOWN,
        "#ac9fd4",
      );
      text(s.muted ? "M / MUTED" : "M / SOUND", 1216, 683, 10, dim, "right");
      text("ESC / PAUSE", 1216, 704, 10, dim, "right");
    };
    const menu = () =>
      menuItems(s.screen).forEach((item, i) => {
        const r = menuRect(s, i)!;
        const selected = s.menuIndex === i;
        ctx.fillStyle = selected ? "#0e3037" : "#07131c";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = selected ? "#62cfc0" : "#17333d";
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        if (selected) {
          ctx.fillStyle = cyan;
          ctx.fillRect(r.x, r.y, 3, r.h);
        }
        text(item, r.x + 25, r.y + 32, 18, selected ? white : dim);
        text(
          selected ? "→" : "·",
          r.x + r.w - 24,
          r.y + 32,
          20,
          selected ? cyan : dim,
          "right",
        );
      });
    if (["playing", "countdown", "paused", "cleared"].includes(s.screen))
      mazeView();
    if (s.screen === "title") {
      // A cartographic specimen: original tile art and concentric depth contours.
      ctx.save();
      ctx.beginPath();
      ctx.rect(615, 80, 601, 550);
      ctx.clip();
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 17; x < C.GRID_COLS; x++) {
          const c = center(x, y);
          if (Math.hypot(c.x - 951, c.y - 342) < 245) {
            ctx.globalAlpha = 0.15;
            const frame = s.tiles[y][x] === "#" ? 0 : 16;
            sprite("trench-walls", frame, c.x, c.y);
          }
        }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(946, 347, 92 + i * 39, 82 + i * 39, -0.25, 0, Math.PI * 2);
        ctx.strokeStyle = i === 2 ? "#265b63" : "#122a34";
        ctx.stroke();
      }
      glow(946, 347, 190, "#1ecab524");
      glow(946, 347, 65, "#53ffd22e");
      sprite("glimmerfin", 6, 946, 347, 96);
      mote(1068, 210);
      mote(778, 450);
      ctx.restore();
      line(140, 121, 1140, 121);
      text("01 / THE ABYSSAL ZONE", 140, 102, 12, dim);
      text("A BIOLUMINESCENT MAZE CHASE", 1140, 102, 12, dim, "right");
      text(C.TITLE_TEXT, 132, 287, 100, white);
      text(C.TAGLINE_TEXT.split("").join(" "), 140, 330, 17, cyan);
      text("Eat to see. Glow to be found.", 140, 378, 15, "#76979b");
      menu();
      text("WASD / ARROWS", 140, 597, 12, dim);
      text("MOVE", 300, 597, 12, "#96b6b7");
      text("SPACE", 140, 623, 12, dim);
      text("SONAR", 300, 623, 12, "#96b6b7");
      text("SHIFT", 140, 649, 12, dim);
      text("INK", 300, 649, 12, "#96b6b7");
      text("K I N D L E", 946, 616, 12, cyan, "center");
      text("Only your light knows the way.", 946, 642, 12, dim, "center");
    } else if (s.screen === "howto") {
      text("FIELD GUIDE / 01", 100, 84, 13, cyan);
      text("SURVIVE THE SIGNAL", 100, 137, 40, white);
      line(100, 162, 1180, 162);
      const entries = [
        [
          "glimmerfin",
          "YOUR LIGHT",
          "Graze every mote to clear the maze.",
          "Eating brightens your glow and widens your window.",
          "Old paths stay remembered, but vanish beyond the circle.",
        ],
        [
          "lanternjaw",
          "LANTERNJAW / LIGHT",
          "An amber light could be a meal. Or a mouth.",
          "It follows your glow. Break sight or hide your trail in ink.",
          "Its wandering disguise is identical to a harmless drifter.",
        ],
        [
          "gloamfin",
          "GLOAMFIN / SOUND",
          "Eyeless. Listening. Faster on the straightaways.",
          "Your sonar reveals it, but gives your position away.",
          "Take corners to shake it. Ink will not stop its hearing.",
        ],
        [
          "flarefish",
          "FLAREFISH / FLASH",
          "A warm glow is your warning: a flare is coming.",
          "Its flash sees through stone. Get clear, or release ink.",
          "It also hunts your light between flares.",
        ],
      ];
      entries.forEach(([sheet, title, ...lines], i) => {
        const y = 214 + i * 94;
        sprite(sheet, 0, 124, y + 9, 48);
        text(title, 170, y, 17, i === 0 ? cyan : i === 2 ? "#bc9df3" : amber);
        lines.forEach((l, j) =>
          text(l, 170, y + 24 + j * 17, 13, j === 0 ? white : "#729399"),
        );
      });
      line(100, 596, 1180, 596);
      text(
        "WASD / ARROWS  move    SPACE  sonar    SHIFT  ink",
        100,
        628,
        15,
        cyan,
      );
      text(
        "ESC / P  pause    M  mute    ENTER / ESC / CLICK  return",
        100,
        662,
        14,
        dim,
      );
    } else if (s.screen === "paused" || s.screen === "gameover") {
      ctx.fillStyle = "#03060cdb";
      ctx.fillRect(0, 80, C.STAGE_W, 576);
      text(
        s.screen === "paused" ? "SUSPENDED IN THE DEEP" : "THE DARK TAKES YOU",
        640,
        244,
        36,
        white,
        "center",
      );
      text(
        s.screen === "paused"
          ? "Take a breath. The trench can wait."
          : `SCORE ${s.score}  /  DEPTH ${s.depth}`,
        640,
        289,
        16,
        cyan,
        "center",
      );
      menu();
      if (s.screen === "gameover")
        text(C.TITLE_TEXT, 640, 120, 17, dim, "center");
    } else if (s.screen === "countdown" || s.screen === "cleared") {
      ctx.fillStyle = "#03060cc9";
      ctx.fillRect(390, 273, 500, 140);
      text(
        s.screen === "countdown" ? "DIVE" : `DEPTH ${s.depth} CLEARED`,
        640,
        329,
        36,
        white,
        "center",
      );
      text(
        s.screen === "countdown"
          ? `${Math.max(1, Math.ceil(2 - s.screenTime))}  /  INTO THE QUIET`
          : `+${C.SCORE_CLEAR}  /  DESCENDING`,
        640,
        373,
        15,
        cyan,
        "center",
      );
    }
  };
}
