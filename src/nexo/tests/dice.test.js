import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  initial,
  rollDice,
  legalMoves,
  applyMove,
  uci,
  boardFromFen,
  index,
  inCheck,
  allowsReplyCheck,
  rewindDice,
  pgn,
} from "../src/rules.js";
function pos(fen) {
  return { ...initial("azar"), fen, turn: fen.split(" ")[1] };
}
test("Azar waits for a roll and validates it", () => {
  let s = initial("azar");
  assert.equal(s.dice.phase, "roll");
  assert.equal(legalMoves(s).length, 0);
  assert.throws(() => rollDice(s, 7));
  assert.throws(() => applyMove(s, "e2e4"));
  s = rollDice(s, 1);
  assert.equal(legalMoves(s).length, 20);
  assert.throws(() => rollDice(s, 2));
});
test("Face 1 hands the die to the rival after one move", () => {
  let s = applyMove(rollDice(initial("azar"), 1), "e2e4");
  assert.equal(s.turn, "b");
  assert.equal(s.dice.phase, "roll");
  assert.equal(s.rolls[0].face, 1);
});
test("Face 2 gives exactly two moves to the roller", () => {
  let s = rollDice(initial("azar"), 2);
  s = applyMove(s, "e2e4");
  assert.equal(s.turn, "w");
  assert.equal(s.remaining, 1);
  s = applyMove(s, "g1f3");
  assert.equal(s.turn, "b");
  assert.equal(s.dice.phase, "roll");
  assert.equal(s.history[1].step, 2);
});
test("Face 2 checks are restricted to the last move", () => {
  let s = rollDice(pos("4k3/8/8/8/8/8/R7/4K3 w - - 0 1"), 2);
  assert.ok(!legalMoves(s).some((m) => m.from === "a2" && m.to === "e2"));
  assert.ok(
    legalMoves({ ...s, remaining: 1 }).some(
      (m) => m.from === "a2" && m.to === "e2",
    ),
  );
});
test("Face 3: W moves, B replies, then B rolls, no extra W turn", () => {
  let s = rollDice(initial("azar"), 3);
  s = applyMove(s, "e2e4");
  assert.equal(s.turn, "b");
  assert.equal(s.dice.reply, true);
  assert.equal(s.dice.phase, "move");
  assert.throws(() => rollDice(s, 6));
  s = applyMove(s, "e7e5");
  assert.equal(s.turn, "b");
  assert.equal(s.dice.phase, "roll");
  assert.equal(s.fen.split(" ")[3], "-");
  assert.equal(s.history[1].diceReply, true);
  s = rollDice(s, 1);
  assert.equal(s.turn, "b");
  s = applyMove(s, "g8f6");
  assert.equal(s.turn, "w");
});
test("Face 3 reply cannot check, because the same player immediately continues", () => {
  const s = {
    ...pos("4k3/r7/8/8/8/8/8/4K3 b - - 0 1"),
    remaining: 1,
    dice: {
      phase: "move",
      face: 3,
      roller: "w",
      reply: true,
      total: 1,
      fallback: "",
    },
  };
  assert.ok(legalMoves(s).length);
  assert.ok(legalMoves(s).every((m) => !/[+#]/.test(m.san)));
});
test("Face 4 forces minor pieces and falls back only if impossible", () => {
  let s = rollDice(initial("azar"), 4);
  assert.equal(s.dice.fallback, "");
  assert.ok(legalMoves(s).every((m) => ["n", "b"].includes(m.piece)));
  assert.throws(() => applyMove(s, "e2e4"));
  s = rollDice(pos("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"), 4);
  assert.ok(s.dice.fallback);
  assert.ok(legalMoves(s).some((m) => m.piece === "r"));
});
test("Face 5 leaves the king SAFE but offers a legal checking reply", () => {
  const s = rollDice(pos("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1"), 5);
  assert.equal(s.dice.fallback, "");
  assert.ok(legalMoves(s).length);
  for (const m of legalMoves(s)) {
    assert.ok(allowsReplyCheck(s.fen, m));
    const next = applyMove(s, m);
    const f = next.fen.split(" ");
    f[1] = "w";
    f[3] = "-";
    assert.ok(!new Chess(f.join(" ")).isCheck());
  }
});
test("Face 5 has a normal move fallback in initial blocked position", () => {
  const s = rollDice(initial("azar"), 5);
  assert.ok(s.dice.fallback);
  assert.equal(legalMoves(s).length, 20);
  const n = applyMove(s, "e2e4");
  assert.equal(n.turn, "b");
});
test("Face 5 does not force the rival to take the checking opportunity", () => {
  let s = rollDice(pos("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1"), 5);
  s = applyMove(s, legalMoves(s)[0]);
  s = rollDice(s, 1);
  assert.ok(legalMoves(s).some((m) => !/[+#]/.test(m.san)));
});
test("Face 6 removes one selected enemy non-king and immediately hands over the die", () => {
  let s = rollDice(initial("azar"), 6);
  assert.equal(legalMoves(s).length, 15);
  assert.ok(!legalMoves(s).some((m) => m.to === "e8"));
  assert.throws(() => applyMove(s, "@e8"));
  s = applyMove(s, "@d8");
  assert.equal(boardFromFen(s.fen)[index("d8")], null);
  assert.equal(boardFromFen(s.fen).filter(Boolean).length, 31);
  assert.equal(s.turn, "b");
  assert.equal(s.dice.phase, "roll");
  assert.equal(s.history[0].kind, "remove");
});
test("Removing a home rook cancels its castling right and clears en passant", () => {
  let s = rollDice(initial("azar"), 6);
  s = applyMove(s, "@h8");
  assert.equal(s.fen.split(" ")[2], "KQq");
  assert.equal(s.fen.split(" ")[3], "-");
});
test("Removal must resolve an existing check; cannot remove an arbitrary pawn", () => {
  let s = rollDice(pos("4r2k/p7/8/8/8/8/8/R3K3 w - - 0 1"), 6);
  assert.ok(inCheck(s));
  assert.deepEqual(legalMoves(s).map(uci), ["@e8"]);
  s = applyMove(s, "@e8");
  assert.equal(s.turn, "b");
  assert.ok(!s.result);
});
test("Face 6 falls back when rival has only a king", () => {
  let s = rollDice(pos("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"), 6);
  assert.equal(s.dice.phase, "move");
  assert.ok(s.dice.fallback);
  assert.ok(legalMoves(s).every((m) => m.kind !== "remove"));
});
test("Mate ends the game before any next roll", () => {
  let s = rollDice(pos("7k/8/5KQ1/8/8/8/8/8 w - - 0 1"), 1);
  s = applyMove(s, "g6g7");
  assert.equal(s.result.winner, "w");
  assert.match(s.result.reason, /mate/);
  assert.throws(() => rollDice(s, 6));
});
test("Undo preserves exact dice faces and restores removed pieces", () => {
  let s = rollDice(initial("azar"), 6);
  s = applyMove(s, "@d8");
  s = rollDice(s, 2);
  s = applyMove(s, "e7e5");
  s = applyMove(s, "g8f6");
  let r = rewindDice(s, 0);
  assert.equal(r.dice.face, 6);
  assert.equal(r.dice.phase, "remove");
  assert.equal(boardFromFen(r.fen)[index("d8")].type, "q");
  r = rewindDice(s, 2);
  assert.equal(r.dice.face, 2);
  assert.equal(r.turn, "b");
  assert.equal(r.remaining, 1);
  assert.deepEqual(
    r.history.map((h) => h.san),
    s.history.slice(0, 2).map((h) => h.san),
  );
});
test("Export records die faces and removal positions", () => {
  const s = applyMove(rollDice(initial("azar"), 6), "@d8");
  const text = pgn(s);
  assert.match(text, /Variant "Azar"/);
  assert.match(text, /Dado 6/);
  assert.match(text, /Retira Q en d8/);
  assert.match(text, /FEN:/);
  assert.equal(JSON.parse(JSON.stringify(s)).history[0].diceFace, 6);
});
