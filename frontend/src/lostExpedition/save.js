import { SAVE_KEY } from "./logic.js";

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.flags || !Array.isArray(data.inventory)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* a full browser store should not stop the game */
  }
}

export function clearGame() {
  localStorage.removeItem(SAVE_KEY);
}
