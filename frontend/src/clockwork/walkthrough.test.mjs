import assert from "node:assert/strict";
import { SAVE_KEY as ISLAND_KEY } from "../escapeIsland/logic.js";
import { WALKTHROUGH } from "./spoilers.js";
import {
  BUILDINGS,
  HOTSPOTS,
  NPCS,
  PUZZLE_TOTAL,
  SAVE_KEY,
  SCALE,
  STRIKE_CODE,
  clearLine,
  createGame,
  dialogueFor,
  placementIssues,
  puzzlesSolved,
  reachableHotspotIds,
  reduce,
} from "./logic.js";

function play(actions, start = createGame(0)) {
  let state = start;
  for (const action of actions) {
    state = reduce(state, action).state;
  }
  return state;
}

function after(match) {
  const index = WALKTHROUGH.findIndex((action) => Object.entries(match).every(([key, value]) => action[key] === value));
  assert.ok(index >= 0, `missing step ${JSON.stringify(match)}`);
  return play(WALKTHROUGH.slice(0, index + 1));
}

assert.notEqual(SAVE_KEY, ISLAND_KEY);
assert.equal(PUZZLE_TOTAL, 20);
assert.equal(NPCS.length >= 6, true);
assert.ok(SCALE.doorHeight > 2 && SCALE.doorHeight < 2.6);
assert.ok(SCALE.doorWidth >= 2.4);
for (const building of BUILDINGS) {
  assert.ok(building.h >= 6.6, `${building.id} is not multi-storey`);
  assert.ok(building.door.width >= 2.4, `${building.id} door is narrow`);
}

const fresh = createGame(0);
assert.deepEqual(placementIssues(fresh), []);
const open = reachableHotspotIds(fresh);
const sealed = ["coat", "hopper", "keytable", "plaque", "strike"];
const missing = HOTSPOTS.map((spot) => spot.id).filter((id) => !open.includes(id)).sort();
assert.deepEqual(missing, [...sealed].sort(), `unreachable at start: ${missing.join(",")}`);
for (const id of sealed) assert.ok(!open.includes(id));

assert.equal(clearLine(0, -20.5, 0, -32, fresh), true);
assert.equal(clearLine(-20, -32, 0, -32, fresh), false);
assert.equal(clearLine(0, 26, 0, 36.2, fresh), false);

const wasted = reduce(after({ type: "TAKE", id: "bag" }), { type: "USE", itemId: "chalk", targetId: "statue" });
assert.ok(wasted.state.inventory.includes("chalk"));

const earlySignal = reduce(after({ type: "USE", itemId: "ribbon", targetId: "parrot" }), { type: "USE", itemId: "whistle", targetId: "signal" });
assert.notEqual(earlySignal.state.flags.signalDropped, true);
assert.ok(earlySignal.state.inventory.includes("whistle"));

assert.equal(reachableHotspotIds(fresh).includes("coat"), false);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "roomKey", targetId: "roomdoor" })).includes("coat"), true);
assert.equal(reachableHotspotIds(after({ type: "TALK", npcId: "vesper", choiceId: "brass" })).includes("keytable"), true);
assert.equal(clearLine(0, 26, 0, 36.2, after({ type: "TALK", npcId: "vesper", choiceId: "brass" })), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "gasket", targetId: "valve" })).includes("hopper"), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "windingKey", targetId: "loftdoor" })).includes("plaque"), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "windingKey", targetId: "loftdoor" })).includes("strike"), true);

const beforeCode = after({ type: "LOOK", id: "plaque" });
assert.equal(beforeCode.flags.plaqueRead, true);
assert.match(beforeCode.log, /four, then one, then seven/i);
const badCode = reduce(beforeCode, { type: "CODE", value: "115" });
assert.notEqual(badCode.state.flags.strikeSet, true);
assert.equal(reduce(beforeCode, { type: "CODE", value: STRIKE_CODE }).state.flags.strikeSet, true);

const done = play(WALKTHROUGH);
assert.equal(done.flags.escaped, true);
assert.equal(puzzlesSolved(done), 20);
assert.ok(done.elapsedMs >= 0 || done.elapsedMs === 0);
assert.equal(after({ type: "USE", itemId: "whistle", targetId: "signal" }).flags.escaped, undefined);

const tooSoon = reduce(after({ type: "USE", itemId: "coal", targetId: "tender" }), { type: "TALK", npcId: "bram", choiceId: "board" });
assert.notEqual(tooSoon.state.flags.escaped, true);

for (const npc of NPCS) {
  const node = dialogueFor(fresh, npc.id);
  assert.ok(node.text.length > 20, npc.id);
  assert.ok(node.choices.length >= 2, npc.id);
}
assert.ok(dialogueFor(after({ type: "TALK", npcId: "odette", choiceId: "letter" }), "vesper").choices.some((choice) => choice.id === "brass"));
assert.ok(dialogueFor(after({ type: "TAKE", id: "blank" }), "ivo").choices.some((choice) => choice.id === "cut"));

const hint = reduce(fresh, { type: "HINT" });
assert.ok(hint.hint.length > 20);
assert.doesNotMatch(hint.hint, new RegExp(STRIKE_CODE));

console.log(`clockwork walkthrough ok (${HOTSPOTS.length} places, ${open.length} reachable at start, ${PUZZLE_TOTAL} puzzles)`);
