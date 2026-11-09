import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  applyMove,
  legalMoves,
  uci,
  inCheck,
  index,
  boardFromFen,
  toFen,
  pgn,
} from "../rules.js";
import {
  wetAttacked,
  wetOutcome,
  wetPositionKey,
  rewindWet,
} from "../wet.js";
import { validSessionGame } from "../session.js";
function pos(fen, ep = null) {
  return {
    ...initial("mojado"),
    fen,
    turn: fen.split(" ")[1],
    wet: { ep },
    positions: [],
  };
}
const moves = (s) => legalMoves(s).map(uci);
const at = (s, sq) => boardFromFen(s.fen)[index(sq)];
test("Wet initial twenty moves show final sliding destinations", () => {
  const s = initial("mojado");
  assert.equal(legalMoves(s).length, 20);
  assert.ok(moves(s).includes("e2e5"));
  assert.ok(moves(s).includes("e2e4"));
  assert.ok(moves(s).includes("g1f4"));
  assert.ok(!moves(s).includes("e2e3"));
  assert.equal(s.positions[0], wetPositionKey(s));
});
test("Pawn first step and double step add exactly one extra square", () => {
  for (const [to, via] of [
    ["e4", "e3"],
    ["e5", "e4"],
  ]) {
    const s = applyMove(initial("mojado"), "e2" + to);
    assert.equal(at(s, to).type, "p");
    assert.equal(s.history[0].via, via);
    assert.equal(s.turn, "b");
    assert.equal(s.history.length, 1);
  }
});
test("Later pawn advances also slide one extra", () => {
  let s = pos("7k/8/8/8/8/4P3/8/K7 w - - 0 1");
  assert.deepEqual(
    legalMoves(s)
      .filter((m) => m.from === "e3")
      .map(uci),
    ["e3e5"],
  );
});
test("Friendly collision ends on last free square, never back at origin", () => {
  const s = pos("7k/8/8/8/4B3/8/4P3/K7 w - - 0 1");
  assert.ok(moves(s).includes("e2e3"));
  assert.ok(!moves(s).includes("e2e2"));
  assert.equal(legalMoves(s).find((m) => m.from === "e2").stop, "ally");
});
test("A pawn cannot capture a front enemy during its slide", () => {
  const s = pos("7k/8/8/8/4n3/8/4P3/K7 w - - 0 1");
  const n = applyMove(s, "e2e3");
  assert.equal(at(n, "e4").color, "b");
  assert.equal(n.history[0].captured, undefined);
  assert.equal(n.history[0].stop, "pawn-blocked");
});
test("Pawn diagonal capture stops immediately and never slides again", () => {
  const s = pos("7k/8/8/5n2/4P3/8/8/K7 w - - 0 1");
  const n = applyMove(s, "e4f5");
  assert.equal(at(n, "f5").type, "p");
  assert.equal(n.history[0].slid, false);
  assert.ok(!moves(s).includes("e4g6"));
});
test("Knight e4-f6 slides along its long axis to f7", () => {
  const s = pos("k7/8/8/8/4N3/8/8/7K w - - 0 1");
  assert.ok(moves(s).includes("e4f7"));
  assert.ok(!moves(s).includes("e4g7"));
  assert.ok(!moves(s).includes("e4f6"));
});
test("Knight long horizontal segment also extends correctly", () => {
  const s = pos("k7/8/8/8/4N3/8/8/7K w - - 0 1");
  assert.ok(moves(s).includes("e4h5"));
  assert.equal(legalMoves(s).find((m) => m.to === "h5").via, "g5");
});
test("Knight at board edge stays on its valid landing square", () => {
  const s = pos("k7/8/4N3/8/8/8/8/7K w - - 0 1");
  assert.ok(moves(s).includes("e6f8"));
  assert.equal(legalMoves(s).find((m) => m.to === "f8").stop, "edge");
});
test("Knight first landing capture stops, extension capture also stops", () => {
  for (const victim of ["f6", "f7"]) {
    const b = boardFromFen("k7/8/8/8/4N3/8/8/7K w - - 0 1");
    b[index(victim)] = { type: "r", color: "b" };
    const s = pos(toFen(b, "w"));
    const n = applyMove(s, "e4" + victim);
    assert.equal(n.history[0].captured, "r");
    assert.equal(at(n, victim).type, "n");
    assert.equal(n.history[0].san, victim === "f6" ? "Ne4xf6" : "Ne4-f6~xf7");
  }
});
test("Knight cannot jump over a piece on its first landing while sliding", () => {
  const s = pos("k7/8/5P2/8/4N3/8/8/7K w - - 0 1");
  assert.ok(!moves(s).includes("e4f7"));
  assert.ok(!moves(s).includes("e4f6"));
});
test("Rook must reach line end rather than stop at arbitrary empty squares", () => {
  const s = pos("7k/8/8/8/3R4/8/8/K7 w - - 0 1");
  const targets = legalMoves(s)
    .filter((m) => m.from === "d4")
    .map((m) => m.to)
    .sort();
  assert.deepEqual(targets, ["a4", "d1", "d8", "h4"]);
});
test("Sliding bishop reaches diagonal edge and queen supports both lines", () => {
  const b = pos("7k/8/8/8/3B4/8/8/K7 w - - 0 1");
  assert.ok(moves(b).includes("d4h8") === false);
  assert.ok(moves(b).includes("d4g1"));
  assert.ok(moves(b).includes("d4a7"));
  const q = pos("7k/8/8/8/3Q4/8/8/K7 w - - 0 1");
  assert.ok(moves(q).includes("d4d8"));
  assert.ok(moves(q).includes("d4g1"));
});
test("Slider captures first enemy and cannot continue or capture several", () => {
  const s = pos("7k/3n4/8/3p4/3R4/8/8/K7 w - - 0 1");
  assert.ok(moves(s).includes("d4d5"));
  assert.ok(!moves(s).includes("d4d7"));
  const n = applyMove(s, "d4d5");
  assert.equal(at(n, "d7").type, "n");
  assert.equal(n.history[0].captured, "p");
});
test("Slider stops immediately before a friendly piece", () => {
  const s = pos("7k/3P4/8/8/3R4/8/8/K7 w - - 0 1");
  const m = legalMoves(s).find((m) => m.from === "d4" && m.to === "d6");
  assert.ok(m);
  assert.equal(m.stop, "ally");
});
test("King moves two squares on clear floor and one when capturing", () => {
  const s = pos("7k/8/8/8/8/8/8/K7 w - - 0 1");
  assert.ok(moves(s).includes("a1c1"));
  assert.ok(!moves(s).includes("a1b1"));
  const cap = pos("7k/8/8/8/8/8/8/Kr6 w - - 0 1");
  assert.ok(moves(cap).includes("a1b1"));
});
test("King may not pass through an attacked intermediate square", () => {
  const s = pos("1r5k/8/8/8/8/8/8/K7 w - - 0 1");
  assert.ok(!moves(s).includes("a1c1"));
  assert.ok(moves(s).includes("a1a3"));
});
test("Attack maps include extended knights and are blocked by occupied landing", () => {
  let b = boardFromFen("k7/8/8/8/4n3/8/8/7K w - - 0 1");
  assert.ok(wetAttacked(b, index("f7"), "b"));
  b[index("f6")] = { type: "p", color: "w" };
  assert.ok(!wetAttacked(b, index("f7"), "b"));
  assert.ok(wetAttacked(b, index("f6"), "b"));
});
test("Extended king attacks require an empty intermediate square", () => {
  let b = boardFromFen("8/8/8/8/4k3/8/8/7K w - - 0 1");
  assert.ok(wetAttacked(b, index("e2"), "b"));
  b[index("e3")] = { type: "p", color: "w" };
  assert.ok(!wetAttacked(b, index("e2"), "b"));
});
test("Check uses sliding attacks rather than classic FEN alone", () => {
  const s = pos("k7/5K2/8/8/4n3/8/8/8 w - - 0 1");
  assert.ok(inCheck(s));
  assert.ok(
    legalMoves(s).every((m) => !inCheck({ ...applyMove(s, m), turn: "w" })),
  );
});
test("No move can capture either king", () => {
  const s = pos("7k/8/8/8/3Q4/8/8/K7 w - - 0 1");
  assert.ok(!legalMoves(s).some((m) => m.captured === "k"));
});
test("Both white castles slide king and rook to confirmed final positions", () => {
  for (const [to, rookOld] of [
    ["h1", "h1"],
    ["b1", "a1"],
  ]) {
    const s = pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const m = legalMoves(s).find((m) => m.castle && m.to === to);
    assert.ok(m);
    const n = applyMove(s, m);
    assert.equal(at(n, to).type, "k");
    assert.equal(at(n, "e1").type, "r");
    assert.equal(n.fen.split(" ")[2], "-");
    if (to !== rookOld) assert.equal(at(n, rookOld), null);
  }
});
test("Black castling mirrors white on rank eight", () => {
  const s = pos("r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1");
  const n = applyMove(s, "e8h8");
  assert.equal(at(n, "h8").type, "k");
  assert.equal(at(n, "e8").type, "r");
});
test("Castling rejects occupied corridor, check and extended attacks on path", () => {
  for (const fen of [
    "4k3/8/8/8/8/8/8/4KB1R w K - 0 1",
    "4r2k/8/8/8/8/8/8/4K2R w K - 0 1",
    "k7/8/8/8/6n1/8/8/4K2R w K - 0 1",
  ])
    assert.ok(!legalMoves(pos(fen)).some((m) => m.castle));
});
test("Moving or capturing an initial rook loses castling rights", () => {
  let s = pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
  s = applyMove(s, "h1h8");
  assert.equal(s.fen.split(" ")[2], "Q");
  s = pos("4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1");
  s = applyMove(s, "h1h8");
  assert.equal(s.fen.split(" ")[2], "-");
});
test("Promotion is immediate on reaching last rank, including slide", () => {
  for (const fen of [
    "k7/4P3/8/8/8/8/8/7K w - - 0 1",
    "k7/8/4P3/8/8/8/8/7K w - - 0 1",
  ]) {
    const s = pos(fen);
    const promos = legalMoves(s).filter((m) => m.to === "e8");
    assert.equal(promos.length, 4);
    const n = applyMove(
      s,
      promos.find((m) => m.promotion === "n"),
    );
    assert.equal(at(n, "e8").type, "n");
    assert.equal(n.history[0].stop, "promotion");
  }
});
test("Two-square and three-square initial advances create immediate en passant", () => {
  for (const [dest, capturer] of [
    ["e4", "d4"],
    ["e5", "d5"],
  ]) {
    let b = boardFromFen("7k/8/8/8/8/8/4P3/K7 w - - 0 1");
    b[index(capturer)] = { type: "p", color: "b" };
    let s = applyMove(pos(toFen(b, "w")), "e2" + dest);
    const target = "e" + (Number(dest[1]) - 1);
    assert.deepEqual(s.wet.ep, { target, pawn: dest, color: "w" });
    assert.ok(validSessionGame(s));
    s = applyMove(s, capturer + target);
    assert.equal(at(s, dest), null);
    assert.equal(at(s, target).color, "b");
    assert.ok(s.history.at(-1).enPassant);
    assert.equal(s.history.at(-1).slid, false);
    assert.equal(s.wet.ep, null);
  }
});
test("Black three-square en passant mirrors white and expires after response", () => {
  let s = pos("7k/4p3/8/8/3P4/8/8/K7 b - - 0 1");
  s = applyMove(s, "e7e4");
  assert.equal(s.wet.ep.target, "e5");
  assert.ok(moves(s).includes("d4e5"));
  const cap = applyMove(s, "d4e5");
  assert.equal(at(cap, "e4"), null);
  const reply = applyMove(s, "a1a3");
  assert.equal(reply.wet.ep, null);
});
test("En passant must not expose own king", () => {
  let s = pos("k7/4p3/8/8/3P3r/8/8/K7 b - - 0 1");
  s = applyMove(s, "e7e4");
  s = { ...s, fen: s.fen.replace("K7", "8").replace("3Pp2r", "K2Pp2r") };
  assert.ok(!moves(s).includes("d4e5"));
});
test("Mate and stalemate use full sliding move legality", () => {
  const mate = pos("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
  assert.equal(wetOutcome(mate)?.winner, "w");
  let found = false;
  for (let q = 0; q < 64 && !found; q++)
    for (let k = 0; k < 64 && !found; k++) {
      if (q === k || q === 7 || k === 7) continue;
      const b = Array(64).fill(null);
      b[7] = { type: "k", color: "b" };
      b[q] = { type: "q", color: "w" };
      b[k] = { type: "k", color: "w" };
      const s = pos(toFen(b, "b"));
      if (
        !inCheck(s) &&
        !inCheck({ ...s, turn: "w" }) &&
        !legalMoves(s).length
      ) {
        assert.equal(wetOutcome(s).winner, null);
        found = true;
      }
    }
  assert.ok(found);
});
test("Other classical draw conventions remain explicit", () => {
  assert.equal(wetOutcome(pos("7k/8/8/8/8/8/8/K7 w - - 0 1")).winner, null);
  const s = pos("7k/8/8/8/8/8/8/KR6 w - - 100 1");
  assert.match(wetOutcome(s).reason, /50 movimientos/);
  s.fen = s.fen.replace("100 1", "0 1");
  s.positions = Array(3).fill(wetPositionKey(s));
  assert.match(wetOutcome(s).reason, /repetición/);
});
test("Undo, replay and JSON preserve routes and extended en passant", () => {
  let s = initial("mojado");
  for (const m of ["e2e5", "d7d4", "g1f4"]) s = applyMove(s, m);
  const replay = rewindWet(s, 3);
  assert.deepEqual(replay, s);
  const before = rewindWet(s, 1);
  assert.equal(before.wet.ep.target, "e4");
  assert.ok(validSessionGame(JSON.parse(JSON.stringify(s))));
  assert.ok(
    !validSessionGame({
      ...s,
      wet: { ep: { target: "e4", pawn: "e5", color: "b" } },
    }),
  );
});
test("Extended PGN records slide notation and exact paths", () => {
  const s = applyMove(initial("mojado"), "e2e5");
  const text = pgn(s);
  assert.match(text, /Variant "Suelo mojado"/);
  assert.match(text, /e2-e4~e5/);
  assert.match(text, /Ruta: e2-e3-e4-e5/);
  assert.match(text, /al paso: e4 retira e5/);
});
test("Search simulation is pure and no random sliding outcomes exist", () => {
  const s = initial("mojado"),
    before = JSON.stringify(s);
  const a = applyMove(s, "e2e5", true),
    b = applyMove(s, "e2e5", true);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(a.history, []);
});
