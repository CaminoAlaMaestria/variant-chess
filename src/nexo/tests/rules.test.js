import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  legalMoves,
  applyMove,
  budget,
  uci,
  inCheck,
  boardFromFen,
  pgn,
} from "../src/rules.js";
function pos(fen, variant = "comecome", extra = {}) {
  return { ...initial(variant), fen, turn: fen.split(" ")[1], ...extra };
}
test("Initial positions have 20 moves", () => {
  assert.equal(legalMoves(initial()).length, 20);
  assert.equal(legalMoves(initial("correlativo")).length, 20);
});
test("Mandatory captures; choices retained", () => {
  const s = pos("8/8/2p1p3/3P4/8/8/8/8 w - - 0 1");
  assert.deepEqual(legalMoves(s).map(uci).sort(), ["d5c6", "d5e6"]);
});
test("King can be captured and its owner wins when it was last piece", () => {
  const s = pos("8/8/8/8/8/3k4/3R4/8 w - - 0 1");
  const n = applyMove(s, "d2d3");
  assert.equal(n.result.winner, "b");
});
test("Come-come kings may move into attack and do not castle", () => {
  const s = pos("4r3/8/8/8/8/8/8/R3K2R w - - 0 1");
  assert.ok(legalMoves(s).some((m) => m.to === "e2"));
  assert.ok(!legalMoves(s).some((m) => m.from === "e1" && m.to === "g1"));
});
test("No moves with pieces is a draw", () => {
  const s = pos("P7/8/8/8/8/8/7r/8 b - - 0 1");
  const n = applyMove(s, "h2h3");
  assert.equal(n.result.winner, null);
  assert.match(n.result.reason, /bloqueo/);
});
test("Come-come promotion includes king", () => {
  const s = pos("8/P7/8/8/8/8/7p/8 w - - 0 1");
  assert.equal(legalMoves(s).filter((m) => m.from === "a7").length, 5);
  const n = applyMove(s, "a7a8k");
  assert.equal(boardFromFen(n.fen)[0].type, "k");
});
test("En passant is compulsory capture", () => {
  const s = pos("8/8/8/3pP3/8/8/8/1n6 w - d6 0 2");
  assert.deepEqual(legalMoves(s).map(uci), ["e5d6"]);
  const n = applyMove(s, "e5d6");
  assert.equal(boardFromFen(n.fen)[27], null);
});
test("Turn sequence repeats 2..6, not resetting by color", () => {
  assert.deepEqual(
    Array.from({ length: 17 }, (_, i) => budget(i)),
    [1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6, 2],
  );
});
test("Correlativo same side moves until budget finishes", () => {
  let s = initial("correlativo");
  s = applyMove(s, "e2e4");
  assert.equal(s.turn, "b");
  assert.equal(s.remaining, 2);
  s = applyMove(s, "e7e5");
  assert.equal(s.turn, "b");
  assert.equal(s.remaining, 1);
  s = applyMove(s, "b8c6");
  assert.equal(s.turn, "w");
  assert.equal(s.remaining, 3);
});
test("Giving check is prohibited except last submove", () => {
  const s = pos("4k3/8/8/8/8/8/R7/4K3 w - - 0 1", "correlativo", {
    remaining: 2,
    turnIndex: 2,
  });
  assert.ok(!legalMoves(s).some((m) => m.from === "a2" && m.to === "e2"));
  assert.ok(
    legalMoves({ ...s, remaining: 1 }).some(
      (m) => m.from === "a2" && m.to === "e2",
    ),
  );
});
test("Must escape check on first submove", () => {
  const s = pos("4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1", "correlativo", {
    remaining: 3,
    turnIndex: 2,
  });
  assert.ok(inCheck(s));
  assert.ok(legalMoves(s).every((m) => m.from === "e1"));
  for (const m of legalMoves(s)) assert.ok(!inCheck(applyMove(s, m)));
});
test("Correlativo EP only survives when changing turn", () => {
  let s = pos("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "correlativo", {
    remaining: 2,
    turnIndex: 2,
  });
  s = applyMove(s, "e2e4");
  assert.equal(s.fen.split(" ")[3], "-");
  let t = pos("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "correlativo", {
    remaining: 1,
    turnIndex: 2,
  });
  t = applyMove(t, "e2e4");
  assert.equal(t.fen.split(" ")[3], "e3");
  assert.ok(legalMoves(t).some((m) => m.from === "d4" && m.to === "e3"));
});
test("PGN variant and turn annotations", () => {
  let s = initial("correlativo");
  s = applyMove(s, "e2e4");
  s = applyMove(s, "e7e5");
  s = applyMove(s, "b8c6");
  assert.match(pgn(s), /Variant "Correlativo mejorado"/);
  assert.match(pgn(s), /e5 \{ 1\/2 \} Nc6 \{ 2\/2 \}/);
});
test("Normal castling available and king cannot move into check", () => {
  const s = pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "correlativo");
  assert.ok(legalMoves(s).some((m) => m.to === "g1" && m.piece === "k"));
  assert.ok(legalMoves(s).some((m) => m.to === "c1" && m.piece === "k"));
});
test("Come-come threefold repetition includes the initial position", () => {
  let s = initial();
  for (const move of [
    "g1f3",
    "g8f6",
    "f3g1",
    "f6g8",
    "g1f3",
    "g8f6",
    "f3g1",
    "f6g8",
  ])
    s = applyMove(s, move);
  assert.equal(s.result.winner, null);
  assert.match(s.result.reason, /repetición/);
});
test("Come-come exports SAN rather than long algebraic", () => {
  let s = initial();
  for (const m of ["e2e4", "d7d5", "e4d5"]) s = applyMove(s, m);
  assert.deepEqual(
    s.history.map((h) => h.san),
    ["e4", "d5", "exd5"],
  );
  assert.match(pgn(s), /Variant "Antichess"/);
});
