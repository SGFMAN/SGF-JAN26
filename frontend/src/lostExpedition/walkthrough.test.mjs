import assert from "node:assert/strict";
import { SAVE_KEY as ISLAND_KEY } from "../escapeIsland/logic.js";
import { SAVE_KEY as CLOCK_KEY } from "../clockwork/logic.js";
import { WALKTHROUGH } from "./spoilers.js";
import {
  BUILDINGS,
  HOTSPOTS,
  NPCS,
  PUZZLE_TOTAL,
  SAVE_KEY,
  SCALE,
  STAR_CODE,
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
assert.notEqual(SAVE_KEY, CLOCK_KEY);
assert.equal(PUZZLE_TOTAL, 30);
assert.equal(NPCS.length >= 8, true);
assert.ok(SCALE.doorHeight > 2 && SCALE.doorHeight < 2.6);
assert.ok(SCALE.doorWidth >= 2.4);
for (const building of BUILDINGS) {
  assert.ok(building.h >= 6.6, `${building.id} is not multi-storey`);
  assert.ok(building.door.width >= 2.4, `${building.id} door is narrow`);
}

const fresh = createGame(0);
assert.deepEqual(placementIssues(fresh), []);
const open = reachableHotspotIds(fresh);
const sealed = [
  "ledger",
  "fuse",
  "dynamo",
  "tunnelLamp",
  "railSwitch",
  "porter",
  "sergeant",
  "mosaic",
  "idol",
  "mirrorStand",
  "aqueduct",
  "seal",
  "chamberDoor",
  "lens",
  "chart",
  "gearBox",
  "domeLatch",
  "starWheel",
  "beacon",
  "signalTower",
  "astronomer",
];
const missing = HOTSPOTS.map((spot) => spot.id).filter((id) => !open.includes(id)).sort();
assert.deepEqual(missing, [...sealed].sort(), `unreachable at start: ${missing.join(",")}`);
for (const id of sealed) assert.ok(!open.includes(id));

assert.equal(clearLine(0, -100, 6, -102, fresh), true);
assert.equal(clearLine(0, -100, -100, 0, fresh), false);
assert.equal(clearLine(0, 100, 110, 80, fresh), false);

const wasted = reduce(after({ type: "TAKE", id: "pack" }), { type: "USE", itemId: "bridgePin", targetId: "jeep" });
assert.ok(wasted.state.inventory.includes("bridgePin"));

const earlyBridge = reduce(after({ type: "USE", itemId: "wrench", targetId: "jeep" }), { type: "USE", itemId: "bridgePin", targetId: "bridge" });
assert.notEqual(earlyBridge.state.flags.bridgePinned, true);

assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "outpostKey", targetId: "outpostDoor" })).includes("ledger"), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "fuseWire", targetId: "tunnelLamp" })).includes("railSwitch"), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "templeRubbing", targetId: "templeGate" })).includes("mosaic"), true);
assert.equal(reachableHotspotIds(after({ type: "USE", itemId: "climbingRope", targetId: "cliff" })).includes("lens"), true);

const beforeCode = after({ type: "LOOK", id: "chart" });
assert.equal(beforeCode.flags.chartRead, true);
assert.match(beforeCode.log, /seven.*two.*nine/i);
const badCode = reduce(beforeCode, { type: "CODE", value: "115" });
assert.notEqual(badCode.state.flags.starAligned, true);
assert.equal(reduce(beforeCode, { type: "CODE", value: STAR_CODE }).state.flags.starAligned, true);

const done = play(WALKTHROUGH);
assert.equal(done.flags.escaped, true);
assert.equal(puzzlesSolved(done), 30);
assert.ok(done.elapsedMs >= 0 || done.elapsedMs === 0);
assert.equal(after({ type: "USE", itemId: "expeditionLog", targetId: "radio" }).flags.escaped, undefined);

const tooSoon = reduce(after({ type: "USE", itemId: "cacheKey", targetId: "cache" }), { type: "TALK", npcId: "mara", choiceId: "leave" });
assert.notEqual(tooSoon.state.flags.escaped, true);

for (const npc of NPCS) {
  const node = dialogueFor(fresh, npc.id);
  assert.ok(node.text.length > 20, npc.id);
  assert.ok(node.choices.length >= 2, npc.id);
}

const hint = reduce(fresh, { type: "HINT" });
assert.ok(hint.hint.length > 20);
assert.doesNotMatch(hint.hint, new RegExp(STAR_CODE));

console.log(`lost expedition walkthrough ok (${HOTSPOTS.length} places, ${open.length} reachable at start, ${PUZZLE_TOTAL} puzzles)`);
