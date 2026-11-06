import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  initial,
  legalMoves,
  applyMove,
  uci,
  boardFromFen,
  index,
  freshReserves,
  reserveCount,
  inCheck,
  pgn,
} from "../rules.js";
import {
  freshVolcano,
  volcanoPhase,
  volcanoRanks,
  meltCandidates,
  applyVolcanoAction,
  volcanoOutcome,
  rewindVolcano,
  volcanoPositionKey,
} from "../volcano.js";
import { validSessionGame } from "../session.js";
function pos(
  fen,
  holes = [],
  white = {},
  black = {},
  eruptions = holes.length,
) {
  const reserves = freshReserves();
  Object.assign(reserves.w, white);
  Object.assign(reserves.b, black);
  return {
    ...initial("volcan"),
    fen,
    turn: fen.split(" ")[1],
    // next ply triggers an eruption (every 3rd move)
    turnIndex: fen.split(" ")[1] === "b" ? 5 : 2,
    reserves,
    volcano: { ...freshVolcano(), melted: holes, eruptions },
  };
}
test("Initial Volcán has twenty normal moves and no missing squares", () => {
  const s = initial("volcan");
  assert.equal(legalMoves(s).length, 20);
  assert.deepEqual(s.volcano.melted, []);
  assert.equal(s.positions[0], volcanoPositionKey(s));
  assert.ok(validSessionGame(s));
});
test("An eruption occurs after every third move, alternating halves", () => {
  let s = applyMove(initial("volcan"), "e2e4");
  s = applyMove(s, "e7e5");
  assert.equal(s.volcano.eruptions, 0);
  s = applyVolcanoAction(s, "g1f3", false, "a4");
  assert.equal(s.volcano.eruptions, 1);
  assert.deepEqual(s.volcano.melted, ["a4"]);
  assert.deepEqual(meltCandidates(s).map((x) => x[1]).sort()[0], "5");
  s = applyMove(s, "b8c6");
  s = applyMove(s, "f1c4");
  assert.equal(s.volcano.eruptions, 1);
  assert.throws(() => applyVolcanoAction(s, "g8f6", false, "b4"));
  s = applyVolcanoAction(s, "g8f6", false, "b5");
  assert.equal(s.volcano.eruptions, 2);
  assert.equal(s.history[2].eruption.square, "a4");
  assert.equal(s.history[3].eruption, null);
});
test("Phases change every six eruptions", () => {
  assert.deepEqual(
    [0, 5, 6, 11, 12, 17, 18, 40].map(volcanoPhase),
    [0, 0, 1, 1, 2, 2, 3, 3],
  );
  assert.deepEqual(volcanoRanks(0), [4, 5]);
  assert.deepEqual(volcanoRanks(6), [3, 4, 5, 6]);
  assert.deepEqual(volcanoRanks(12), [2, 3, 4, 5, 6, 7]);
  assert.equal(volcanoRanks(18).length, 8);
});
test("Melt candidates include occupied squares, exclude old holes and wrong ranks", () => {
  let s = applyMove(initial("volcan"), "e2e4");
  s = applyMove(s, "e7e5");
  assert.ok(meltCandidates(s).includes("e4"));
  assert.ok(!meltCandidates(s).includes("e5"));
  assert.ok(!meltCandidates(s).includes("e1"));
  assert.equal(meltCandidates(s).length, 8);
  s = applyVolcanoAction(s, "g1f3", false, "e4");
  assert.ok(!meltCandidates(s).includes("e4"));
  assert.equal(meltCandidates(s).length, 8);
  assert.ok(meltCandidates(s).every((x) => x[1] === "5"));
  assert.throws(() =>
    applyVolcanoAction(
      { ...s, turn: "b", fen: s.fen.replace(" w ", " b ") },
      "g8f6",
      false,
      "e1",
    ),
  );
});
test("Real random eruption is recorded and selects one eligible square", () => {
  const before = applyMove(applyMove(initial("volcan"), "e2e4"), "e7e5"),
    after = applyMove(before, "g1f3");
  assert.equal(after.volcano.melted.length, 1);
  assert.ok(meltCandidates(before).includes(after.history[2].eruption.square));
});
test("Melting a piece removes it and adds it to its own eliminated pool", () => {
  let s = applyMove(applyMove(initial("volcan"), "e2e4"), "e7e5");
  s = applyVolcanoAction(s, "g1f3", false, "e4");
  assert.equal(boardFromFen(s.fen)[index("e4")], null);
  assert.equal(s.reserves.w.p, 1);
  assert.equal(s.reserves.b.p, 0);
  assert.equal(s.history[2].eruption.piece.color, "w");
  assert.ok(validSessionGame(s));
});
test("Ordinary captures are also recoverable by the victim", () => {
  let s = applyMove(initial("volcan"), "e2e4");
  s = applyVolcanoAction(s, "d7d5", false, "a4");
  s = applyMove(s, "e4d5");
  assert.equal(s.reserves.b.p, 1);
  assert.equal(s.reserves.w.p, 0);
});
test("A rook cannot land on or pass through a melted square", () => {
  const s = pos("7k/8/8/8/8/8/8/R6K w - - 0 1", ["a4"]);
  const ms = legalMoves(s).filter((m) => m.from === "a1");
  assert.ok(ms.some((m) => m.to === "a3"));
  assert.ok(!ms.some((m) => ["a4", "a5", "a6", "a7", "a8"].includes(m.to)));
});
test("Bishops and queens cannot cross a molten diagonal", () => {
  for (const piece of ["B", "Q"]) {
    const s = pos(`7k/8/8/8/8/8/8/1${piece}5K w - - 0 1`, ["e4"]);
    assert.ok(
      !legalMoves(s).some(
        (m) => m.from === "b1" && ["e4", "f5", "g6"].includes(m.to),
      ),
    );
  }
});
test("Knight can jump molten squares but cannot land on one", () => {
  const s = pos("7k/8/8/8/8/8/8/1N5K w - - 0 1", ["b2", "c2", "a2", "a3"]);
  assert.ok(legalMoves(s).some((m) => uci(m) === "b1c3"));
  assert.ok(!legalMoves(s).some((m) => uci(m) === "b1a3"));
});
test("Pawn cannot double-step through lava or finish on lava", () => {
  let s = pos("7k/8/8/8/8/8/4P3/7K w - - 0 1", ["e3"]);
  assert.ok(!legalMoves(s).some((m) => m.from === "e2"));
  s = pos("7k/8/8/8/8/8/4P3/7K w - - 0 1", ["e4"]);
  assert.ok(legalMoves(s).some((m) => uci(m) === "e2e3"));
  assert.ok(!legalMoves(s).some((m) => uci(m) === "e2e4"));
});
test("Lava blocks attacks, not only movement: a rook beyond a wall is not check", () => {
  const s = pos("4r2k/8/8/8/8/8/8/4K3 w - - 0 1", ["e4"]);
  assert.ok(new Chess(s.fen).isCheck());
  assert.ok(!inCheck(s));
  assert.ok(legalMoves(s).some((m) => uci(m) === "e1e2"));
});
test("King may never move into a genuine terrain-aware attack", () => {
  const s = pos("4r2k/8/8/8/8/8/8/3K4 w - - 0 1");
  assert.ok(!legalMoves(s).some((m) => uci(m) === "d1e1"));
  assert.ok(!legalMoves(s).some((m) => uci(m) === "d1e2"));
});
test("Castling requires a solid corridor and terrain-aware transit safety", () => {
  let s = pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", ["f1"]);
  assert.ok(!legalMoves(s).some((m) => uci(m) === "e1g1"));
  assert.ok(legalMoves(s).some((m) => uci(m) === "e1c1"));
  s = pos("k4r2/8/8/8/8/8/8/4K2R w K - 0 1", ["f4"]);
  assert.ok(legalMoves(s).some((m) => uci(m) === "e1g1"));
  s = applyMove(s, "e1g1");
  assert.equal(boardFromFen(s.fen)[index("f1")].type, "r");
  assert.equal(s.fen.split(" ")[2], "-");
});
test("Orthodox moves agree with chess.js on 80 no-lava positions", () => {
  let s = initial("volcan"),
    seed = 42;
  for (let i = 0; i < 80; i++) {
    const normal = new Chess(s.fen)
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion || ""));
    if (!normal.length || s.result) break;
    const custom = legalMoves(s).map(uci);
    assert.deepEqual(
      [...custom].sort(),
      [...normal].sort(),
      `ply ${i}: ${s.fen}`,
    );
    seed = (seed * 1664525 + 1013904223) >>> 0;
    s = applyMove(s, custom[seed % custom.length], true);
  }
});
test("Volcano supports promotion and en passant", () => {
  let s = pos("7k/P7/8/8/8/8/8/7K w - - 0 1");
  s = applyMove(s, "a7a8n");
  assert.equal(boardFromFen(s.fen)[index("a8")].type, "n");
  s = pos("7k/8/8/3pP3/8/8/8/7K w - d6 0 1");
  s = applyMove(s, "e5d6");
  assert.equal(s.reserves.b.p, 1);
  assert.equal(boardFromFen(s.fen)[index("d5")], null);
});
test("Eruption clears en passant if its target or the moved pawn disappears", () => {
  for (const at of ["e5", "e6"]) {
    let s = pos("7k/4p3/8/8/8/8/8/7K b - - 0 1", [], {}, {}, 7);
    s = applyVolcanoAction(s, "e7e5", false, at);
    assert.equal(s.fen.split(" ")[3], "-");
  }
});
test("Melting a home rook removes castling rights", () => {
  let s = pos("4k2r/8/8/8/8/8/8/7K b k - 0 1", [], {}, {}, 19);
  s = applyVolcanoAction(s, "e8d8", false, "h8");
  assert.equal(s.fen.split(" ")[2], "-");
  assert.equal(s.reserves.b.r, 1);
});
test("Molten king loses immediately, including the king of the moving side", () => {
  for (const [at, winner] of [
    ["a1", "b"],
    ["g8", "w"],
  ]) {
    let s = pos("7k/8/8/8/8/8/8/K7 b - - 0 1", [], {}, {}, at === "a1" ? 18 : 19);
    s = applyVolcanoAction(s, "h8g8", false, at);
    assert.equal(s.result.winner, winner);
    assert.match(s.result.reason, /lava/);
    assert.ok(validSessionGame(s));
    assert.equal(s.reserves.w.k, undefined);
    assert.equal(s.reserves.b.k, undefined);
  }
});
test("The eruption is adjudicated before mate, and can cut a checking line", () => {
  let s = pos("8/2b5/8/8/8/5k2/r7/7K b - - 0 1", [], {}, {}, 18);
  s = applyVolcanoAction(s, "a2a1", false, "e1");
  assert.ok(new Chess(s.fen).isCheckmate());
  assert.ok(!inCheck(s));
  assert.equal(s.result, null);
});
test("Emergency substitution is available only with zero ordinary moves", () => {
  let s = initial("volcan");
  s.reserves.w.n = 1;
  assert.ok(legalMoves(s).every((m) => m.kind !== "swap"));
  s = pos("7k/8/8/8/8/8/8/R6K w - - 0 1", ["a2", "b1", "g1", "g2", "h2"], {
    n: 1,
  });
  assert.ok(legalMoves(s).length);
  assert.ok(
    legalMoves(s).every(
      (m) => m.kind === "swap" && m.from === "a1" && m.piece === "n",
    ),
  );
});
test("Substitution replaces a non-king and moves the replacement in one action", () => {
  let s = pos("7k/8/8/8/8/8/8/R6K w - - 0 1", ["a2", "b1", "g1", "g2", "h2"], {
    n: 1,
  });
  s = applyMove(s, "N~a1c2");
  assert.equal(s.turn, "b");
  assert.equal(s.history.length, 1);
  assert.equal(boardFromFen(s.fen)[index("a1")], null);
  assert.equal(boardFromFen(s.fen)[index("c2")].type, "n");
  assert.equal(s.reserves.w.r, 1);
  assert.equal(s.reserves.w.n, 0);
  assert.equal(s.volcano.eruptions, 5);
});
test("A substitution can be the only legal defense against mate", () => {
  const s = pos(
    "7k/8/8/8/8/2R5/8/r6K w - - 0 1",
    ["c2", "c4", "b3", "d3", "g2", "h2"],
    { n: 1 },
  );
  assert.ok(inCheck(s));
  assert.equal(volcanoOutcome(s), null);
  assert.ok(legalMoves(s).some((m) => uci(m) === "N~c3d1"));
  const next = applyMove(s, "N~c3d1");
  assert.ok(!inCheck({ ...next, turn: "w" }));
  const without = { ...s, reserves: freshReserves() };
  assert.equal(volcanoOutcome(without).winner, "b");
});
test("No moves or usable replacements means stalemate when not in check", () => {
  const s = pos("7k/8/8/8/8/8/8/7K w - - 0 1", ["g1", "g2", "h2"], { q: 1 });
  assert.deepEqual(legalMoves(s), []);
  assert.equal(volcanoOutcome(s).winner, null);
});
test("Bare kings are not an insufficient-material draw in a volcano", () => {
  let s = pos("7k/8/8/8/8/8/8/K7 w - - 0 1");
  s = applyMove(s, "a1b1");
  assert.equal(s.result, null);
});
test("Undo and deterministic replay restore the recorded terrain and pools", () => {
  let s = applyMove(applyMove(initial("volcan"), "e2e4"), "e7e5");
  s = applyVolcanoAction(s, "g1f3", false, "e4");
  s = applyMove(s, "b8c6");
  const replay = rewindVolcano(s, 4);
  assert.equal(replay.fen, s.fen);
  assert.deepEqual(replay.volcano, s.volcano);
  assert.deepEqual(replay.reserves, s.reserves);
  const before = rewindVolcano(s, 2);
  assert.equal(before.volcano.melted.length, 0);
  assert.equal(before.reserves.w.p, 0);
});
test("Search simulation does not roll a random eruption or mutate original state", () => {
  const s = applyMove(applyMove(initial("volcan"), "e2e4"), "e7e5"),
    raw = JSON.stringify(s);
  const next = applyMove(s, "g1f3", true);
  assert.deepEqual(next.volcano.melted, []);
  assert.equal(next.volcano.eruptions, 1);
  assert.equal(JSON.stringify(s), raw);
});
test("Export and session preserve lava events and detect occupied melted squares", () => {
  let s = applyMove(applyMove(initial("volcan"), "e2e4"), "e7e5");
  s = applyVolcanoAction(s, "g1f3", false, "e4");
  assert.match(pgn(s), /Variant "El suelo es lava"/);
  assert.match(pgn(s), /Erupción 1: e4/);
  assert.match(pgn(s), /pierde wP/);
  assert.ok(validSessionGame(JSON.parse(JSON.stringify(s))));
  assert.ok(
    !validSessionGame({ ...s, volcano: { ...s.volcano, melted: ["e5"] } }),
  );
});
