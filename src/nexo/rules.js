import { Chess } from "chess.js";
import {
  freshVolcano,
  volcanoLegalMoves,
  volcanoInCheck,
  applyVolcanoAction,
  volcanoPositionKey,
} from "./volcano.js";
export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const other = (c) => (c === "w" ? "b" : "w");
export const square = (i) => "abcdefgh"[i % 8] + (8 - Math.floor(i / 8));
export const index = (s) => (8 - Number(s[1])) * 8 + "abcdefgh".indexOf(s[0]);
export const budget = (t) => (t < 6 ? t + 1 : 2 + ((t - 6) % 5));
export function boardFromFen(fen) {
  const a = [];
  for (const c of fen.split(" ")[0]) {
    if (c === "/") continue;
    if (/[1-8]/.test(c)) a.push(...Array(Number(c)).fill(null));
    else
      a.push({
        type: c.toLowerCase(),
        color: c === c.toUpperCase() ? "w" : "b",
      });
  }
  return a;
}
export function toFen(board, turn, rights = "-", ep = "-", half = 0, full = 1) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let s = "",
      n = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r * 8 + c];
      if (!p) n++;
      else {
        if (n) s += n;
        n = 0;
        s += p.color === "w" ? p.type.toUpperCase() : p.type;
      }
    }
    if (n) s += n;
    rows.push(s);
  }
  return `${rows.join("/")} ${turn} ${rights} ${ep} ${half} ${full}`;
}
export function initial(variant = "comecome") {
  const fen = variant === "comecome" ? START.replace("KQkq", "-") : START;
  return {
    variant,
    fen,
    turn: "w",
    turnIndex: 0,
    remaining: variant === "azar" ? 0 : 1,
    ...(variant === "azar" ? { dice: freshDice(), rolls: [] } : {}),
    ...(["renacer", "volcan"].includes(variant)
      ? { reserves: freshReserves() }
      : {}),
    ...(variant === "volcan" ? { volcano: freshVolcano() } : {}),
    history: [],
    result: null,
    positions: [
      fen.split(" ").slice(0, 4).join(" ") +
        (variant === "comecome"
          ? ""
          : variant === "volcan"
            ? "|" + reserveKey(freshReserves()) + "|holes=|phase=0"
            : variant === "renacer"
              ? "|" + reserveKey(freshReserves())
              : variant === "azar"
                ? "|roll|0|0|0"
                : "|0|1"),
    ],
  };
}
function antiMoves(state) {
  const b = boardFromFen(state.fen),
    moves = [],
    ep = state.fen.split(" ")[3];
  const add = (i, j, p, extra = {}) => {
    const promo = p.type === "p" && (j < 8 || j >= 56);
    for (const promotion of promo ? ["q", "r", "b", "n", "k"] : [undefined])
      moves.push({
        from: square(i),
        to: square(j),
        piece: p.type,
        color: p.color,
        captured: b[j]?.type,
        promotion,
        ...extra,
      });
  };
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.color !== state.turn) continue;
    const r = Math.floor(i / 8),
      c = i % 8;
    if (p.type === "p") {
      const d = p.color === "w" ? -1 : 1,
        n = i + d * 8;
      if (n >= 0 && n < 64 && !b[n]) {
        add(i, n, p);
        if (r === (p.color === "w" ? 6 : 1) && !b[i + d * 16])
          add(i, i + d * 16, p, { double: true });
      }
      for (const dc of [-1, 1]) {
        const nr = r + d,
          nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const j = nr * 8 + nc;
        if (b[j]?.color === other(p.color)) add(i, j, p);
        else if (
          square(j) === ep &&
          !b[j] &&
          b[j - d * 8]?.type === "p" &&
          b[j - d * 8]?.color === other(p.color)
        )
          add(i, j, p, { captured: "p", enPassant: true });
      }
    } else {
      const dirs =
        p.type === "n"
          ? [
              [-2, -1],
              [-2, 1],
              [-1, -2],
              [-1, 2],
              [1, -2],
              [1, 2],
              [2, -1],
              [2, 1],
            ]
          : p.type === "b"
            ? [
                [-1, -1],
                [-1, 1],
                [1, -1],
                [1, 1],
              ]
            : p.type === "r"
              ? [
                  [-1, 0],
                  [1, 0],
                  [0, -1],
                  [0, 1],
                ]
              : [
                  [-1, -1],
                  [-1, 0],
                  [-1, 1],
                  [0, -1],
                  [0, 1],
                  [1, -1],
                  [1, 0],
                  [1, 1],
                ];
      for (const [dr, dc] of dirs) {
        let nr = r + dr,
          nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const j = nr * 8 + nc;
          if (b[j]?.color === p.color) break;
          add(i, j, p);
          if (b[j] || p.type === "n" || p.type === "k") break;
          nr += dr;
          nc += dc;
        }
      }
    }
  }
  const captures = moves.filter((m) => m.captured);
  return captures.length ? captures : moves;
}
export function legalMoves(state) {
  if (state.result) return [];
  if (state.variant === "comecome") return antiMoves(state);
  if (state.variant === "azar") return diceLegalMoves(state);
  if (state.variant === "renacer") return renacerMoves(state);
  if (state.variant === "volcan") return volcanoLegalMoves(state);
  try {
    const chess = new Chess(state.fen);
    return chess
      .moves({ verbose: true })
      .filter((m) => state.remaining === 1 || !/[+#]/.test(m.san))
      .map((m) => ({
        from: m.from,
        to: m.to,
        piece: m.piece,
        color: m.color,
        captured: m.captured,
        promotion: m.promotion,
        san: m.san,
        flags: m.flags,
      }));
  } catch {
    return [];
  }
}
export function uci(m) {
  return m.kind === "swap"
    ? m.piece.toUpperCase() + "~" + m.from + m.to + (m.promotion || "")
    : m.kind === "drop"
      ? m.piece.toUpperCase() + "@" + m.to
      : m.kind === "remove"
        ? "@" + m.to
        : m.from + m.to + (m.promotion || "");
}
export function inCheck(state) {
  if (state.variant === "comecome") return false;
  if (state.variant === "volcan") return volcanoInCheck(state);
  try {
    return new Chess(state.fen).isCheck();
  } catch {
    return false;
  }
}
export function applyMove(state, input, fast = false) {
  if (state.variant === "volcan") return applyVolcanoAction(state, input, fast);
  if (state.variant === "azar") return applyDiceAction(state, input, fast);
  if (state.variant === "renacer")
    return applyRenacerAction(state, input, fast);
  const m =
    typeof input === "string"
      ? legalMoves(state).find((x) => uci(x) === input)
      : input;
  if (!m) throw new Error("Movimiento ilegal");
  const change = state.variant === "comecome" || state.remaining === 1,
    turn = change ? other(state.turn) : state.turn,
    turnIndex = change ? state.turnIndex + 1 : state.turnIndex;
  let remaining =
      state.variant === "comecome"
        ? 1
        : change
          ? budget(turnIndex)
          : state.remaining - 1,
    fen,
    san;
  if (state.variant === "comecome") {
    const b = boardFromFen(state.fen),
      i = index(m.from),
      j = index(m.to),
      p = b[i],
      f = state.fen.split(" ");
    b[i] = null;
    b[j] = { ...p, type: m.promotion || p.type };
    if (m.enPassant) b[j + (p.color === "w" ? 8 : -8)] = null;
    fen = toFen(
      b,
      turn,
      "-",
      m.double ? square((i + j) / 2) : "-",
      m.captured || p.type === "p" ? 0 : Number(f[4]) + 1,
      Number(f[5]) + (state.turn === "b" ? 1 : 0),
    );
    const alternatives = antiMoves(state).filter(
      (x) => x.from !== m.from && x.piece === p.type && x.to === m.to,
    );
    let disambiguation = "";
    if (p.type !== "p" && alternatives.length) {
      disambiguation = !alternatives.some((x) => x.from[0] === m.from[0])
        ? m.from[0]
        : !alternatives.some((x) => x.from[1] === m.from[1])
          ? m.from[1]
          : m.from;
    }
    san =
      (p.type === "p"
        ? m.captured
          ? m.from[0]
          : ""
        : p.type.toUpperCase() + disambiguation) +
      (m.captured ? "x" : "") +
      m.to +
      (m.promotion ? "=" + m.promotion.toUpperCase() : "");
  } else {
    const chess = new Chess(state.fen),
      made = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    san = made.san;
    const f = chess.fen().split(" ");
    f[1] = turn;
    if (!change) f[3] = "-";
    fen = f.join(" ");
  }
  let next = { ...state, fen, turn, turnIndex, remaining, result: null };
  const key =
    fen.split(" ").slice(0, 4).join(" ") +
    (state.variant === "comecome"
      ? ""
      : "|" +
        (turnIndex < 6 ? turnIndex : 6 + ((turnIndex - 6) % 10)) +
        "|" +
        remaining);
  next.positions = fast ? [] : [...state.positions, key];
  const board = boardFromFen(fen);
  if (state.variant === "comecome") {
    if (!board.some((p) => p?.color === "w"))
      next.result = {
        winner: "w",
        reason: "Las blancas se han quedado sin piezas.",
      };
    else if (!board.some((p) => p?.color === "b"))
      next.result = {
        winner: "b",
        reason: "Las negras se han quedado sin piezas.",
      };
  }
  if (!next.result) {
    const moves = legalMoves(next);
    if (!moves.length)
      next.result =
        state.variant === "correlativo" && inCheck(next)
          ? { winner: other(turn), reason: "Jaque mate." }
          : {
              winner: null,
              reason: "Tablas por bloqueo: no hay movimientos legales.",
            };
  }
  if (
    !next.result &&
    state.variant === "correlativo" &&
    new Chess(fen).isInsufficientMaterial()
  )
    next.result = { winner: null, reason: "Tablas por material insuficiente." };
  if (!next.result && Number(fen.split(" ")[4]) >= 100)
    next.result = {
      winner: null,
      reason: "Tablas por la regla de los 50 movimientos.",
    };
  if (
    !next.result &&
    !fast &&
    next.positions.filter((x) => x === key).length >= 3
  )
    next.result = { winner: null, reason: "Tablas por triple repetición." };
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
          step:
            state.variant === "comecome"
              ? 1
              : budget(state.turnIndex) - state.remaining + 1,
          budget: state.variant === "comecome" ? 1 : budget(state.turnIndex),
          remaining: next.remaining,
          nextTurn: next.turn,
          nextTurnIndex: next.turnIndex,
        },
      ];
  return next;
}
export const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
export function material(fen) {
  const v = { w: 0, b: 0 };
  boardFromFen(fen).forEach((p) => {
    if (p) v[p.color] += values[p.type];
  });
  return v;
}
export function pgn(state, names = { w: "Blancas", b: "Negras" }) {
  const result = state.result
    ? state.result.winner === "w"
      ? "1-0"
      : state.result.winner === "b"
        ? "0-1"
        : "1/2-1/2"
    : "*";
  const name =
    state.variant === "comecome"
      ? "Come-come"
      : state.variant === "volcan"
        ? "El suelo es lava"
        : state.variant === "renacer"
          ? "Renacer"
          : state.variant === "azar"
            ? "Azar"
            : "Correlativo mejorado";
  const tags = {
    Event: "Evolution Chess · " + name,
    Site: "Local",
    Date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
    White: names.w,
    Black: names.b,
    Result: result,
    Variant: state.variant === "comecome" ? "Antichess" : name,
    VariantName: name,
    PlyCount: String(state.history.length),
  };
  let txt =
    Object.entries(tags)
      .map(([k, v]) => `[${k} "${String(v).replace(/["\\]/g, "")}"]`)
      .join("\n") + "\n\n";
  txt +=
    "{ " +
    (state.variant === "comecome"
      ? "Captura obligatoria. Rey no real. Sin enroque. Bloqueo = tablas."
      : state.variant === "volcan"
        ? "PGN extendido El suelo es lava: erupción cada 3 movimientos, alternando mitad baja (filas 1-4) y alta (5-8). Erupciones 1-6 filas 4-5; 7-12 filas 3-6; 13-18 filas 2-7; desde la 19 todo el tablero. Casillas derretidas bloquean el paso, salvo saltos de caballo. Rey en lava pierde. Sin movimientos: sustitución y movimiento obligatorio de la nueva pieza; si tampoco se puede, mate en jaque o tablas sin jaque. Terreno, erupciones y reservas exactas en JSON."
        : state.variant === "renacer"
          ? "PGN extendido Renacer: capturas a la reserva del propietario. Colocar consume el turno, en casilla vacía, sin jaque. Peones: blancas filas 2-6; negras 3-7. Promociones conservadas. Piezas colocadas no restituyen enroque. Usar JSON para conservar reservas exactas."
          : state.variant === "azar"
            ? "PGN extendido Azar. Dado 1: una jugada; 2: dos; 3: una cada uno y tira el rival; 4: alfil o caballo; 5: permitir un jaque rival legal, sin dejar el rey en jaque; 6: retirar una pieza rival excepto el rey. Las extracciones son comentarios con FEN; para reproducción exacta usar JSON."
            : "Turnos 1,2,3,4,5,6; después ciclo 2,3,4,5,6. Jaque solo en el último movimiento. Salir del jaque inmediatamente. Notación extendida: agrupada por turnos, no por pares de jugadas.") +
    " }\n";
  let prev = -1;
  for (const h of state.history) {
    if (h.turnIndex !== prev) {
      txt += `\n${Math.floor(h.turnIndex / 2) + 1}${h.color === "w" ? "." : "..."} `;
      prev = h.turnIndex;
    }
    if (state.variant === "azar")
      txt += `{ Dado ${h.diceFace}${h.diceReply ? "; respuesta sin tirada" : ""}; ${h.step}/${h.budget}${h.fallback ? "; " + h.fallback : ""} } `;
    txt +=
      h.kind === "remove"
        ? `{ Retira ${h.captured.toUpperCase()} en ${h.to}. FEN: ${h.fen} } `
        : h.san + " ";
    if (state.variant === "correlativo") txt += `{ ${h.step}/${h.budget} } `;
    if (state.variant === "volcan") {
      if (h.kind === "swap")
        txt += `{ Sustitución ${h.swapFrom.toUpperCase()} por ${h.piece.toUpperCase()} en ${h.from}; movimiento incluido } `;
      if (h.eruption)
        txt += `{ Erupción ${h.eruption.number}: ${h.eruption.square}${h.eruption.piece ? "; pierde " + h.eruption.piece.color + h.eruption.piece.type.toUpperCase() : ""}; casilla bloqueada } `;
      if (h.eruption || h.captured || h.kind === "swap")
        txt += `{ Eliminadas B/N p,n,b,r,q: ${reserveKey(h.reservesAfter)}; terreno: ${h.volcanoAfter.melted.join(",")} } `;
    }
    if (state.variant === "renacer" && (h.captured || h.kind === "drop"))
      txt += `{ Reserva B/N p,n,b,r,q: ${reserveKey(h.reservesAfter)} } `;
  }
  return txt + "\n" + result + "\n";
}

// AZAR: a die assigns actions; the king always remains royal and safe.
export const DICE_EFFECTS = {
  1: {
    title: "Una jugada",
    text: "Realiza un movimiento legal. Después tira el rival.",
  },
  2: {
    title: "Doble movimiento",
    text: "Juega dos veces. Solo puedes dar jaque en la segunda.",
  },
  3: {
    title: "Turno compartido",
    text: "Juegas una vez; el rival responde una vez y después tira el dado.",
  },
  4: {
    title: "Piezas menores",
    text: "Debes mover un alfil o un caballo, si existe una jugada legal.",
  },
  5: {
    title: "Rey vulnerable",
    text: "Sin dejar tu rey en jaque, permite que el rival pueda darte jaque en su próxima jugada. No está obligado a hacerlo.",
  },
  6: {
    title: "Extracción",
    text: "Elige y retira una pieza rival, excepto el rey. Después tira el rival.",
  },
};
export function freshDice(turn = "w") {
  return {
    phase: "roll",
    face: null,
    roller: turn,
    reply: false,
    total: 0,
    fallback: "",
  };
}
function normalMoves(fen) {
  return new Chess(fen).moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    piece: m.piece,
    color: m.color,
    captured: m.captured,
    promotion: m.promotion,
    san: m.san,
    flags: m.flags,
  }));
}
export function allowsReplyCheck(fen, move) {
  const chess = new Chess(fen);
  chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  return chess.moves({ verbose: true }).some((m) => /[+#]/.test(m.san));
}
function removalFen(state, at, turn = other(state.turn)) {
  const b = boardFromFen(state.fen),
    f = state.fen.split(" ");
  b[index(at)] = null;
  const castle = { a1: "Q", h1: "K", a8: "q", h8: "k" };
  const rights = f[2].replace(castle[at] || "!", "") || "-";
  return toFen(
    b,
    turn,
    rights,
    "-",
    0,
    Number(f[5]) + (state.turn === "b" ? 1 : 0),
  );
}
export function diceLegalMoves(state) {
  if (state.result || state.dice?.phase === "roll") return [];
  const d = state.dice;
  if (d.phase === "remove") {
    return boardFromFen(state.fen).flatMap((p, i) => {
      if (!p || p.color === state.turn || p.type === "k") return [];
      const at = square(i);
      if (new Chess(removalFen(state, at, state.turn)).isCheck()) return [];
      return [
        {
          kind: "remove",
          from: at,
          to: at,
          color: state.turn,
          captured: p.type,
          piece: "",
          san: "×" + at,
        },
      ];
    });
  }
  let ms = normalMoves(state.fen);
  if (state.remaining > 1 || d.reply)
    ms = ms.filter((m) => !/[+#]/.test(m.san));
  if (d.fallback) return ms;
  if (d.face === 4) return ms.filter((m) => m.piece === "b" || m.piece === "n");
  if (d.face === 5) return ms.filter((m) => allowsReplyCheck(state.fen, m));
  return ms;
}
export function rollDice(state, face) {
  if (
    state.variant !== "azar" ||
    state.result ||
    state.dice?.phase !== "roll" ||
    !Number.isInteger(face) ||
    face < 1 ||
    face > 6
  )
    throw new Error("Tirada no válida");
  let next = {
    ...state,
    remaining: face === 2 ? 2 : 1,
    dice: {
      phase: face === 6 ? "remove" : "move",
      face,
      roller: state.turn,
      reply: false,
      total: face === 2 ? 2 : 1,
      fallback: "",
    },
    rolls: [
      ...(state.rolls || []),
      {
        face,
        color: state.turn,
        turnIndex: state.turnIndex,
        at: state.history.length,
      },
    ],
  };
  if (!diceLegalMoves(next).length && normalMoves(state.fen).length) {
    const message =
      face === 4
        ? "No hay alfil ni caballo con jugada legal."
        : face === 5
          ? "Ninguna jugada legal permite un jaque rival inmediato."
          : face === 6
            ? "No se puede retirar una pieza sin infringir la seguridad del rey."
            : "No hay una primera jugada legal sin jaque.";
    next = {
      ...next,
      remaining: 1,
      dice: {
        ...next.dice,
        phase: "move",
        total: 1,
        fallback: message + " Juega una vez con normalidad.",
      },
    };
  }
  return next;
}
export function applyDiceAction(state, input, fast = false) {
  const m =
    fast && typeof input !== "string"
      ? input
      : diceLegalMoves(state).find(
          (x) => uci(x) === (typeof input === "string" ? input : uci(input)),
        );
  if (!m) throw new Error("Acción de dado no válida");
  const d = state.dice;
  let turn,
    remaining,
    dice,
    turnIndex = state.turnIndex,
    fen,
    san;
  if (m.kind === "remove") {
    turn = other(state.turn);
    remaining = 0;
    dice = freshDice(turn);
    turnIndex++;
    fen = removalFen(state, m.to, turn);
    san = "×" + m.to;
  } else {
    const chess = new Chess(state.fen);
    san = chess.move({ from: m.from, to: m.to, promotion: m.promotion }).san;
    if (state.remaining > 1) {
      turn = state.turn;
      remaining = state.remaining - 1;
      dice = { ...d };
    } else if (d.face === 3 && !d.reply) {
      turn = other(state.turn);
      remaining = 1;
      turnIndex++;
      dice = { ...d, phase: "move", reply: true, total: 1 };
    } else if (d.reply) {
      turn = state.turn;
      remaining = 0;
      turnIndex++;
      dice = freshDice(turn);
    } else {
      turn = other(state.turn);
      remaining = 0;
      turnIndex++;
      dice = freshDice(turn);
    }
    const f = chess.fen().split(" ");
    f[1] = turn;
    if (turn === state.turn) f[3] = "-";
    fen = f.join(" ");
  }
  let next = { ...state, fen, turn, turnIndex, remaining, dice, result: null };
  const key =
    fen.split(" ").slice(0, 4).join(" ") +
    "|" +
    dice.phase +
    "|" +
    (dice.face || 0) +
    "|" +
    remaining +
    "|" +
    Number(dice.reply);
  next.positions = fast ? [] : [...state.positions, key];
  const chess = new Chess(fen);
  if (chess.isCheckmate())
    next.result = { winner: other(turn), reason: "Jaque mate." };
  else if (chess.isStalemate())
    next.result = { winner: null, reason: "Tablas por ahogado." };
  else if (chess.isInsufficientMaterial())
    next.result = { winner: null, reason: "Tablas por material insuficiente." };
  else if (dice.phase !== "roll" && !diceLegalMoves(next).length)
    next.result = {
      winner: null,
      reason:
        "Tablas por bloqueo: no existe una acción legal para completar la secuencia.",
    };
  else if (Number(fen.split(" ")[4]) >= 100)
    next.result = {
      winner: null,
      reason: "Tablas por la regla de los 50 movimientos.",
    };
  else if (!fast && next.positions.filter((x) => x === key).length >= 3)
    next.result = { winner: null, reason: "Tablas por triple repetición." };
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
          step: d.total - state.remaining + 1,
          budget: d.total,
          remaining,
          nextTurn: turn,
          nextTurnIndex: turnIndex,
          diceFace: d.face,
          diceReply: d.reply,
          roller: d.roller,
          fallback: d.fallback,
          nextDice: dice,
        },
      ];
  return next;
}
export function rewindDice(state, length) {
  let s = initial("azar");
  for (const h of state.history.slice(0, length)) {
    if (s.dice.phase === "roll") s = rollDice(s, h.diceFace);
    s = applyDiceAction(s, h);
  }
  // Undo restores the same die, never awards a free reroll.
  if (s.dice.phase === "roll" && state.history[length])
    s = rollDice(s, state.history[length].diceFace);
  return s;
}

// RENACER: a captured piece returns to its owner's reserve, not its capturer's.
export const RESERVE_TYPES = ["p", "n", "b", "r", "q"];
export function freshReserves() {
  return {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
}
export function reserveCount(reserves, color) {
  return RESERVE_TYPES.reduce((n, p) => n + (reserves?.[color]?.[p] || 0), 0);
}
export function reserveKey(reserves) {
  return ["w", "b"]
    .map((c) => RESERVE_TYPES.map((p) => reserves?.[c]?.[p] || 0).join(","))
    .join("/");
}
export function renacerMoves(state) {
  if (state.result) return [];
  const chess = new Chess(state.fen),
    board = boardFromFen(state.fen),
    turn = state.turn;
  const moves = normalMoves(state.fen);
  if (!reserveCount(state.reserves, turn)) return moves;
  const ownKing = square(
    board.findIndex((p) => p?.type === "k" && p.color === turn),
  );
  const enemyKing = square(
    board.findIndex((p) => p?.type === "k" && p.color === other(turn)),
  );
  for (const piece of RESERVE_TYPES) {
    if (!(state.reserves?.[turn]?.[piece] > 0)) continue;
    for (let i = 0; i < 64; i++) {
      if (board[i]) continue;
      const to = square(i),
        rank = Number(to[1]);
      if (
        piece === "p" &&
        (turn === "w" ? [1, 7, 8] : [8, 2, 1]).includes(rank)
      )
        continue;
      chess.put({ type: piece, color: turn }, to);
      // A deployment may block an existing check but may never give check.
      const safe =
        !chess.isAttacked(ownKing, other(turn)) &&
        !chess.isAttacked(enemyKing, turn);
      chess.remove(to);
      if (safe)
        moves.push({
          kind: "drop",
          from: "@" + piece,
          to,
          piece,
          color: turn,
          san: piece.toUpperCase() + "@" + to,
        });
    }
  }
  return moves;
}
function renacerInsufficient(fen, reserves) {
  const remaining = boardFromFen(fen)
    .filter((p) => p && p.type !== "k")
    .map((p) => p.type);
  for (const color of ["w", "b"])
    for (const piece of RESERVE_TYPES)
      for (let n = 0; n < (reserves[color][piece] || 0); n++)
        remaining.push(piece);
  // Same-colour bishops are not necessarily dead here: they can return on
  // different-colour squares. Use only the provable bare-king/single-minor cases.
  return (
    remaining.length === 0 ||
    (remaining.length === 1 && ["b", "n"].includes(remaining[0]))
  );
}
export function applyRenacerAction(state, input, fast = false) {
  if (state.result) throw new Error("La partida ya ha terminado");
  const m =
    fast && typeof input !== "string"
      ? input
      : renacerMoves(state).find(
          (x) => uci(x) === (typeof input === "string" ? input : uci(input)),
        );
  if (!m) throw new Error("Movimiento o colocación no permitido");
  const reserves = { w: { ...state.reserves.w }, b: { ...state.reserves.b } },
    turn = other(state.turn);
  let fen, san;
  if (m.kind === "drop") {
    const board = boardFromFen(state.fen),
      f = state.fen.split(" ");
    board[index(m.to)] = { type: m.piece, color: state.turn };
    reserves[state.turn][m.piece]--;
    fen = toFen(
      board,
      turn,
      f[2],
      "-",
      m.piece === "p" ? 0 : Number(f[4]) + 1,
      Number(f[5]) + (state.turn === "b" ? 1 : 0),
    );
    san = m.piece.toUpperCase() + "@" + m.to;
  } else {
    const chess = new Chess(state.fen),
      made = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    fen = chess.fen();
    san = made.san;
    if (made.captured) reserves[turn][made.captured]++;
  }
  const key = fen.split(" ").slice(0, 4).join(" ") + "|" + reserveKey(reserves);
  const next = {
    ...state,
    fen,
    turn,
    turnIndex: state.turnIndex + 1,
    remaining: 1,
    reserves,
    result: null,
    positions: fast ? [] : [...state.positions, key],
  };
  const legal = renacerMoves(next),
    check = new Chess(fen).isCheck();
  if (!legal.length)
    next.result = check
      ? {
          winner: state.turn,
          reason: "Jaque mate: tampoco hay una defensa desde la reserva.",
        }
      : {
          winner: null,
          reason:
            "Tablas por ahogado: sin movimientos ni colocaciones legales.",
        };
  else if (renacerInsufficient(fen, reserves))
    next.result = {
      winner: null,
      reason: "Tablas por material insuficiente, contando las reservas.",
    };
  else if (Number(fen.split(" ")[4]) >= 100)
    next.result = {
      winner: null,
      reason: "Tablas por la regla de los 50 movimientos.",
    };
  else if (!fast && next.positions.filter((x) => x === key).length >= 3)
    next.result = {
      winner: null,
      reason: "Tablas por triple repetición, incluidas las reservas.",
    };
  if (m.kind !== "drop" && check)
    san =
      san.replace(/[+#]$/, "") +
      (next.result?.winner === state.turn ? "#" : "+");
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
          reservesBefore: {
            w: { ...state.reserves.w },
            b: { ...state.reserves.b },
          },
          reservesAfter: { w: { ...reserves.w }, b: { ...reserves.b } },
        },
      ];
  return next;
}
