import assert from "node:assert/strict";
import { ACTIONS, actionLabel, nextAction } from "./cursors.js";
import { ITEMS } from "./logic.js";
import { WALKTHROUGH } from "./spoilers.js";
import { createGame, reduce, puzzlesSolved } from "./logic.js";

assert.deepEqual(ACTIONS, ["walk", "look", "take", "use", "talk"]);
assert.equal(nextAction("walk"), "look");
assert.equal(nextAction("look"), "take");
assert.equal(nextAction("take"), "use");
assert.equal(nextAction("use"), "talk");
assert.equal(nextAction("talk"), "walk");
for (const action of ACTIONS) assert.ok(actionLabel(action).length > 2);

const itemIds = Object.keys(ITEMS);
assert.ok(itemIds.length >= 20);
assert.ok(itemIds.includes("mosaicSet"));
assert.ok(itemIds.includes("brassGear"));
assert.ok(itemIds.includes("fuseWire"));

let state = createGame(0);
for (const action of WALKTHROUGH) state = reduce(state, action).state;
assert.equal(state.flags.escaped, true);
assert.equal(puzzlesSolved(state), 30);

console.log(`lost expedition icons/cursor checks ok (${itemIds.length} items, ${ACTIONS.length} actions)`);
