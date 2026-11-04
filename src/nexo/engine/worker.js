// Runs Fairy-Stockfish 14 (WebAssembly) in the browser. Same logic as the
// original server.js: one fresh engine run per request, same depth/time/skill.
import FairyStockfish from "./fairy-stockfish.js";
import {
  legalMoves,
  applyMove,
  material,
  uci,
  boardFromFen,
  other,
  values,
  RESERVE_TYPES,
} from "../rules.js";

const VARIANTS_INI =
  "[comecome:antichess]\nstalemateValue = draw\nstalematePieceCount = false\npromotionPieceTypes = nbrqk\n";

let wasmBinary = null;
async function getBinary() {
  if (!wasmBinary) {
    const r = await fetch("/wasm/fairy-stockfish.wasm");
    if (!r.ok) throw new Error("Motor no disponible");
    wasmBinary = await r.arrayBuffer();
  }
  return wasmBinary;
}

async function engine({ fen, variant, level = 2, moves, analysis = false }) {
  // Come-come: L1 depth 1, L2 depth 2 + low skill (beatable), L3 depth 5, L4 unchanged.
  const cc = variant === "comecome";
  const depth = analysis ? 10 : (cc ? [1, 2, 5, 14] : [3, 6, 10, 14])[level - 1] || 6,
    time = analysis ? 250 : (cc ? [50, 80, 400, 1000] : [100, 250, 600, 1000])[level - 1] || 250,
    skill = (cc ? [0, 1, 10, 20] : [0, 5, 12, 20])[level - 1] ?? 5;
  const cmds =
    `uci\nsetoption name VariantPath value /variants.ini\nsetoption name UCI_Variant value ${cc ? "comecome" : "chess"}\nsetoption name Threads value 1\nsetoption name Hash value 16\nsetoption name Skill Level value ${skill}\nisready\nposition fen ${fen}\ngo depth ${depth} movetime ${time}${moves?.length ? " searchmoves " + moves.join(" ") : ""}\n`;
  const input = new TextEncoder().encode(cmds);
  let i = 0,
    lastScore = null,
    pv = [],
    best = null;
  const M = await FairyStockfish({
    wasmBinary: await getBinary(),
    stdin: () => (i < input.length ? input[i++] : null),
    print: (line) => {
      const sc = line.match(/score (cp|mate) (-?\d+)/);
      if (sc) lastScore = { type: sc[1], value: Number(sc[2]) };
      if (line.includes(" pv ")) pv = line.split(" pv ")[1].trim().split(" ");
      if (line.startsWith("bestmove ")) best = line.split(" ")[1];
    },
    printErr: () => {},
  });
  M.FS.writeFile("/variants.ini", VARIANTS_INI);
  try {
    M.callMain([]);
  } catch (e) {
    if (!best && !(e && e.name === "ExitStatus")) throw new Error("Motor no disponible");
  }
  if (!best) throw new Error("Motor no disponible");
  return { move: best, score: lastScore, pv };
}

function evaluate(s, color) {
  if (s.result)
    return s.result.winner === color ? 100000 : s.result.winner === null ? 0 : -100000;
  const mat = material(s.fen);
  let v = mat[color] - mat[other(color)];
  if (s.variant === "renacer")
    for (const p of RESERVE_TYPES)
      v += 0.75 * values[p] * ((s.reserves[color][p] || 0) - (s.reserves[other(color)][p] || 0));
  const b = boardFromFen(s.fen);
  b.forEach((p, i) => {
    if (p && p.type !== "k") {
      const center = 3.5 - Math.abs(3.5 - (i % 8)) + 3.5 - Math.abs(3.5 - Math.floor(i / 8));
      v += (p.color === color ? 1 : -1) * center * 4;
    }
  });
  return v;
}

function adaptedMove(state, hint, level) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  let nodes = 0,
    deadline = Infinity;
  const maxNodes = [90, 250, 650, 6000][level - 1],
    maxDepth = [1, 2, 3, 6][level - 1];
  const color = state.turn;
  function search(s, d, a, b) {
    if (d === 0 || s.result || ++nodes > maxNodes || Date.now() >= deadline)
      return evaluate(s, color);
    const ms = legalMoves(s).sort((a, b) => Number(!!b.captured) - Number(!!a.captured));
    let best = s.turn === color ? -Infinity : Infinity;
    for (const m of ms) {
      const v = search(applyMove(s, m, true), d - 1, a, b);
      if (s.turn === color) {
        best = Math.max(best, v);
        a = Math.max(a, best);
      } else {
        best = Math.min(best, v);
        b = Math.min(b, best);
      }
      if (b <= a || nodes > maxNodes || Date.now() >= deadline) break;
    }
    return Number.isFinite(best) ? best : evaluate(s, color);
  }
  let best = -Infinity,
    choice = moves[0];
  for (const m of moves) {
    nodes = 0;
    deadline = Date.now() + (level === 4 ? Math.max(40, Math.floor(1500 / moves.length)) : [1, 12, 25][level - 1]);
    const next = applyMove(state, m, true);
    const val =
      search(next, maxDepth - 1, -Infinity, Infinity) +
      (uci(m) === hint ? 15 : 0) +
      (level === 1 ? Math.random() * 90 : 0);
    if (val > best) {
      best = val;
      choice = m;
    }
  }
  return uci(choice);
}

// Experimental own-reserve search. Standard Stockfish may suggest board moves,
// but all deployments and all reply legality are evaluated with Renacer rules.
function renacerChoice(state, hint, level, legal) {
  const color = state.turn;
  const ranked = legal
    .map((m) => {
      const next = applyMove(state, m, true);
      return {
        m,
        next,
        score:
          evaluate(next, color) +
          (uci(m) === hint ? 15 : 0) +
          (level === 1 ? Math.random() * 90 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
  if (ranked[0]?.next.result?.winner === color) return uci(ranked[0].m);
  if (level === 1) return uci(ranked[0].m);
  const deadline = Date.now() + [0, 350, 650, 1000][level - 1];
  let choice = ranked[0].m,
    best = -Infinity;
  for (const candidate of ranked.slice(0, [0, 5, 8, 10][level - 1])) {
    if (candidate.next.result) {
      if (candidate.score > best) {
        best = candidate.score;
        choice = candidate.m;
      }
      continue;
    }
    const replies = legalMoves(candidate.next)
      .sort(
        (a, b) =>
          (b.captured ? values[b.captured] + 1000 : 0) +
          (b.kind === "drop" ? values[b.piece] / 3 : 0) -
          ((a.captured ? values[a.captured] + 1000 : 0) +
            (a.kind === "drop" ? values[a.piece] / 3 : 0)),
      )
      .slice(0, [0, 16, 28, 40][level - 1]);
    let worst = Infinity;
    for (const reply of replies) {
      const next = applyMove(candidate.next, reply, true);
      worst = Math.min(worst, evaluate(next, color));
      if (Date.now() >= deadline) break;
    }
    const score = Number.isFinite(worst)
      ? 0.8 * worst + 0.2 * candidate.score
      : candidate.score;
    if (score > best) {
      best = score;
      choice = candidate.m;
    }
    if (Date.now() >= deadline) break;
  }
  return uci(choice);
}
async function move({ state, level = 2 }) {
  if (
    !state ||
    !["comecome", "correlativo", "azar", "renacer"].includes(state.variant) ||
    typeof state.fen !== "string" ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 4
  )
    throw new Error("Posición no válida");
  const legal = legalMoves(state),
    moves = legal.map(uci);
  if (!moves.length) return { move: null };
  if (state.variant === "azar" && state.dice?.phase === "remove") {
    let best = -Infinity,
      choice = legal[0];
    for (const m of legal) {
      const next = applyMove(state, m, true);
      let value;
      if (next.result) value = evaluate(next, state.turn);
      else {
        const sc = (await engine({ fen: next.fen, variant: "azar", level: Math.min(level, 2) }))
          .score;
        value = sc?.type === "mate" ? (sc.value > 0 ? -90000 : 90000) : -(sc?.value || 0);
      }
      value += level === 1 ? Math.random() * 240 : 0;
      if (value > best) {
        best = value;
        choice = m;
      }
    }
    return { move: uci(choice), engine: "Stockfish + adaptador de dados", experimental: true };
  }
  if (state.variant === "renacer") {
    const boardMoves = legal.filter((m) => m.kind !== "drop").map(uci);
    const out = boardMoves.length
      ? await engine({ fen: state.fen, variant: "renacer", level, moves: boardMoves })
      : { move: null };
    const mv = renacerChoice({ ...state, history: [], positions: [] }, out.move, level, legal);
    if (!moves.includes(mv)) throw new Error("El adaptador no devolvió una acción legal");
    return { move: mv, engine: "Stockfish + adaptador de reservas", experimental: true };
  }
  const out = await engine({ fen: state.fen, variant: state.variant, level, moves });
  const mv =
    state.variant !== "comecome"
      ? adaptedMove({ ...state, history: [], positions: [] }, out.move, level)
      : out.move;
  if (!moves.includes(mv)) throw new Error("El motor no devolvió un movimiento válido.");
  return {
    ...out,
    move: mv,
    engine:
      state.variant === "comecome"
        ? "Fairy-Stockfish 14"
        : state.variant === "azar"
          ? "Stockfish + adaptador de dados"
          : "Stockfish + adaptador correlativo",
    experimental: state.variant !== "comecome",
  };
}

self.onmessage = async ({ data }) => {
  const { id, type, payload } = data;
  try {
    let result;
    if (type === "move") result = await move(payload);
    else {
      const { fen, variant } = payload;
      if (typeof fen !== "string" || !["comecome", "correlativo", "azar", "renacer"].includes(variant))
        throw new Error("Posición no válida");
      result = await engine({ fen, variant, analysis: true });
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e?.message || "Motor no disponible" });
  }
};
