/** Development spoilers and the scripted solution. Not used by the game UI. */

export const WALKTHROUGH = [
  { type: "TAKE", id: "satchel" },
  { type: "TAKE", id: "palm" },
  { type: "USE", itemId: "coconut", targetId: "basher" },
  { type: "USE", itemId: "oil", targetId: "locker" },
  { type: "USE", itemId: "brassKey", targetId: "postbox" },
  { type: "COMBINE", a: "rope", b: "spoon" },
  { type: "USE", itemId: "grapple", targetId: "well" },
  { type: "USE", itemId: "sunDisc", targetId: "lin" },
  { type: "LOOK", id: "sign" },
  { type: "DIAL", value: 3 },
  { type: "USE", itemId: "matches", targetId: "torch" },
  { type: "LOOK", id: "mural" },
  { type: "CODE", value: "1987" },
  { type: "USE", itemId: "clapper", targetId: "bell" },
  { type: "TALK", npcId: "pete", choiceId: "pass" },
  { type: "USE", itemId: "fuelCan", targetId: "boat" },
  { type: "USE", itemId: "starterHandle", targetId: "boat" },
  { type: "TALK", npcId: "mara", choiceId: "cast" },
];
