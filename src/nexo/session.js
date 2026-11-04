import { validateFen } from "chess.js";
import { boardFromFen, RESERVE_TYPES } from "./rules.js";
export const SESSION_KEY = "nexo-session-v1";
const variants = ["comecome", "correlativo", "azar", "renacer"];
function validFen(fen, variant) {
  if (
    typeof fen !== "string" ||
    fen.length > 200 ||
    fen.split(" ").length !== 6
  )
    return false;
  const rows = fen.split(" ")[0].split("/");
  if (
    rows.length !== 8 ||
    rows.some(
      (r) =>
        !r ||
        !/^[prnbqkPRNBQK1-8]+$/.test(r) ||
        [...r].reduce(
          (sum, c) => sum + (/[1-8]/.test(c) ? Number(c) : 1),
          0,
        ) !== 8,
    )
  )
    return false;
  if (
    !["w", "b"].includes(fen.split(" ")[1]) ||
    boardFromFen(fen).length !== 64
  )
    return false;
  return variant === "comecome" || validateFen(fen).ok;
}
export function validSessionGame(g) {
  if (
    !g ||
    !variants.includes(g.variant) ||
    !validFen(g.fen, g.variant) ||
    !["w", "b"].includes(g.turn) ||
    g.turn !== g.fen.split(" ")[1]
  )
    return false;
  if (
    !Number.isInteger(g.turnIndex) ||
    g.turnIndex < 0 ||
    !Number.isInteger(g.remaining) ||
    g.remaining < 0 ||
    g.remaining > 6
  )
    return false;
  if (!Array.isArray(g.history) || !Array.isArray(g.positions)) return false;
  if (
    g.history.some(
      (h) =>
        !h ||
        typeof h.san !== "string" ||
        !validFen(h.fen, g.variant) ||
        !validFen(h.before, g.variant) ||
        !["w", "b"].includes(h.color) ||
        !Number.isInteger(h.turnIndex) ||
        typeof h.from !== "string" ||
        typeof h.to !== "string",
    )
  )
    return false;
  if (
    g.result &&
    (![null, "w", "b"].includes(g.result.winner) ||
      typeof g.result.reason !== "string")
  )
    return false;
  if (g.variant === "renacer") {
    const validReserve = (r) =>
      r &&
      ["w", "b"].every(
        (c) =>
          r[c] &&
          RESERVE_TYPES.every(
            (p) => Number.isInteger(r[c][p]) && r[c][p] >= 0 && r[c][p] <= 30,
          ) &&
          !r[c].k,
      );
    if (
      !validReserve(g.reserves) ||
      g.history.some(
        (h) =>
          !validReserve(h.reservesBefore) || !validReserve(h.reservesAfter),
      )
    )
      return false;
  }
  if (g.variant === "azar") {
    const d = g.dice;
    if (
      !d ||
      !["roll", "move", "remove"].includes(d.phase) ||
      !["w", "b"].includes(d.roller) ||
      !Array.isArray(g.rolls)
    )
      return false;
    if (
      d.phase === "roll"
        ? g.remaining !== 0
        : g.remaining < 1 ||
          !Number.isInteger(d.face) ||
          d.face < 1 ||
          d.face > 6 ||
          !Number.isInteger(d.total)
    )
      return false;
    if (
      g.rolls.some(
        (r) =>
          !r ||
          !Number.isInteger(r.face) ||
          r.face < 1 ||
          r.face > 6 ||
          !["w", "b"].includes(r.color),
      )
    )
      return false;
  }
  return true;
}
export function readSession(storage) {
  let raw = null;
  try {
    raw = storage.getItem(SESSION_KEY);
    if (!raw)
      return { session: null, raw: null, warning: "", recoveryRequired: false };
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object" || !validSessionGame(s.game))
      throw new Error("invalid-session");
    const names = {
      w: typeof s.names?.w === "string" ? s.names.w.slice(0, 40) : "Jugador 1",
      b: typeof s.names?.b === "string" ? s.names.b.slice(0, 40) : "Jugador 2",
    };
    const clocks = {
      w: Number.isFinite(s.clocks?.w) ? Math.max(0, s.clocks.w) : 0,
      b: Number.isFinite(s.clocks?.b) ? Math.max(0, s.clocks.b) : 0,
    };
    return {
      session: {
        ...s,
        names,
        clocks,
        theme: ["sage", "walnut", "ocean", "graphite"].includes(s.theme)
          ? s.theme
          : "sage",
        pieces: ["merida", "cburnett", "chessnut", "alpha"].includes(s.pieces)
          ? s.pieces
          : "merida",
        mode: s.mode === "local" ? "local" : "bot",
        human: s.human === "b" ? "b" : "w",
        level: [1, 2, 3, 4].includes(s.level) ? s.level : 2,
        time: [0, 5, 10, 15].includes(s.time) ? s.time : 0,
      },
      raw,
      warning: "",
      recoveryRequired: false,
    };
  } catch (e) {
    return {
      session: null,
      raw,
      warning: raw
        ? "No se puede cargar la partida guardada. Conservamos el registro original para que puedas descargarlo."
        : "El navegador no permite guardar la partida. Puedes jugar, pero descarga tu partida antes de cerrar.",
      recoveryRequired: !!raw,
    };
  }
}
export function browserSession() {
  try {
    return readSession(window.localStorage);
  } catch {
    return {
      session: null,
      raw: null,
      recoveryRequired: false,
      warning:
        "El almacenamiento está bloqueado. Puedes jugar sin guardado automático.",
    };
  }
}
export function writeSession(storage, session) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
