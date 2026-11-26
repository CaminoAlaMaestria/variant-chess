// Terrain-aware chess. A melted square is an impassable wall for rays/pawns;
// knights may jump it, but no piece can land on it. No classic-chess legality
// is used for this variant: classical attack maps do not know about the walls.
import {
  boardFromFen,
  toFen,
  index,
  square,
  other,
  freshReserves,
  reserveKey,
  initial,
  uci,
  RESERVE_TYPES,
} from "./rules.js";
const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG = [
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
export function freshVolcano(every = ERUPTION_EVERY) {
  return {
    melted: [],
    eruptions: 0,
    last: null,
    every: every === 5 ? 5 : 3,
    rulesVersion: VOLCANO_RULES_VERSION,
  };
}
// Rules version 2: max 10 lavas, max 2 per rank, FIFO recovery of the oldest.
// A save without rulesVersion was created before versioning existed: it is v1.
export const VOLCANO_RULES_VERSION = 2;
export const MAX_LAVA = 10;
export const MAX_LAVA_PER_RANK = 2;
export function volcanoVersion(v) {
  if (!v || v.rulesVersion === undefined) return 1;
  return v.rulesVersion === 1 || v.rulesVersion === 2 ? v.rulesVersion : null;
}
// Returns "" when the terrain respects its version, else a description.
export function volcanoProblem(v) {
  const version = volcanoVersion(v);
  if (version === null) return "Versión de reglas desconocida.";
  if (version === 1) return "";
  if (v.melted.length > MAX_LAVA) return "Hay más de 10 casillas con lava.";
  const per = {};
  for (const sq of v.melted) per[sq[1]] = (per[sq[1]] || 0) + 1;
  if (Object.values(per).some((n) => n > MAX_LAVA_PER_RANK))
    return "Una fila tiene más de 2 casillas con lava.";
  return "";
}
// Square that the next v2 eruption will recover (oldest lava), or null.
export function volcanoNextRecovery(v) {
  return volcanoVersion(v) === 2 && v.melted.length >= MAX_LAVA
    ? v.melted[0]
    : null;
}
// Expansion order of rows inside a half, from the centre to the edge.
const HALF_ORDER = { low: [4, 3, 2, 1], high: [5, 6, 7, 8] };
function candidatesV2(v) {
  const recovered = volcanoNextRecovery(v),
    melted = recovered ? v.melted.slice(1) : v.melted,
    holes = new Set(melted),
    per = {};
  for (const sq of melted) per[sq[1]] = (per[sq[1]] || 0) + 1;
  const rowSquares = (r) =>
    (per[r] || 0) >= MAX_LAVA_PER_RANK
      ? []
      : "abcdefgh"
          .split("")
          .map((f) => f + r)
          .filter((sq) => !holes.has(sq) && sq !== recovered);
  const phase = volcanoRanks(v.eruptions),
    first = v.eruptions % 2 === 0 ? "low" : "high",
    halves = [first, first === "low" ? "high" : "low"];
  for (const h of halves) {
    const order = HALF_ORDER[h],
      inPhase = order.filter((r) => phase.includes(r)).flatMap(rowSquares);
    if (inPhase.length) return inPhase;
    for (const r of order.filter((r) => !phase.includes(r))) {
      const row = rowSquares(r);
      if (row.length) return row;
    }
  }
  return [];
}
export function volcanoPhase(eruptions) {
  return Math.min(3, Math.floor(eruptions / 6));
}
// Lava erupts after every 3rd move (ply). turnIndex counts plies already played.
export const ERUPTION_EVERY = 3;
export const ERUPTION_OPTIONS = [3, 5];
// Lava warning is shown this many plies before the eruption.
export const WARNING_PLIES = 2;
const everyOf = (every) => (every === 5 ? 5 : ERUPTION_EVERY);
export function eruptsAfter(turnIndex, every) {
  return (turnIndex + 1) % everyOf(every) === 0;
}
export function movesUntilEruption(turnIndex, every) {
  return everyOf(every) - (turnIndex % everyOf(every));
}
// Eruptions alternate halves: even -> ranks 1-4, odd -> ranks 5-8.
export function volcanoHalf(eruptions) {
  return eruptions % 2 === 0 ? [1, 2, 3, 4] : [5, 6, 7, 8];
}
export function volcanoRanks(eruptions) {
  return [
    [4, 5],
    [3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7],
    [1, 2, 3, 4, 5, 6, 7, 8],
  ][volcanoPhase(eruptions)];
}
export function meltCandidates(state) {
  if (volcanoVersion(state.volcano) === 2) return candidatesV2(state.volcano);
  const rows = volcanoRanks(state.volcano.eruptions),
    half = volcanoHalf(state.volcano.eruptions),
    holes = new Set(state.volcano.melted),
    open = Array.from({ length: 64 }, (_, i) => square(i)).filter(
      (s) => rows.includes(Number(s[1])) && !holes.has(s),
    ),
    inHalf = open.filter((s) => half.includes(Number(s[1])));
  return inHalf.length ? inHalf : open;
}
function randomChoice(items) {
  if (!items.length) return null;
  const limit = Math.floor(4294967296 / items.length) * items.length,
    a = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return items[a[0] % items.length];
}
function holesOf(state) {
  return new Set(state.volcano.melted.map(index));
}
export function terrainAttacked(board, holes, target, by) {
  if (target < 0 || holes.has(target)) return false;
  const tr = Math.floor(target / 8),
    tc = target % 8;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== by || holes.has(i)) continue;
    const r = Math.floor(i / 8),
      c = i % 8,
      dr = tr - r,
      dc = tc - c;
    if (p.type === "p") {
      if (dr === (by === "w" ? -1 : 1) && Math.abs(dc) === 1) return true;
      continue;
    }
    if (p.type === "n") {
      if (Math.abs(dr) * Math.abs(dc) === 2) return true;
      continue;
    }
    if (p.type === "k") {
      if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true;
      continue;
    }
    const straight = (dr === 0 || dc === 0) && !(dr === 0 && dc === 0),
      diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0;
    if (!(
      (p.type === "q" && (straight || diagonal)) ||
      (p.type === "r" && straight) ||
      (p.type === "b" && diagonal)
    ))
      continue;
    let nr = r + Math.sign(dr),
      nc = c + Math.sign(dc),
      blocked = false;
    while (nr !== tr || nc !== tc) {
      const at = nr * 8 + nc;
      if (holes.has(at) || board[at]) {
        blocked = true;
        break;
      }
      nr += Math.sign(dr);
      nc += Math.sign(dc);
    }
    if (!blocked) return true;
  }
  return false;
}
export function volcanoInCheck(state, color = state.turn) {
  const b = boardFromFen(state.fen),
    king = b.findIndex((p) => p?.type === "k" && p.color === color);
  return king >= 0 && terrainAttacked(b, holesOf(state), king, other(color));
}
function stripRights(rights, chars) {
  for (const ch of chars) rights = rights.replace(ch, "");
  return rights.replace("-", "") || "-";
}
function rightsAt(rights, at) {
  return stripRights(rights, { a1: "Q", h1: "K", a8: "q", h8: "k" }[at] || "");
}
function rawMove(state, m) {
  const b = boardFromFen(state.fen),
    f = state.fen.split(" "),
    i = index(m.from),
    j = index(m.to);
  let rights = f[2];
  const old = b[i];
  let piece = old;
  if (m.kind === "swap") {
    piece = { type: m.piece, color: state.turn };
    if (old.type === "r") rights = rightsAt(rights, m.from);
  }
  if (piece.type === "k")
    rights = stripRights(rights, state.turn === "w" ? "KQ" : "kq");
  if (piece.type === "r") rights = rightsAt(rights, m.from);
  let taken = b[j],
    capturedAt = j;
  if (m.enPassant) {
    capturedAt = j + (state.turn === "w" ? 8 : -8);
    taken = b[capturedAt];
    b[capturedAt] = null;
  }
  if (taken?.type === "r") rights = rightsAt(rights, square(capturedAt));
  b[i] = null;
  b[j] = { ...piece, type: m.promotion || piece.type };
  if (m.castle) {
    const rookFrom =
        state.turn === "w"
          ? m.castle === "k"
            ? 63
            : 56
          : m.castle === "k"
            ? 7
            : 0,
      rookTo = m.castle === "k" ? j - 1 : j + 1;
    b[rookTo] = b[rookFrom];
    b[rookFrom] = null;
  }
  return {
    board: b,
    rights,
    taken,
    ep: m.double ? square((i + j) / 2) : "-",
    half:
      m.kind === "swap" || taken || piece.type === "p" ? 0 : Number(f[4]) + 1,
    full: Number(f[5]) + (state.turn === "b" ? 1 : 0),
  };
}
function pseudoMoves(state, board, holes, onlyFrom = null) {
  const ms = [],
    turn = state.turn,
    rights = state.fen.split(" ")[2],
    ep = state.fen.split(" ")[3];
  const add = (i, j, extra = {}) => {
    const p = board[i];
    if (holes.has(j) || board[j]?.color === turn || board[j]?.type === "k")
      return;
    const promote = p.type === "p" && (j < 8 || j > 55);
    for (const promotion of promote ? ["q", "r", "b", "n"] : [undefined])
      ms.push({
        from: square(i),
        to: square(j),
        piece: p.type,
        color: turn,
        captured: board[j]?.type,
        promotion,
        ...extra,
      });
  };
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (
      !p ||
      p.color !== turn ||
      holes.has(i) ||
      (onlyFrom !== null && i !== onlyFrom)
    )
      continue;
    const r = Math.floor(i / 8),
      c = i % 8;
    if (p.type === "p") {
      const d = turn === "w" ? -1 : 1,
        nr = r + d;
      if (nr < 0 || nr > 7) continue;
      const one = i + d * 8,
        two = i + d * 16;
      if (!holes.has(one) && !board[one]) {
        add(i, one);
        if (r === (turn === "w" ? 6 : 1) && !holes.has(two) && !board[two])
          add(i, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc < 0 || nc > 7) continue;
        const j = nr * 8 + nc;
        if (holes.has(j)) continue;
        if (board[j]?.color === other(turn)) add(i, j);
        else if (
          !board[j] &&
          square(j) === ep &&
          board[j - d * 8]?.type === "p" &&
          board[j - d * 8]?.color === other(turn)
        )
          add(i, j, { captured: "p", enPassant: true });
      }
      continue;
    }
    const dirs =
      p.type === "n"
        ? KNIGHT
        : p.type === "b"
          ? DIAG
          : p.type === "r"
            ? ORTHO
            : [...ORTHO, ...DIAG];
    for (const [dr, dc] of dirs) {
      let nr = r + dr,
        nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const j = nr * 8 + nc;
        if (holes.has(j)) break;
        if (board[j]?.color === turn) break;
        add(i, j);
        if (board[j] || p.type === "n" || p.type === "k") break;
        nr += dr;
        nc += dc;
      }
    }
    // Castling requires the complete king/rook corridor to remain solid.
    const home = turn === "w" ? 60 : 4;
    if (
      p.type === "k" &&
      i === home &&
      !terrainAttacked(board, holes, i, other(turn))
    ) {
      for (const side of ["k", "q"]) {
        const flag = turn === "w" ? side.toUpperCase() : side,
          rf = side === "k" ? home + 3 : home - 4,
          path =
            side === "k"
              ? [home + 1, home + 2]
              : [home - 1, home - 2, home - 3],
          kt = side === "k" ? home + 2 : home - 2;
        if (
          !rights.includes(flag) ||
          board[rf]?.type !== "r" ||
          board[rf]?.color !== turn ||
          holes.has(rf) ||
          path.some((j) => board[j] || holes.has(j))
        )
          continue;
        const transit = side === "k" ? home + 1 : home - 1,
          test = board.slice();
        test[home] = null;
        test[transit] = p;
        if (terrainAttacked(test, holes, transit, other(turn))) continue;
        add(i, kt, { castle: side });
      }
    }
  }
  return ms;
}
function safeAfter(state, m, holes) {
  const b = rawMove(state, m).board,
    k = b.findIndex((p) => p?.type === "k" && p.color === state.turn);
  return k >= 0 && !terrainAttacked(b, holes, k, other(state.turn));
}
function notation(m, all) {
  if (m.kind === "swap")
    return `${m.swapFrom.toUpperCase()}~${m.piece.toUpperCase()}@${m.from}${m.captured ? "x" : "-"}${m.to}${m.promotion ? "=" + m.promotion.toUpperCase() : ""}`;
  if (m.castle) return m.castle === "k" ? "O-O" : "O-O-O";
  let dis = "";
  const alternatives = all.filter(
    (x) => x.from !== m.from && x.piece === m.piece && x.to === m.to,
  );
  if (m.piece !== "p" && alternatives.length)
    dis = !alternatives.some((x) => x.from[0] === m.from[0])
      ? m.from[0]
      : !alternatives.some((x) => x.from[1] === m.from[1])
        ? m.from[1]
        : m.from;
  return (
    (m.piece === "p"
      ? m.captured
        ? m.from[0]
        : ""
      : m.piece.toUpperCase() + dis) +
    (m.captured ? "x" : "") +
    m.to +
    (m.promotion ? "=" + m.promotion.toUpperCase() : "")
  );
}
export function volcanoLegalMoves(state) {
  if (state.result) return [];
  const b = boardFromFen(state.fen),
    holes = holesOf(state);
  if (!b.some((p) => p?.type === "k" && p.color === state.turn)) return [];
  const normal = pseudoMoves(state, b, holes).filter((m) =>
    safeAfter(state, m, holes),
  );
  if (normal.length)
    return normal.map((m) => ({ ...m, san: notation(m, normal) }));
  // In check there is no emergency substitution: escape normally or it is mate.
  if (terrainAttacked(b, holes, b.findIndex((p) => p?.type === "k" && p.color === state.turn), other(state.turn)))
    return [];
  const swaps = [];
  for (let i = 0; i < 64; i++) {
    const old = b[i];
    if (!old || old.color !== state.turn || old.type === "k" || holes.has(i))
      continue;
    for (const piece of RESERVE_TYPES) {
      if (
        !(state.reserves?.[state.turn]?.[piece] > 0) ||
        piece === old.type ||
        (piece === "p" && (i < 8 || i > 55))
      )
        continue;
      const replaced = b.slice();
      replaced[i] = { type: piece, color: state.turn };
      for (const move of pseudoMoves(state, replaced, holes, i)) {
        const m = { ...move, kind: "swap", swapFrom: old.type };
        if (safeAfter(state, m, holes))
          swaps.push({ ...m, san: notation(m, []) });
      }
    }
  }
  return swaps;
}
export function volcanoPositionKey(state) {
  return (
    state.fen.split(" ").slice(0, 4).join(" ") +
    "|" +
    reserveKey(state.reserves) +
    "|holes=" +
    [...state.volcano.melted].sort().join(",") +
    "|phase=" +
    Math.min(12, state.volcano.eruptions)
  );
}
export function volcanoOutcome(state) {
  if (!boardFromFen(state.fen).some((p) => p?.type === "k" && p.color === "w"))
    return { winner: "b", reason: "El rey blanco se ha perdido en la lava." };
  if (!boardFromFen(state.fen).some((p) => p?.type === "k" && p.color === "b"))
    return { winner: "w", reason: "El rey negro se ha perdido en la lava." };
  if (!volcanoLegalMoves({ ...state, result: null }).length)
    return volcanoInCheck(state)
      ? {
          winner: other(state.turn),
          reason:
            "Jaque mate: no hay defensa, ni siquiera sustituyendo una pieza.",
        }
      : {
          winner: null,
          reason:
            "Tablas por bloqueo: no hay movimientos ni sustituciones que permitan jugar.",
        };
  return null;
}
// forcedMelt is a deterministic replay/test input, not a user-facing selector.
// fast=true is for the motor only: it never samples or reveals a future eruption.
export function applyVolcanoAction(
  state,
  input,
  fast = false,
  forcedMelt = undefined,
) {
  if (state.result) throw new Error("La partida ya ha terminado");
  const m =
    fast && typeof input !== "string"
      ? input
      : volcanoLegalMoves(state).find(
          (x) => uci(x) === (typeof input === "string" ? input : uci(input)),
        );
  if (!m) throw new Error("Movimiento o sustitución no legal en este terreno");
  const raw = rawMove(state, m),
    turn = other(state.turn),
    reserves = { w: { ...state.reserves.w }, b: { ...state.reserves.b } },
    volcano = {
      ...state.volcano,
      melted: [...state.volcano.melted],
      last: state.volcano.last,
    };
  if (m.kind === "swap") {
    reserves[state.turn][m.piece]--;
    reserves[state.turn][m.swapFrom]++;
  }
  if (raw.taken && raw.taken.type !== "k")
    reserves[raw.taken.color][raw.taken.type]++;
  let eruption = null,
    result = null;
  if (eruptsAfter(state.turnIndex, state.volcano.every)) {
    const candidates = meltCandidates(state),
      recovered = volcanoNextRecovery(state.volcano);
    // Recovery and new lava are one transition: the square returns empty.
    if (recovered) volcano.melted.shift();
    if (!fast) {
      if (
        forcedMelt !== undefined &&
        !(forcedMelt === null && !candidates.length) &&
        !candidates.includes(forcedMelt)
      )
        throw new Error("La casilla de erupción no pertenece a la fase activa");
      const at =
        forcedMelt === undefined ? randomChoice(candidates) : forcedMelt;
      if (at) {
        const i = index(at),
          victim = raw.board[i];
        eruption = {
          square: at,
          piece: victim ? { ...victim } : null,
          number: volcano.eruptions + 1,
          phase: volcanoPhase(volcano.eruptions),
          ...(recovered ? { recovered } : {}),
        };
        raw.board[i] = null;
        volcano.melted.push(at);
        raw.rights = rightsAt(raw.rights, at);
        if (victim) {
          raw.half = 0;
          if (victim.type === "k") {
            result = {
              winner: other(victim.color),
              reason: `El rey ${victim.color === "w" ? "blanco" : "negro"} cayó en la lava de ${at}.`,
            };
            raw.rights = stripRights(
              raw.rights,
              victim.color === "w" ? "KQ" : "kq",
            );
          } else reserves[victim.color][victim.type]++;
        }
      }
    }
    volcano.eruptions++;
    volcano.last = eruption;
  }
  if (raw.ep !== "-") {
    const epIndex = index(raw.ep),
      victimIndex = epIndex + (state.turn === "w" ? -8 : 8);
    if (
      volcano.melted.includes(raw.ep) ||
      !raw.board[victimIndex] ||
      raw.board[victimIndex].type !== "p"
    )
      raw.ep = "-";
  }
  const fen = toFen(raw.board, turn, raw.rights, raw.ep, raw.half, raw.full),
    next = {
      ...state,
      fen,
      turn,
      turnIndex: state.turnIndex + 1,
      remaining: 1,
      reserves,
      volcano,
      result,
    };
  const key = volcanoPositionKey(next);
  next.positions = fast ? [] : [...state.positions, key];
  if (!next.result) next.result = volcanoOutcome(next);
  if (!next.result && raw.half >= 100)
    next.result = {
      winner: null,
      reason: "Tablas por la regla de los 50 movimientos.",
    };
  if (
    !next.result &&
    !fast &&
    next.positions.filter((k) => k === key).length >= 3
  )
    next.result = {
      winner: null,
      reason:
        "Tablas por triple repetición, incluyendo terreno y piezas eliminadas.",
    };
  const check = volcanoInCheck(next),
    san =
      (m.san || notation(m, [])).replace(/[+#]$/, "") +
      (check
        ? next.result?.winner === state.turn &&
          next.result.reason.startsWith("Jaque mate")
          ? "#"
          : "+"
        : "");
  next.history = fast
    ? []
    : [
        ...state.history,
        {
          ...m,
          san,
          fen,
          before: state.fen,
          turnIndex: state.turnIndex,
          step: 1,
          budget: 1,
          remaining: 1,
          nextTurn: turn,
          nextTurnIndex: next.turnIndex,
          eruption,
          reservesBefore: {
            w: { ...state.reserves.w },
            b: { ...state.reserves.b },
          },
          reservesAfter: { w: { ...reserves.w }, b: { ...reserves.b } },
          volcanoBefore: {
            ...state.volcano,
            melted: [...state.volcano.melted],
          },
          volcanoAfter: { ...volcano, melted: [...volcano.melted] },
        },
      ];
  return next;
}
export function rewindVolcano(state, length) {
  let g = initial("volcan");
  g.volcano = freshVolcano(state.volcano?.every);
  if (volcanoVersion(state.volcano) === 1) delete g.volcano.rulesVersion;
  else g.volcano.rulesVersion = state.volcano.rulesVersion;
  for (const h of state.history.slice(0, length))
    g = applyVolcanoAction(g, h, false, h.eruption?.square ?? null);
  return g;
}
