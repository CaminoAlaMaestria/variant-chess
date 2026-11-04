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
  reserveKey,
  inCheck,
  pgn,
} from "../rules.js";
import { validSessionGame } from "../session.js";
function pos(fen, white = {}, black = {}) {
  const reserves = freshReserves();
  Object.assign(reserves.w, white);
  Object.assign(reserves.b, black);
  return { ...initial("renacer"), fen, turn: fen.split(" ")[1], reserves };
}
function play(ms) {
  let s = initial("renacer");
  for (const m of ms) s = applyMove(s, m);
  return s;
}
test("Renacer starts with empty own reserves and twenty normal moves", () => {
  const s = initial("renacer");
  assert.equal(legalMoves(s).length, 20);
  assert.equal(reserveCount(s.reserves, "w"), 0);
  assert.ok(validSessionGame(s));
});
test("Captured pawn enters victim reserve, never capturer reserve", () => {
  const s = play(["e2e4", "d7d5", "e4d5"]);
  assert.equal(s.reserves.b.p, 1);
  assert.equal(s.reserves.w.p, 0);
  assert.equal(s.turn, "b");
});
test("Deploying consumes a whole turn and removes one reserve piece", () => {
  let s = play(["e2e4", "d7d5", "e4d5"]);
  s = applyMove(s, "P@e6");
  assert.equal(s.reserves.b.p, 0);
  assert.equal(s.turn, "w");
  assert.deepEqual(boardFromFen(s.fen)[index("e6")], { type: "p", color: "b" });
  assert.equal(s.history.at(-1).san, "P@e6");
  assert.equal(s.history.at(-1).kind, "drop");
});
test("No drop may capture either color or redeploy a king", () => {
  const s = pos("4k3/8/8/8/8/8/3p4/4K3 w - - 0 1", { q: 1 });
  assert.throws(() => applyMove(s, "Q@d2"));
  assert.throws(() => applyMove(s, "Q@e1"));
  assert.throws(() => applyMove(s, "K@a4"));
  assert.ok(
    legalMoves(s)
      .filter((m) => m.kind === "drop")
      .every((m) => !boardFromFen(s.fen)[index(m.to)]),
  );
});
test("White pawns deploy only on ranks 2 through 6", () => {
  const s = pos("7k/8/8/8/8/8/8/K7 w - - 0 1", { p: 1 });
  const ms = legalMoves(s).filter((m) => m.kind === "drop");
  assert.ok(ms.length);
  assert.deepEqual([...new Set(ms.map((m) => m.to[1]))].sort(), [
    "2",
    "3",
    "4",
    "5",
    "6",
  ]);
  for (const at of ["c1", "c7", "c8"])
    assert.throws(() => applyMove(s, "P@" + at));
});
test("Black pawns deploy only on ranks 3 through 7", () => {
  const s = pos("7k/8/8/8/8/8/8/K7 b - - 0 1", {}, { p: 1 });
  const ms = legalMoves(s).filter((m) => m.kind === "drop");
  assert.ok(ms.length);
  assert.deepEqual([...new Set(ms.map((m) => m.to[1]))].sort(), [
    "3",
    "4",
    "5",
    "6",
    "7",
  ]);
  for (const at of ["c8", "c2", "c1"])
    assert.throws(() => applyMove(s, "P@" + at));
});
test("Dropping any piece may not check the enemy king", () => {
  const s = pos("4k3/8/8/8/8/8/8/4K3 w - - 0 1", {
    p: 1,
    n: 1,
    b: 1,
    r: 1,
    q: 1,
  });
  assert.throws(() => applyMove(s, "R@e4"));
  assert.throws(() => applyMove(s, "N@f6"));
  for (const m of legalMoves(s).filter((m) => m.kind === "drop"))
    assert.ok(!new Chess(applyMove(s, m).fen).isCheck());
});
test("Normal moves may give check; the restriction applies only to placements", () => {
  const s = pos("4k3/8/8/8/8/8/R7/4K3 w - - 0 1");
  assert.ok(legalMoves(s).some((m) => uci(m) === "a2e2"));
  const n = applyMove(s, "a2e2");
  assert.ok(inCheck(n));
});
test("A reserve piece can legally block check but not ignore it", () => {
  const s = pos("4r2k/8/8/8/8/8/8/4K3 w - - 0 1", { b: 1 });
  assert.ok(inCheck(s));
  assert.throws(() => applyMove(s, "B@a3"));
  const n = applyMove(s, "B@e4");
  assert.equal(n.turn, "b");
  assert.ok(!new Chess(n.fen.replace(" b ", " w ")).isCheck());
});
test("Apparent classical mate is not mate if the reserve can defend", () => {
  let s = pos("8/2b5/8/8/8/5k2/r7/7K b - - 0 1", { b: 1 });
  s = applyMove(s, "a2a1");
  assert.ok(new Chess(s.fen).isCheckmate());
  assert.equal(s.result, null);
  assert.equal(s.history.at(-1).san, "Ra1+");
  assert.ok(legalMoves(s).every((m) => m.kind === "drop"));
  s = applyMove(s, "B@b1");
  assert.equal(s.result, null);
});
test("Actual mate ends the game when no reserve can defend", () => {
  let s = pos("8/2b5/8/8/8/5k2/r7/7K b - - 0 1");
  s = applyMove(s, "a2a1");
  assert.equal(s.result.winner, "b");
  assert.equal(s.history.at(-1).san, "Ra1#");
});
test("Promoted queen stays a queen in its original owners reserve", () => {
  let s = pos("1r5k/P7/8/8/8/8/8/K7 w - - 0 1");
  s = applyMove(s, "a7a8q");
  s = applyMove(s, "b8a8");
  assert.equal(s.reserves.w.q, 1);
  assert.equal(s.reserves.w.p, 0);
  assert.equal(s.reserves.b.q, 0);
  assert.ok(legalMoves(s).some((m) => uci(m) === "Q@a3"));
});
test("En passant also returns captured pawn to its owner", () => {
  let s = pos("7k/8/8/3pP3/8/8/8/K7 w - d6 0 1");
  s = applyMove(s, "e5d6");
  assert.equal(s.reserves.b.p, 1);
  assert.equal(boardFromFen(s.fen)[index("d5")], null);
});
test("Deployment clears en passant", () => {
  let s = pos("7k/8/8/3pP3/8/8/8/K7 w - d6 0 1", { n: 1 });
  s = applyMove(s, "N@b3");
  assert.equal(s.fen.split(" ")[3], "-");
});
test("Returning a rook does not restore lost castling rights", () => {
  let s = pos("4k3/8/8/8/8/8/8/4K3 w - - 0 1", { r: 1 });
  s = applyMove(s, "R@h1");
  assert.equal(s.fen.split(" ")[2], "-");
  s = applyMove(s, "e8d7");
  assert.ok(!legalMoves(s).some((m) => uci(m) === "e1g1"));
});
test("Redeployed pawn on its starting rank can later move two squares", () => {
  let s = pos("7k/8/8/8/8/8/8/K7 w - - 0 1", { p: 1 });
  s = applyMove(s, "P@c2");
  s = applyMove(s, "h8g8");
  assert.ok(legalMoves(s).some((m) => uci(m) === "c2c4"));
});
test("Each capture-return cycle conserves total piece count", () => {
  let s = play(["e2e4", "d7d5", "e4d5", "P@e6", "d5e6"]);
  assert.equal(s.reserves.b.p, 1);
  assert.equal(
    boardFromFen(s.fen).filter(Boolean).length +
      reserveCount(s.reserves, "w") +
      reserveCount(s.reserves, "b"),
    32,
  );
});
test("Material in reserve prevents a false insufficient-material draw", () => {
  let s = pos("7k/8/8/8/8/8/8/K7 w - - 0 1", { q: 1 });
  s = applyMove(s, "a1b1");
  assert.equal(s.result, null);
});
test("Repetition distinguishes reserves and uses the initial position", () => {
  assert.notEqual(
    reserveKey(freshReserves()),
    reserveKey({ w: { ...freshReserves().w, p: 1 }, b: freshReserves().b }),
  );
  let s = play([
    "g1f3",
    "g8f6",
    "f3g1",
    "f6g8",
    "g1f3",
    "g8f6",
    "f3g1",
    "f6g8",
  ]);
  assert.match(s.result.reason, /repetición/);
});
test("History has immutable pocket snapshots and replay restores them", () => {
  let s = play(["e2e4", "d7d5", "e4d5", "P@e6"]);
  assert.equal(s.history[2].reservesAfter.b.p, 1);
  assert.equal(s.history[3].reservesAfter.b.p, 0);
  let replay = initial("renacer");
  for (const h of s.history) replay = applyMove(replay, uci(h));
  assert.equal(replay.fen, s.fen);
  assert.deepEqual(replay.reserves, s.reserves);
  assert.ok(validSessionGame(replay));
  const broken = {
    ...s,
    reserves: { w: { ...s.reserves.w, p: -1 }, b: s.reserves.b },
  };
  assert.ok(!validSessionGame(broken));
});
test("PGN records placements and owner reserves; JSON retains exact state", () => {
  const s = play(["e2e4", "d7d5", "e4d5", "P@e6"]);
  const text = pgn(s);
  assert.match(text, /Variant "Renacer"/);
  assert.match(text, /P@e6/);
  assert.match(text, /Reserva B\/N/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(s)).history[2].reservesAfter,
    s.history[2].reservesAfter,
  );
});
