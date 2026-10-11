import * as C from "./constants";
import type { ReadState, Rect, Screen } from "./game";
export function menuItems(screen: Screen): readonly string[] {
  return screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSE_ITEMS
      : screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= menuItems(s.screen).length
  )
    return null;
  return {
    x: s.screen === "title" ? 140 : 460,
    y: (s.screen === "title" ? 420 : 360) + index * 62,
    w: 360,
    h: 50,
  };
}
