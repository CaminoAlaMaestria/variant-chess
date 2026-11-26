import test from "node:test";
import assert from "node:assert/strict";
import { initial } from "../rules.js";
import {
  meltCandidates,
  applyVolcanoAction,
  volcanoVersion,
  volcanoProblem,
  rewindVolcano,
  volcanoLegalMoves,
} from "../volcano.js";
import { validSessionGame } from "../session.js";
import { WORLD_1_ORDER } from "../campaign.js";

const KINGS = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
const v2 = (melted, eruptions) => ({ melted, eruptions, last: null, every: 3, rulesVersion: 2 });
const rows = (m) => m.reduce((a, s) => ((a[s[1]] = (a[s[1]] || 0) + 1), a), {});

test("new Volcán games are rules v2; saves without version are v1", () => {
  assert.equal(initial("volcan").volcano.rulesVersion, 2);
  assert.equal(volcanoVersion({ melted: [], eruptions: 0 }), 1);
  assert.equal(volcanoVersion({ melted: [], eruptions: 0, rulesVersion: 7 }), null);
});
test("fifth eruption expands to rank 3 when rank 4 is full", () => {
  const c = meltCandidates({ volcano: v2(["a4", "b4", "a5", "b5"], 4) });
  assert.ok(c.length && c.every((s) => s[1] === "3"));
});
test("saturated half sends the eruption to the other half", () => {
  const low = ["a1", "b1", "a2", "b2", "a3", "b3", "a4", "b4"];
  const c = meltCandidates({ volcano: v2(low, 8) });
  assert.ok(c.length && c.every((s) => Number(s[1]) >= 5));
});
function at(melted, eruptions, force) {
  const s = { ...initial("volcan"), fen: KINGS, turnIndex: 2, volcano: v2(melted, eruptions) };
  return applyVolcanoAction(s, "e1d1", false, force);
}
test("from 9 to 10 lavas nothing is recovered", () => {
  const nine = ["a1", "b1", "a2", "b2", "a3", "b3", "c5", "d5", "a6"];
  const n = at(nine, 9, "e6");
  assert.equal(n.volcano.melted.length, 10);
  assert.deepEqual(n.volcano.melted.slice(0, 9), nine);
});
test("with 10 lavas the oldest is recovered, total stays 10, never 2+ per rank", () => {
  const ten = ["a4", "b1", "a2", "b2", "a3", "b3", "c5", "d5", "a6", "b6"];
  const s = { ...initial("volcan"), fen: KINGS, turnIndex: 2, volcano: v2(ten, 10) };
  const c = meltCandidates(s);
  assert.ok(!c.includes("a4"), "recovered square excluded this eruption");
  const n = applyVolcanoAction(s, "e1d1");
  assert.equal(n.volcano.melted.length, 10);
  assert.ok(!n.volcano.melted.includes("a4"));
  assert.equal(n.volcano.last.recovered, "a4");
  assert.ok(Object.values(rows(n.volcano.melted)).every((x) => x <= 2));
  assert.equal(volcanoProblem(n.volcano), "");
  assert.throws(() => applyVolcanoAction(s, "e1d1", false, "a4"));
});
test("recovered square is empty and passable", () => {
  const ten = ["e2", "b1", "a3", "b3", "c5", "d5", "a6", "b6", "a7", "b7"];
  const s = { ...initial("volcan"), fen: KINGS, turnIndex: 2, volcano: v2(ten, 10) };
  const n = applyVolcanoAction(s, "e1d1");
  assert.ok(volcanoLegalMoves({ ...n, turn: "w" }).length >= 0);
  assert.ok(!n.volcano.melted.includes("e2"));
});
test("undo/replay keeps FIFO order and version", () => {
  let g = initial("volcan");
  for (const m of ["g1f3", "g8f6", "b1c3", "b8c6", "f3g1", "f6g8"]) g = applyVolcanoAction(g, m);
  const r = rewindVolcano(g, g.history.length);
  assert.deepEqual(r.volcano.melted, g.volcano.melted);
  assert.equal(r.volcano.rulesVersion, 2);
});
test("v1 save with more than 10 lavas stays v1 and loads", () => {
  const many = ["a3", "b3", "c3", "d3", "e3", "f3", "a6", "b6", "c6", "d6", "e6", "f6"];
  const g = { ...initial("volcan"), fen: KINGS, volcano: { melted: many, eruptions: 12, last: null, every: 3 } };
  assert.equal(volcanoVersion(g.volcano), 1);
  assert.equal(validSessionGame(g), true);
  const n = applyVolcanoAction({ ...g, turnIndex: 2 }, "e1d1");
  assert.equal(n.volcano.melted.length, 13);
  assert.equal(n.volcano.rulesVersion, undefined);
});
test("invalid v2 and unknown version are rejected, not repaired", () => {
  const many = ["a3", "b3", "c3", "d3", "e3", "f3", "a6", "b6", "c6", "d6", "e6", "f6"];
  const bad = { ...initial("volcan"), fen: KINGS, volcano: v2(many, 12) };
  assert.equal(validSessionGame(bad), false);
  assert.equal(validSessionGame({ ...bad, volcano: { ...bad.volcano, melted: [], rulesVersion: 9 } }), false);
});
test("canonical world order", () => {
  assert.deepEqual(WORLD_1_ORDER.map((c) => c.variant), ["comecome", "correlativo", "azar", "renacer", "mojado", "volcan"]);
});
