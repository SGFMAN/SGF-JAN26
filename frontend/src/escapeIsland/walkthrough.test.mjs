import assert from "node:assert/strict";
import { WALKTHROUGH } from "./spoilers.js";
import {
  HOTSPOTS,
  createGame,
  dialogueFor,
  puzzlesSolved,
  reachableHotspotIds,
  reduce,
  terrainHeight,
} from "./logic.js";

function play(actions, start = createGame(0)) {
  let state = start;
  const lines = [];
  for (const action of actions) {
    const result = reduce(state, action);
    state = result.state;
    lines.push(result.line);
  }
  return { state, lines };
}

const fresh = createGame(0);
const openBefore = reachableHotspotIds(fresh);
for (const spot of HOTSPOTS) {
  const h = terrainHeight(spot.x, spot.z);
  assert.ok(h > 0.24, `${spot.id} is in the water (${h.toFixed(2)})`);
  if (spot.id === "torch" || spot.id === "mural") {
    assert.ok(!openBefore.includes(spot.id), `${spot.id} should be sealed at the start`);
  } else {
    assert.ok(openBefore.includes(spot.id), `${spot.id} cannot be reached`);
  }
}

const opened = reduce(fresh, { type: "DIAL", value: 3 }).state;
const openAfter = reachableHotspotIds(opened);
assert.ok(openAfter.includes("torch"), "torch stays sealed after the door opens");
assert.ok(openAfter.includes("mural"), "mural stays sealed after the door opens");

const done = play(WALKTHROUGH);
assert.equal(done.state.flags.escaped, true);
assert.equal(puzzlesSolved(done.state), 10);
assert.ok(done.state.flags.muralRead);
assert.ok(!done.state.inventory.includes("matches"));
assert.ok(!done.state.inventory.includes("oil"));

const early = play(WALKTHROUGH.slice(0, 8));
assert.notEqual(early.state.flags.escaped, true);
const refused = reduce(early.state, { type: "TALK", npcId: "mara", choiceId: "cast" });
assert.notEqual(refused.state.flags.escaped, true);

const satchel = reduce(fresh, { type: "TAKE", id: "satchel" }).state;
const wasted = reduce(satchel, { type: "USE", itemId: "matches", targetId: "plaque" });
assert.ok(wasted.state.inventory.includes("matches"));
const again = reduce(satchel, { type: "TAKE", id: "satchel" });
assert.equal(again.state.inventory.filter((id) => id === "matches").length, 1);

const wrongLock = reduce(done.state, { type: "CODE", value: "0000" });
assert.equal(wrongLock.state.flags.escaped, true);

const beforeLock = play(WALKTHROUGH.slice(0, 12)).state;
const badCode = reduce(beforeLock, { type: "CODE", value: "1999" });
assert.ok(!badCode.state.flags.generatorOpen);
assert.ok(!badCode.state.inventory.includes("fuelCan"));

for (const npc of ["pete", "lin", "mara"]) {
  const node = dialogueFor(fresh, npc);
  assert.ok(node.text.length > 20);
  assert.ok(node.choices.length >= 2);
}

const heights = HOTSPOTS.map((spot) => `${spot.id}:${terrainHeight(spot.x, spot.z).toFixed(2)}`);
console.log(`escape island walkthrough ok (${heights.length} places, ${openBefore.length} reachable at start)`);
