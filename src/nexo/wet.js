// Suelo mojado: deterministic slide-aware chess, including its attack map.
// A capture stops motion. Friendly obstacles/edges stop on the last free cell.
import {
  boardFromFen,
  toFen,
  index,
  square,
  other,
  initial,
  uci,
} from "./rules.js";
import { Chess } from "chess.js";
import { terrainAttacked } from "./volcano.js";
const ORTHO = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  DIAG = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const EMPTY = new Set();
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const advance = (i, dr, dc) => {
  const r = Math.floor(i / 8) + dr,
    c = (i % 8) + dc;
  return inside(r, c) ? r * 8 + c : null;
};
const longAxis = ([dr, dc]) =>
  Math.abs(dr) === 2 ? [Math.sign(dr), 0] : [0, Math.sign(dc)];
export const freshWet = () => ({ ep: null });
export function wetAttacked(board, target, by) {
  // Classical attacks remain: capturing at the first step stops the slide.
  if (terrainAttacked(board, EMPTY, target, by)) return true;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== by) continue;
    if (p.type === "n")
      for (const d of KNIGHT) {
        const land = advance(i, ...d);
        if (land === null || board[land]) continue;
        if (advance(land, ...longAxis(d)) === target) return true;
      }
    if (p.type === "k")
      for (const d of [...ORTHO, ...DIAG]) {
        const land = advance(i, ...d);
        if (land !== null && !board[land] && advance(land, ...d) === target)
          return true;
      }
  }
  return false;
}
export function wetInCheck(s, color = s.turn) {
  const b = boardFromFen(s.fen),
    k = b.findIndex((p) => p?.type === "k" && p.color === color);
  return k >= 0 && wetAttacked(b, k, other(color));
}
function strip(rights, chars) {
  for (const c of chars) rights = rights.replace(c, "");
  return rights.replace("-", "") || "-";
}
const rookRights = (rights, at) =>
  strip(rights, { a1: "Q", h1: "K", a8: "q", h8: "k" }[at] || "");
function raw(s, m) {
  const b = boardFromFen(s.fen),
    f = s.fen.split(" "),
    i = index(m.from),
    j = index(m.to),
    p = b[i];
  let rights = f[2];
  if (p.type === "k") rights = strip(rights, p.color === "w" ? "KQ" : "kq");
  if (p.type === "r") rights = rookRights(rights, m.from);
  if (b[j]?.type === "r") rights = rookRights(rights, m.to);
  b[i] = null;
  if (m.enPassant) b[index(m.captureSquare)] = null;
  if (m.castle) {
    b[index(m.rookFrom)] = null;
    b[index(m.rookTo)] = { type: "r", color: p.color };
  }
  b[j] = { ...p, type: m.promotion || p.type };
  const distance = Math.abs(Math.floor(i / 8) - Math.floor(j / 8));
  let ep = null;
  if (
    p.type === "p" &&
    !m.captured &&
    Math.floor(i / 8) === (p.color === "w" ? 6 : 1) &&
    distance >= 2
  ) {
    ep = {
      target: square(j + (p.color === "w" ? 8 : -8)),
      pawn: m.to,
      color: p.color,
    };
  }
  // A three-square move needs metadata; its EP target isn't a classical FEN rank.
  const fenEp = ep && /[36]$/.test(ep.target) ? ep.target : "-";
  const wet = { ep };
  return {
    board: b,
    wet,
    fen: toFen(
      b,
      other(s.turn),
      rights,
      fenEp,
      p.type === "p" || m.captured ? 0 : Number(f[4]) + 1,
      Number(f[5]) + (s.turn === "b" ? 1 : 0),
    ),
  };
}
function notation(m) {
  if (m.castle)
    return (m.castle === "k" ? "O-O" : "O-O-O") + "~K" + m.to + "/R" + m.rookTo;
  return (
    (m.piece === "p" ? "" : m.piece.toUpperCase()) +
    m.from +
    (m.captured && m.to === m.via ? "x" : "-") +
    m.via +
    (m.to !== m.via ? "~" + (m.captured ? "x" : "") + m.to : "") +
    (m.promotion ? "=" + m.promotion.toUpperCase() : "") +
    (m.enPassant ? " e.p." : "")
  );
}
function pseudo(s) {
  const b = boardFromFen(s.fen),
    turn = s.turn,
    ms = [];
  function add(i, via, j, trail, stop, extra = {}) {
    if (j === i || b[j]?.color === turn || b[j]?.type === "k") return;
    const p = b[i];
    for (const promotion of p.type === "p" && (j < 8 || j >= 56)
      ? ["q", "r", "b", "n"]
      : [undefined]) {
      ms.push({
        from: square(i),
        to: square(j),
        via: square(via),
        piece: p.type,
        color: turn,
        captured: b[j]?.type,
        promotion,
        trail: trail.map(square),
        slid: via !== j,
        stop,
        ...extra,
      });
    }
  }
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.color !== turn) continue;
    const r = Math.floor(i / 8);
    if (p.type === "p") {
      const d = turn === "w" ? -1 : 1;
      const first = advance(i, d, 0);
      if (first !== null && !b[first]) {
        const bases = [{ at: first, path: [i, first] }],
          two = advance(first, d, 0);
        if (r === (turn === "w" ? 6 : 1) && two !== null && !b[two])
          bases.push({ at: two, path: [i, first, two] });
        for (const { at, path } of bases) {
          if (at < 8 || at >= 56) {
            add(i, at, at, path, "promotion");
            continue;
          }
          const end = advance(at, d, 0);
          if (end === null || b[end])
            add(
              i,
              at,
              at,
              path,
              end === null
                ? "edge"
                : b[end].color === turn
                  ? "ally"
                  : "pawn-blocked",
            );
          else
            add(
              i,
              at,
              end,
              [...path, end],
              end < 8 || end >= 56 ? "promotion" : "extra",
            );
        }
      }
      for (const dc of [-1, 1]) {
        const j = advance(i, d, dc);
        if (j === null) continue;
        if (b[j]?.color === other(turn)) add(i, j, j, [i, j], "capture");
        else if (
          !b[j] &&
          s.wet?.ep?.target === square(j) &&
          s.wet.ep.color === other(turn)
        ) {
          const victim = index(s.wet.ep.pawn);
          if (
            Math.floor(victim / 8) === r &&
            Math.abs((victim % 8) - (i % 8)) === 1 &&
            b[victim]?.type === "p" &&
            b[victim].color === other(turn)
          )
            add(i, j, j, [i, j], "capture", {
              captured: "p",
              enPassant: true,
              captureSquare: square(victim),
            });
        }
      }
      continue;
    }
    if (p.type === "n" || p.type === "k") {
      for (const d of p.type === "n" ? KNIGHT : [...ORTHO, ...DIAG]) {
        const land = advance(i, ...d);
        if (land === null || b[land]?.color === turn) continue;
        if (b[land]) {
          add(i, land, land, [i, land], "capture");
          continue;
        }
        const end = advance(land, ...(p.type === "n" ? longAxis(d) : d));
        if (end === null || b[end]?.color === turn)
          add(i, land, land, [i, land], end === null ? "edge" : "ally");
        else add(i, land, end, [i, land, end], b[end] ? "capture" : "extra");
      }
      continue;
    }
    for (const d of p.type === "b"
      ? DIAG
      : p.type === "r"
        ? ORTHO
        : [...ORTHO, ...DIAG]) {
      const first = advance(i, ...d);
      if (first === null || b[first]?.color === turn) continue;
      let at = first,
        path = [i, first];
      while (true) {
        if (b[at]) {
          add(i, first, at, path, "capture");
          break;
        }
        const next = advance(at, ...d);
        if (next === null || b[next]?.color === turn) {
          add(i, first, at, path, next === null ? "edge" : "ally");
          break;
        }
        at = next;
        path.push(at);
      }
    }
  }
  // Castling moves BOTH pieces one extra square in their original directions.
  const home = turn === "w" ? 60 : 4,
    rights = s.fen.split(" ")[2];
  if (
    b[home]?.type === "k" &&
    b[home].color === turn &&
    !wetAttacked(b, home, other(turn))
  ) {
    for (const side of ["k", "q"]) {
      const right = turn === "w" ? side.toUpperCase() : side;
      const rook = home + (side === "k" ? 3 : -4),
        dest = home + (side === "k" ? 3 : -3);
      const corridor =
        side === "k" ? [home + 1, home + 2] : [home - 1, home - 2, home - 3];
      if (
        !rights.includes(right) ||
        b[rook]?.type !== "r" ||
        b[rook].color !== turn ||
        corridor.some((j) => b[j])
      )
        continue;
      ms.push({
        from: square(home),
        to: square(dest),
        via: square(home + (side === "k" ? 2 : -2)),
        piece: "k",
        color: turn,
        castle: side,
        rookFrom: square(rook),
        rookTo: square(home),
        trail: [
          home,
          ...(side === "k"
            ? [home + 1, home + 2, dest]
            : [home - 1, home - 2, dest]),
        ].map(square),
        slid: true,
        stop: "castle",
      });
    }
  }
  return ms;
}
export function wetLegalMoves(s) {
  if (s.result) return [];
  const b = boardFromFen(s.fen),
    seen = new Set(),
    ms = [];
  if (!b.some((p) => p?.type === "k" && p.color === s.turn)) return [];
  for (const m of pseudo(s)) {
    const key = uci(m);
    if (seen.has(key)) continue;
    if (m.piece === "k") {
      let safe = true;
      for (const at of m.trail.slice(1)) {
        const test = b.slice();
        test[index(m.from)] = null;
        if (m.castle) test[index(m.rookFrom)] = null;
        test[index(at)] = { type: "k", color: s.turn };
        if (wetAttacked(test, index(at), other(s.turn))) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;
    }
    const out = raw(s, m),
      k = out.board.findIndex((p) => p?.type === "k" && p.color === s.turn);
    if (k < 0 || wetAttacked(out.board, k, other(s.turn))) continue;
    seen.add(key);
    ms.push({ ...m, san: notation(m) });
  }
  return ms;
}
export function wetPositionKey(s) {
  return (
    s.fen.split(" ").slice(0, 3).join(" ") +
    "|ep=" +
    JSON.stringify(s.wet?.ep || null)
  );
}
export function wetOutcome(s) {
  const ms = wetLegalMoves({ ...s, result: null });
  if (!ms.length)
    return wetInCheck(s)
      ? {
          winner: other(s.turn),
          reason:
            "Jaque mate: no hay un movimiento con deslizamiento que salve al rey.",
        }
      : {
          winner: null,
          reason: "Tablas por ahogado: no hay movimientos legales.",
        };
  // The user's remaining rules are classical, including the material draw convention.
  if (new Chess(s.fen).isInsufficientMaterial())
    return {
      winner: null,
      reason: "Tablas por material insuficiente (criterio clásico).",
    };
  if (Number(s.fen.split(" ")[4]) >= 100)
    return {
      winner: null,
      reason: "Tablas por la regla de los 50 movimientos.",
    };
  const key = wetPositionKey(s);
  if (s.positions?.filter((k) => k === key).length >= 3)
    return { winner: null, reason: "Tablas por triple repetición." };
  return null;
}
export function applyWetAction(s, input, fast = false) {
  if (s.result) throw new Error("La partida ha terminado");
  const wanted = typeof input === "string" ? input : uci(input);
  const m = wetLegalMoves(s).find((m) => uci(m) === wanted);
  if (!m) throw new Error("Deslizamiento no legal");
  const out = raw(s, m),
    next = {
      ...s,
      fen: out.fen,
      wet: out.wet,
      turn: other(s.turn),
      turnIndex: s.turnIndex + 1,
      remaining: 1,
      result: null,
      history: [],
      positions: [],
    };
  next.positions = fast ? [] : [...s.positions, wetPositionKey(next)];
  next.result = wetOutcome(next);
  const san =
    m.san +
    (wetInCheck(next) ? (next.result?.winner === s.turn ? "#" : "+") : "");
  if (!fast)
    next.history = [
      ...s.history,
      {
        ...m,
        san,
        before: s.fen,
        fen: next.fen,
        turnIndex: s.turnIndex,
        step: 1,
        budget: 1,
        remaining: 1,
        nextTurn: next.turn,
        nextTurnIndex: next.turnIndex,
        wetBefore: structuredClone(s.wet),
        wetAfter: structuredClone(next.wet),
      },
    ];
  return next;
}
export function rewindWet(s, length) {
  let g = initial("mojado");
  for (const h of s.history.slice(0, length)) g = applyWetAction(g, h);
  return g;
}
