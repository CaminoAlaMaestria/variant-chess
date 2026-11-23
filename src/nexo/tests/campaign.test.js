import test from "node:test";
import assert from "node:assert/strict";
import { isNyxWin, recruitNyx, loadCampaign, saveCampaign, CAMPAIGN_KEY } from "../campaign.js";

const base = { prevResult: null, result: { winner: "w" }, mode: "bot", variant: "comecome", human: "w" };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("human win vs NYX with white counts", () => assert.equal(isNyxWin(base), true));
test("human win vs NYX with black counts", () => assert.equal(isNyxWin({ ...base, human: "b", result: { winner: "b" } }), true));
test("defeat does not count", () => assert.equal(isNyxWin({ ...base, result: { winner: "b" } }), false));
test("draw does not count", () => assert.equal(isNyxWin({ ...base, result: { winner: null } }), false));
test("local two-player game does not count", () => assert.equal(isNyxWin({ ...base, mode: "local" }), false));
test("other variant does not count", () => assert.equal(isNyxWin({ ...base, variant: "correlativo" }), false));
test("already finished game loaded does not count", () => assert.equal(isNyxWin({ ...base, prevResult: { winner: "w" } }), false));
test("recruiting twice grants one seal", () => {
  const a = recruitNyx(loadCampaign(mem()));
  const b = recruitNyx(a.campaign);
  assert.equal(a.granted, true); assert.equal(b.granted, false); assert.deepEqual(b.campaign.seals, ["nyx"]);
});
test("seal persists and session key untouched", () => {
  const s = mem(); s.setItem("nexo-session-v1", "X");
  assert.equal(saveCampaign(s, recruitNyx(loadCampaign(s)).campaign), true);
  assert.deepEqual(loadCampaign(s).seals, ["nyx"]); assert.equal(s.getItem("nexo-session-v1"), "X");
  assert.ok(s.getItem(CAMPAIGN_KEY));
});
test("blocked storage reports failure", () => {
  assert.equal(saveCampaign({ setItem() { throw new Error("quota"); }, getItem: () => null }, { version: 1, seals: ["nyx"], crew: [] }), false);
});
