/** Escape Island rules. Pure data and state. No rendering. */

export const SAVE_KEY = "sgf-escape-island-v1";
export const PUZZLE_TOTAL = 10;

export const ITEMS = {
  matches: { name: "Matches", note: "A tin of matches. Damp at the edges, dry in the middle. Someone planned ahead, then fell in the sea." },
  spoon: { name: "Bent spoon", note: "A spoon with ambitions. The bowl is hooked like it once tried to be a tool." },
  coconut: { name: "Coconut", note: "Heavy, hairy, and full of something slippery." },
  oil: { name: "Coconut oil", note: "Pressed out of a coconut that did not deserve this. Smells like a holiday and a mechanic." },
  rope: { name: "Coiled rope", note: "Salt-stiff rope. Long enough to regret, short enough to carry." },
  brassKey: { name: "Brass key", note: "A small key with a parrot scratched into the bow. The parrot looks judgemental." },
  boardingPass: { name: "Boarding pass", note: "Laminated, sun-faded. PASSENGER: whoever finds this. VESSEL: The Gull. STATUS: still missing." },
  grapple: { name: "Spoon grapple", note: "A rope with a spoon tied on the end. It is ridiculous. It is also a hook." },
  sunDisc: { name: "Sun disc", note: "A brass disc painted with a sun. Warm from being important." },
  clapper: { name: "Bronze tongue", note: "The part of a bell that does the talking. Heavy, and slightly insulted to be called a tongue." },
  fuelCan: { name: "Fuel can", note: "Full. The label says RESORT USE ONLY, which is a generous description of today." },
  starterHandle: { name: "Starter handle", note: "The crank for a small launch. It has been used, recently, as a backscratcher." },
};

export const HOTSPOTS = [
  { id: "satchel", name: "Soaked satchel", x: 2, z: -31, r: 1.7 },
  { id: "palm", name: "Low palm", x: -9, z: -28, r: 1.7 },
  { id: "bottle", name: "Bottle in the sand", x: 7, z: -27, r: 1.4 },
  { id: "sign", name: "Dock sign", x: -15, z: -26, r: 1.6 },
  { id: "basher", name: "Flat stone", x: -18, z: -18, r: 1.7 },
  { id: "lifering", name: "Life ring", x: -24, z: -20, r: 1.5 },
  { id: "locker", name: "Rusted locker", x: -28, z: -14, r: 1.7 },
  { id: "pete", name: "Dockhand Pete", x: -24, z: -9, r: 1.8 },
  { id: "hammock", name: "Hammock", x: -20, z: -6, r: 1.5 },
  { id: "well", name: "Village well", x: 0, z: 1, r: 1.8 },
  { id: "postbox", name: "Post box", x: 9, z: -1, r: 1.6 },
  { id: "plaque", name: "Hotel plaque", x: -2, z: 9.76, r: 1.6 },
  { id: "generator", name: "Generator shed", x: 14, z: 6.85, r: 1.7 },
  { id: "lin", name: "Professor Lin", x: -14, z: 22, r: 1.8 },
  { id: "dial", name: "Stone dial", x: 19, z: 0, r: 1.7 },
  { id: "torch", name: "Wall torch", x: 30, z: 3.15, r: 1.6 },
  { id: "mural", name: "Cave mural", x: 35.8, z: 0, r: 1.8 },
  { id: "boat", name: "The launch", x: 11, z: 22, r: 3.6 },
  { id: "mara", name: "Mara Voss", x: 6, z: 28, r: 1.8 },
  { id: "bell", name: "Tide bell", x: 1.2, z: 30.2, r: 1.7 },
];

const PATHS = [
  [[0, -34], [0, 2]],
  [[0, 2], [19, 0]],
  [[0, 2], [-24, -9]],
  [[-9, -28], [-18, -18]],
  [[-18, -18], [-28, -14]],
  [[0, 2], [-14, 22]],
  [[0, 2], [6, 28]],
  [[6, 28], [2, 33]],
  [[6, 28], [11, 22]],
  [[0, 2], [14, 8]],
  [[0, 2], [9, -1]],
  [[0, 2], [-5, 9]],
  [[0, -34], [2, -31]],
  [[-15, -26], [-24, -9]],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToSegment(x, z, a, b) {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len = abx * abx + abz * abz || 1;
  let t = ((x - a[0]) * abx + (z - a[1]) * abz) / len;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + abx * t;
  const pz = a[1] + abz * t;
  return Math.hypot(x - px, z - pz);
}

function nearPath(x, z) {
  return PATHS.some(([a, b]) => distToSegment(x, z, a, b) < 2.7);
}

function nearImportant(x, z) {
  if (Math.hypot(x, z + 32) < 6) return true;
  return HOTSPOTS.some((h) => Math.hypot(h.x - x, h.z - z) < 4.2);
}

export function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  const shore = 46;
  if (d > shore + 5) return -2.4;
  let h = 0.48 + Math.max(0, 1 - d / shore) * 1.15;
  h += 4.2 * Math.exp(-((x - 1) ** 2) / 320 - ((z - 34) ** 2) / 240);
  h += 2.6 * Math.exp(-((x - 34) ** 2) / 220 - ((z - 18) ** 2) / 200);
  h -= 0.18 * Math.exp(-(x * x) / 140 - ((z - 2) ** 2) / 140);
  if (z < -20) {
    const t = Math.max(0, Math.min(1, (z + 44) / 24));
    h = 0.4 + (h - 0.4) * (0.35 + 0.65 * t);
  }
  if (d > shore) {
    const u = Math.max(0, Math.min(1, (d - shore) / 5));
    h = h * (1 - u) - 1.5 * u;
  }
  return h;
}

export function terrainHeight(x, z) {
  if (x > 23.4 && x < 40 && Math.abs(z) < 4.8) return rawHeight(20.6, 0);
  return rawHeight(x, z);
}

function makeProps() {
  const rand = mulberry32(481516);
  const props = [];
  let guard = 0;
  while (props.length < 26 && guard < 5000) {
    guard += 1;
    const x = (rand() * 2 - 1) * 40;
    const z = (rand() * 2 - 1) * 40;
    const h = terrainHeight(x, z);
    if (h < 0.55 || h > 4.6) continue;
    if (nearImportant(x, z) || nearPath(x, z)) continue;
    if (x > 20 && x < 42 && Math.abs(z) < 7) continue;
    props.push({ id: `tree${props.length}`, kind: "tree", x, z, r: 1, shade: rand() });
  }
  guard = 0;
  while (props.filter((p) => p.kind === "rock").length < 10 && guard < 4000) {
    guard += 1;
    const x = (rand() * 2 - 1) * 40;
    const z = (rand() * 2 - 1) * 40;
    const h = terrainHeight(x, z);
    if (h < 0.5 || h > 5) continue;
    if (nearImportant(x, z) || nearPath(x, z)) continue;
    if (x > 20 && x < 42 && Math.abs(z) < 7) continue;
    props.push({ id: `rock${props.length}`, kind: "rock", x, z, r: 0.7, shade: rand() });
  }
  const buildings = [
    { id: "hutA", kind: "hut", x: -7, z: -1, r: 2.9 },
    { id: "hutB", kind: "hut", x: 5, z: 5, r: 2.9 },
    { id: "hutC", kind: "hut", x: -2, z: 12, r: 2.7 },
    { id: "shed", kind: "shed", x: 14, z: 10.2, r: 2.55 },
    { id: "wreck", kind: "wreck", x: -31, z: -15, r: 2.1 },
    { id: "lightBase", kind: "tower", x: 1.2, z: 35.2, r: 2.15 },
  ];
  return [...buildings, ...props];
}

export const SOLIDS = makeProps();

const PLAYER_R = 0.36;

function inRect(x, z, minX, maxX, minZ, maxZ) {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

export function doorBlocks(x, z, state) {
  const west = inRect(x, z, 21.6, 24.7, -5.5, 5.5);
  const north = inRect(x, z, 21.6, 39.6, 4.15, 6.7);
  const south = inRect(x, z, 21.6, 39.6, -6.7, -4.15);
  const east = inRect(x, z, 37.3, 40.2, -6.7, 6.7);
  const gap = !!state?.flags?.caveOpen && inRect(x, z, 21.2, 25.2, -1.2, 1.2);
  if (gap) return false;
  return west || north || south || east;
}

export function blocked(x, z, state) {
  if (terrainHeight(x, z) < 0.24) return true;
  if (doorBlocks(x, z, state)) return true;
  for (const solid of SOLIDS) {
    const dx = x - solid.x;
    const dz = z - solid.z;
    const reach = solid.r + PLAYER_R;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}

export function canMove(x, z, nx, nz, state) {
  if (blocked(nx, nz, state)) return false;
  if (terrainHeight(nx, nz) - terrainHeight(x, z) > 0.82) return false;
  return true;
}

export function areaName(x, z) {
  if (x > 23 && Math.abs(z) < 5) return "The cave";
  if (z > 24 && x < 16) return "Lighthouse hill";
  if (x < -16 && z < -6) return "The wreck shore";
  if (x < -8 && z > 14) return "The ruins";
  if (Math.hypot(x, z - 2) < 16 && z > -12) return "Abandoned village";
  if (z < -18) return "South beach";
  return "The jungle";
}

function has(state, id) {
  return state.inventory.includes(id);
}

function pull(state, id) {
  const i = state.inventory.indexOf(id);
  if (i >= 0) state.inventory.splice(i, 1);
}

export function createGame(now = 0) {
  return {
    v: 1,
    startedAt: now,
    elapsedMs: 0,
    escapedAt: null,
    inventory: [],
    flags: {},
    journal: ["You woke on the sand. The sea has your boat and none of your answers."],
    hintGate: "",
    hintTier: 0,
    hintText: "",
    pose: { x: 0, z: -33, yaw: 0, camYaw: Math.PI, camPitch: 0.42, camDist: 4.8 },
    dial: 0,
    log: "Salt in your mouth. The island is quiet in the way of places that are waiting.",
  };
}

function clone(state) {
  return {
    ...state,
    inventory: [...state.inventory],
    flags: { ...state.flags },
    journal: [...state.journal],
    pose: { ...state.pose },
  };
}

function say(state, line, journal) {
  state.log = line;
  if (journal) state.journal.push(journal);
  return { state, line };
}

function keep(state, line) {
  return { state, line };
}

const LOOK = {
  satchel: "A satchel washed up beside you. The buckle still works. Something inside clinks.",
  palm: "A palm with one coconut low enough to steal. The others are showing off.",
  bottle: "A bottle. The note inside says: drink more water. It is signed, your dentist. The dentist is not on the island.",
  sign: "Three parrots, painted with more confidence than talent. Under them: PETE'S DOCK. FULL CREW.",
  basher: "A stone with a flat, scarred top. Things come here to be persuaded.",
  lifering: "A life ring from The Gull. The rope is gone. The optimism remains, which is worse.",
  locker: "A steel locker eaten by salt. The hinge would move if something slick asked it nicely.",
  pete: "Dockhand Pete. Sun-faded shirt, official posture, unofficial timeline. He looks thrilled and offended that you exist.",
  hammock: "A hammock worn into the shape of a very long break.",
  well: "A stone well. Something brass glints at the bottom, too far for an arm and too proud to jump.",
  postbox: "A resort post box. The slot is sealed with a tiny brass lock shaped like a parrot.",
  plaque: "HOTEL PARROT. The opening year has been polished blank. You can see a 19, and then a shine where the truth used to be.",
  generator: "A shed with a generator and a padlock. The generator is sulking. The padlock is the reason.",
  lin: "Professor Lin, khaki and sunburn, guarding a crate of things she refuses to call junk.",
  dial: "A stone dial beside a fitted door. Numbers run from 0 to 9. The door is listening.",
  torch: "A wall torch. Dry pitch. It has been waiting to be a clue.",
  mural: "Paint on stone, deeper in the dark.",
  boat: "Mara's launch, beached under the hill. It has a fuel mouth and an empty socket where a crank should turn.",
  mara: "Mara Voss. Navy coat, lighthouse eyes, the expression of a woman who has argued with the tide and won.",
  bell: "The tide bell. It is a bell in every way except the one that makes a noise. The tongue is missing.",
};

export function puzzleFlags(state) {
  return [
    state.flags.madeOil,
    state.flags.lockerOpen,
    state.flags.postOpen,
    state.flags.gotDisc,
    state.flags.linTraded,
    state.flags.caveOpen,
    state.flags.torchLit,
    state.flags.generatorOpen,
    state.flags.bellRung,
    state.flags.petePaid,
  ];
}

export function puzzlesSolved(state) {
  return puzzleFlags(state).filter(Boolean).length;
}

function itemName(id) {
  return ITEMS[id]?.name || hotspotById(id)?.name || "that";
}

export function hotspotById(id) {
  return HOTSPOTS.find((h) => h.id === id) || null;
}

function refusal(itemId, targetId) {
  const a = itemName(itemId);
  const b = itemName(targetId);
  return `The ${a.toLowerCase()} and the ${b.toLowerCase()} refuse to collaborate.`;
}

function currentGate(state) {
  const gates = [
    ["satchel", !state.flags.satchel],
    ["oil", !state.flags.madeOil],
    ["locker", !state.flags.lockerOpen],
    ["post", !state.flags.postOpen],
    ["well", !state.flags.gotDisc],
    ["lin", !state.flags.linTraded],
    ["cave", !state.flags.caveOpen],
    ["torch", !state.flags.torchLit],
    ["mural", !state.flags.muralRead],
    ["gen", !state.flags.generatorOpen],
    ["bell", !state.flags.bellRung],
    ["pete", !state.flags.petePaid],
    ["fuel", !state.flags.boatFueled],
    ["crank", !state.flags.handleFitted],
    ["mara", !state.flags.escaped],
  ];
  const actionable = {
    satchel: !state.flags.satchel,
    oil: !state.flags.madeOil,
    locker: !!state.flags.madeOil && !state.flags.lockerOpen,
    post: !!state.flags.lockerOpen && !state.flags.postOpen,
    well:
      (has(state, "rope") && has(state, "spoon") && !state.flags.gotDisc) ||
      (has(state, "grapple") && !state.flags.gotDisc),
    lin: has(state, "sunDisc") && !state.flags.linTraded,
    cave: !state.flags.caveOpen,
    torch: !!state.flags.caveOpen && !state.flags.torchLit,
    mural: !!state.flags.torchLit && !state.flags.muralRead,
    gen: !!state.flags.muralRead && !state.flags.generatorOpen,
    bell: has(state, "clapper") && !state.flags.bellRung,
    pete: has(state, "boardingPass") && !state.flags.petePaid,
    fuel: has(state, "fuelCan") && !state.flags.boatFueled,
    crank: has(state, "starterHandle") && !state.flags.handleFitted,
    mara: !!state.flags.bellRung && !!state.flags.boatFueled && !!state.flags.handleFitted && !state.flags.escaped,
  };
  for (const [id, unmet] of gates) {
    if (unmet && actionable[id]) return id;
  }
  for (const [id, unmet] of gates) {
    if (unmet) return id;
  }
  return "done";
}

const HINTS = {
  satchel: [
    "You arrived with less than you think. Look at what the sea returned.",
    "The soaked satchel on the south beach is not empty.",
    "Pick up the satchel. Keep what is inside.",
  ],
  oil: [
    "Something on the beach is full of grease, and something nearby likes breaking things.",
    "There is a low coconut, and a flat scarred stone toward the wreck.",
    "Pick the coconut from the low palm and use it on the flat stone.",
  ],
  locker: [
    "The wreck is holding a locker shut out of spite.",
    "The rusted locker on the wreck shore wants something slick.",
    "Use the coconut oil on the rusted locker.",
  ],
  post: [
    "The village still receives mail. It does not like to give it back.",
    "The post box has a small brass lock. You have already seen a key with a bird on it.",
    "Use the brass key on the village post box.",
  ],
  well: [
    "The well is showing off. Your rope is shy without a hook.",
    "Combine the coiled rope with the bent spoon, then visit the village well.",
    "Tie the spoon to the rope. Use that on the well.",
  ],
  lin: [
    "The woman at the ruins collects things and insults them.",
    "Professor Lin, in the ruins, will trade for what came out of the well.",
    "Give the sun disc to Professor Lin.",
  ],
  cave: [
    "A door on the east shore is waiting for a number of birds.",
    "Look at the dock sign, or ask Pete about his paintings. Then turn the stone dial.",
    "Set the stone dial to 3.",
  ],
  torch: [
    "The cave is open and still keeping a secret in the dark.",
    "There is a wall torch just inside the cave, and you have had dry matches since the beach.",
    "Use the matches on the wall torch.",
  ],
  mural: [
    "Now that you can see, look at the wall.",
    "The cave mural is the thing the torch was for.",
    "Look at the mural. Remember the year it gives you.",
  ],
  gen: [
    "The village generator is locked, and the plaque outside is a coward.",
    "The padlock on the generator shed wants the year you read in the cave.",
    "Enter 1987 on the generator lock.",
  ],
  bell: [
    "The tide bell above the launch is all costume and no voice.",
    "You are carrying the piece a bell needs. The bell is by the lighthouse.",
    "Use the bronze tongue on the tide bell.",
  ],
  pete: [
    "Pete has been waiting for a passenger since the last century ended.",
    "The boarding pass belongs in Pete's hands. He is by the wreck.",
    "Give the boarding pass to Dockhand Pete.",
  ],
  fuel: [
    "The launch is beached under the lighthouse and it is thirsty.",
    "Use the fuel can on the launch.",
    "Use the fuel can on the launch, on the sand below the lighthouse.",
  ],
  crank: [
    "The launch has a hole where a handle turns.",
    "Use the starter handle on the launch.",
    "Fit the starter handle on the launch.",
  ],
  mara: [
    "Mara is the one who decides when the sea is open.",
    "Talk to Mara at the lighthouse once the bell, the fuel, and the crank are done.",
    "Talk to Mara and tell her to cast off.",
  ],
  done: ["You are done.", "You are done.", "You are done."],
};

export function dialogueFor(state, npcId) {
  if (npcId === "pete") {
    const choices = [
      { id: "what", label: "What happened to the ship?" },
      { id: "work", label: "Is there any work going?" },
    ];
    if (has(state, "boardingPass") && !state.flags.petePaid) {
      choices.unshift({ id: "pass", label: "I found a boarding pass." });
    }
    choices.push({ id: "bye", label: "I'll leave you to the bollard." });
    const text = state.flags.petePaid
      ? "Pete salutes with the wrong hand. \"Passenger processed. Try not to sink the replacement boat. I am on my break.\""
      : "\"You're late,\" says Pete. \"The Gull was due in '98. I have been polishing this bollard ever since. It is very polished. I am very employed.\"";
    return { text, choices };
  }
  if (npcId === "lin") {
    const choices = [
      { id: "study", label: "What are you working on?" },
      { id: "cave", label: "Do you know the cave door?" },
    ];
    if (has(state, "sunDisc") && !state.flags.linTraded) {
      choices.unshift({ id: "trade", label: "I have the sun disc." });
    }
    choices.push({ id: "bye", label: "I'll let you catalogue the sand." });
    const text = state.flags.linTraded
      ? "\"The disc is genuine,\" Lin says, already bored of being pleased. \"If the bell still sulks, that is no longer my department.\""
      : "Professor Lin does not look up. \"If you are from the hotel, the minibar tab is still open and I am not paying it.\"";
    return { text, choices };
  }
  const choices = [{ id: "why", label: "Why won't you sail?" }];
  if (state.flags.bellRung && state.flags.boatFueled && state.flags.handleFitted) {
    choices.unshift({ id: "cast", label: "Cast off." });
  } else {
    choices.push({ id: "leave", label: "I need to leave." });
  }
  choices.push({ id: "bye", label: "Fair winds, then." });
  const text = state.flags.escaped
    ? "The launch is already gone. This is a memory with better lighting."
    : "Mara squints at the horizon as if it owes her money. \"The sea is closed.\"";
  return { text, choices };
}

function talk(state, npcId, choiceId) {
  const s = clone(state);
  if (npcId === "pete" && choiceId === "what") {
    s.flags.peteParrots = true;
    return say(s, "\"She sulked off the reef,\" Pete says. \"Left me the wreck, the locker, and three parrots I painted so the dock would look staffed. Three. I can count. The parrots cannot.\"");
  }
  if (npcId === "pete" && choiceId === "work") {
    return say(s, "\"Oil the locker if you want what's in it. I am on my break.\" He considers. \"I have been on my break since the parrots were wet.\"");
  }
  if (npcId === "pete" && choiceId === "pass") {
    if (!has(s, "boardingPass") || s.flags.petePaid) return keep(state, "Pete has already processed you, in his fashion.");
    pull(s, "boardingPass");
    s.inventory.push("starterHandle");
    s.flags.petePaid = true;
    return say(
      s,
      "Pete's eyes go bright and damp. \"A passenger.\" He presses a metal crank into your hands. \"Starter handle. I was scratching my back with it. The launch under the light still needs it. Welcome aboard. You are late.\"",
      "Pete accepted the boarding pass and surrendered the starter handle."
    );
  }
  if (npcId === "pete" && choiceId === "bye") return say(s, "Pete returns to the bollard. The bollard does not thank him.");
  if (npcId === "lin" && choiceId === "study") {
    return say(s, "\"A bronze tongue,\" she says, patting her crate. \"Bell hardware. Heavy. Uncatalogued. I will trade it for the sun disc in the well. The well is shy. It likes a hook.\"");
  }
  if (npcId === "lin" && choiceId === "cave") {
    s.flags.linCave = true;
    return say(s, "\"The east door counts parrots,\" Lin says. \"Pete's parrots. I do not do birds. I do bronze, and I do trades.\"");
  }
  if (npcId === "lin" && choiceId === "trade") {
    if (!has(s, "sunDisc") || s.flags.linTraded) return keep(state, "Lin has nothing new to trade.");
    pull(s, "sunDisc");
    s.inventory.push("clapper");
    s.flags.linTraded = true;
    return say(
      s,
      "Lin swaps you a heavy bronze tongue for the disc, already writing a label. \"Uncatalogued bell part. Do not lick it. Hang it where a bell is being dramatic.\"",
      "Lin traded a bronze tongue for the sun disc."
    );
  }
  if (npcId === "lin" && choiceId === "bye") return say(s, "\"Mind the sand,\" Lin says. \"It gets in the footnotes.\"");
  if (npcId === "mara" && choiceId === "why") {
    return say(s, "\"My mother said a silent bell means the tide is a liar. The launch needs a drink, and the crank has to be in its hole. Then I sail. I do not sail for vibes.\"");
  }
  if (npcId === "mara" && choiceId === "leave") {
    return say(s, "\"Not yet. Bell singing. Tank full. Crank home. Any order. I am flexible. The sea is not, and neither is my mother.\"");
  }
  if (npcId === "mara" && choiceId === "cast") {
    if (!(s.flags.bellRung && s.flags.boatFueled && s.flags.handleFitted)) {
      return keep(state, "Mara plants her boots. \"The sea is still closed.\"");
    }
    s.flags.escaped = true;
    s.escapedAt = s.elapsedMs;
    return say(
      s,
      "Mara hears the bell in her memory, checks the launch like a hawk with a checklist, and shoves off. The island shrinks to a bad decision with palm trees. You are away.",
      "Mara cast off. The island let you go."
    );
  }
  if (npcId === "mara" && choiceId === "bye") return say(s, "\"Don't feed the tide,\" Mara says, which is either advice or a threat.");
  return keep(state, "They have nothing to add to that.");
}

function applyItem(state, itemId, targetId) {
  if (!has(state, itemId)) return keep(state, "You are not holding that.");
  const s = clone(state);

  if (itemId === "coconut" && targetId === "basher") {
    pull(s, "coconut");
    s.inventory.push("oil");
    s.flags.madeOil = true;
    return say(s, "You crack the coconut on the flat stone. Oil pools in the shell, golden and slightly smug.", "A coconut became oil on the flat stone.");
  }
  if (itemId === "oil" && targetId === "locker") {
    if (s.flags.lockerOpen) return keep(state, "The locker is already open. It is not grateful.");
    pull(s, "oil");
    s.inventory.push("rope", "brassKey");
    s.flags.lockerOpen = true;
    return say(s, "The oil eats the rust. Inside: a coil of rope, and a brass key with a parrot on it.", "The locker gave up a rope and a brass key.");
  }
  if (itemId === "brassKey" && targetId === "postbox") {
    if (s.flags.postOpen) return keep(state, "The post box has already surrendered.");
    pull(s, "brassKey");
    s.inventory.push("boardingPass");
    s.flags.postOpen = true;
    return say(s, "The parrot lock turns. Inside is one laminated boarding pass for The Gull, addressed to whoever finds it.", "The post box held a boarding pass.");
  }
  if (itemId === "grapple" && targetId === "well") {
    if (s.flags.gotDisc) return keep(state, "The well is empty of brass. It still has an echo.");
    pull(s, "grapple");
    s.inventory.push("sunDisc");
    s.flags.gotDisc = true;
    return say(s, "The spoon clinks, bites, and comes up with a brass sun disc. The well makes a noise like a sulk.", "The well gave up a sun disc.");
  }
  if ((itemId === "sunDisc" && targetId === "lin") || (itemId === "boardingPass" && targetId === "pete")) {
    return talk(state, targetId, itemId === "sunDisc" ? "trade" : "pass");
  }
  if (itemId === "matches" && targetId === "torch") {
    if (!s.flags.caveOpen) return keep(state, "You are waving matches at a shut door. The door is not flammable. Unfortunately.");
    if (s.flags.torchLit) return keep(state, "The torch is already doing its job.");
    pull(s, "matches");
    s.flags.torchLit = true;
    return say(s, "The pitch catches. The cave fills with a rude, useful light.", "The cave torch is lit.");
  }
  if (itemId === "clapper" && targetId === "bell") {
    if (s.flags.bellRung) return keep(state, "The bell has already said its piece.");
    pull(s, "clapper");
    s.flags.bellRung = true;
    return say(s, "You hang the tongue. The bell rings once, low and pleased, and the whole hill seems to stand up straighter.", "The tide bell can sing.");
  }
  if (itemId === "fuelCan" && targetId === "boat") {
    if (s.flags.boatFueled) return keep(state, "The tank is full. More fuel would be showing off.");
    pull(s, "fuelCan");
    s.flags.boatFueled = true;
    return say(s, "The launch drinks. The gauge, a stick Mara trusts, says yes.", "The launch has fuel.");
  }
  if (itemId === "starterHandle" && targetId === "boat") {
    if (s.flags.handleFitted) return keep(state, "The crank is already home.");
    pull(s, "starterHandle");
    s.flags.handleFitted = true;
    return say(s, "The handle seats in the socket with a click that sounds like a decision.", "The starter handle is fitted.");
  }
  if (itemId === "rope" && targetId === "well") return keep(state, "The rope flops into the well and comes back educated but empty. It needs a hook.");
  if (itemId === "spoon" && targetId === "well") return keep(state, "You are not spooning a well. Not without a rope to believe in.");
  if (itemId === "clapper" && targetId === "mara") return keep(state, "\"Hang it in the bell,\" Mara says. \"Not on me.\"");
  if (itemId === "fuelCan" && targetId === "mara") return keep(state, "\"The boat drinks,\" Mara says. \"I do not.\"");
  return keep(state, refusal(itemId, targetId));
}

export function reduce(state, action) {
  if (!state) return keep(createGame(0), "");
  if (state.flags.escaped && action.type !== "TICK" && action.type !== "POSE") {
    return keep(state, state.log);
  }
  if (action.type === "TICK") {
    const s = clone(state);
    const now = action.now ?? 0;
    const prev = action.prev ?? now;
    s.elapsedMs += Math.max(0, now - prev);
    return { state: s, line: s.log };
  }
  if (action.type === "POSE") {
    const s = clone(state);
    s.pose = { ...s.pose, ...action.pose };
    return { state: s, line: s.log };
  }
  if (action.type === "LOOK") {
    const s = clone(state);
    if (action.id === "sign") s.flags.sawSign = true;
    if (action.id === "mural") {
      if (!s.flags.caveOpen) return keep(state, "The cave door is shut. The mural can wait. It has practised.");
      if (!s.flags.torchLit) return keep(state, "Too dark. Something is written on the wall, and the dark is keeping it.");
      s.flags.muralRead = true;
      return say(s, "A painted sun, a painted bell, and words scratched under them: the generator remembers nineteen eighty-seven, and not a guest since.", "The mural named a year.");
    }
    if (action.id === "dial" && s.flags.caveOpen) {
      return say(s, "The dial rests on three. The door has given up arguing.");
    }
    if (action.id === "palm" && s.flags.coconutTaken) {
      return say(s, "The low branch is bare. The other coconuts pretend they were never involved.");
    }
    if (action.id === "locker" && s.flags.lockerOpen) {
      return say(s, "An open locker. It smells like rope, oil, and a job finished.");
    }
    if (action.id === "generator" && s.flags.generatorOpen) {
      return say(s, "The padlock hangs open. The generator looks unemployed.");
    }
    return say(s, LOOK[action.id] || "You look. The island looks back, which is rude.");
  }
  if (action.type === "TAKE") {
    const s = clone(state);
    if (action.id === "satchel") {
      if (s.flags.satchel) return keep(state, "The satchel is empty. It has done its one job.");
      s.flags.satchel = true;
      s.inventory.push("matches", "spoon");
      return say(s, "In the satchel: a tin of matches, dry in the middle, and a spoon bent like it had a plan.", "The satchel held matches and a bent spoon.");
    }
    if (action.id === "palm") {
      if (s.flags.coconutTaken) return keep(state, "You already stole the reachable one.");
      s.flags.coconutTaken = true;
      s.inventory.push("coconut");
      return say(s, "You twist the coconut free. The palm rustles like a gossip.", "You took a coconut.");
    }
    return keep(state, "That stays where it is. The island is not a shop.");
  }
  if (action.type === "COMBINE") {
    const { a, b } = action;
    if (a === b) return keep(state, "You cannot combine a thing with its own ego.");
    if (!has(state, a) || !has(state, b)) return keep(state, "You do not have both of those.");
    const pair = [a, b].sort().join("+");
    if (pair === "rope+spoon") {
      const s = clone(state);
      pull(s, "rope");
      pull(s, "spoon");
      s.inventory.push("grapple");
      return say(s, "You lash the bent spoon to the rope. It is a grapple. It is also, unfortunately, still a spoon.", "The rope and the spoon became a hook.");
    }
    return keep(state, `${itemName(a)} and ${itemName(b)} look at each other and decide to remain strangers.`);
  }
  if (action.type === "USE") return applyItem(state, action.itemId, action.targetId);
  if (action.type === "TALK") return talk(state, action.npcId, action.choiceId);
  if (action.type === "DIAL") {
    const value = Number(action.value);
    const s = clone(state);
    if (!Number.isInteger(value) || value < 0 || value > 9) return keep(state, "The dial only understands a single digit.");
    s.dial = value;
    if (value === 3) {
      s.flags.caveOpen = true;
      return say(s, "The dial settles on three. Stone grinds, and the cave door opens like it was tired of the job.", "The cave door opened.");
    }
    return say(s, `You set the dial to ${value}. The door does not care for that number.`);
  }
  if (action.type === "CODE") {
    const code = String(action.value ?? "").trim();
    if (state.flags.generatorOpen) return keep(state, "The lock is already open.");
    if (code !== "1987") return keep(state, "The lock stays shut. It does not do hints.");
    const s = clone(state);
    s.flags.generatorOpen = true;
    s.inventory.push("fuelCan");
    return say(s, "1987. The padlock clicks like a reunion. A full fuel can sits where the resort left its last good idea.", "The generator lock opened. You took the fuel can.");
  }
  if (action.type === "HINT") {
    const gate = currentGate(state);
    const s = clone(state);
    if (gate !== s.hintGate) {
      s.hintGate = gate;
      s.hintTier = 1;
    } else {
      s.hintTier = Math.min(3, (s.hintTier || 0) + 1);
    }
    const tier = Math.max(0, s.hintTier - 1);
    s.hintText = HINTS[gate]?.[tier] || "Keep looking. The island is bad at hiding things from the stubborn.";
    return { state: s, line: s.log, hint: s.hintText };
  }
  return keep(state, state.log);
}

export function canTake(state, id) {
  if (id === "satchel") return !state.flags.satchel;
  if (id === "palm") return !state.flags.coconutTaken;
  return false;
}

export function verbsFor(state, id) {
  const spot = hotspotById(id);
  if (!spot) return [];
  const verbs = [{ id: "look", label: "Look" }];
  if (canTake(state, id)) verbs.push({ id: "take", label: "Pick up" });
  if (id === "pete" || id === "lin" || id === "mara") verbs.push({ id: "talk", label: "Talk" });
  if (id === "dial" && !state.flags.caveOpen) verbs.push({ id: "operate", label: "Turn dial" });
  if (id === "generator" && !state.flags.generatorOpen) verbs.push({ id: "operate", label: "Try lock" });
  return verbs;
}

export function reachableHotspotIds(state) {
  const step = 1.1;
  const min = -48;
  const max = 48;
  const startX = state.pose?.x ?? 0;
  const startZ = state.pose?.z ?? -33;
  const toKey = (x, z) => `${Math.round(x / step)}:${Math.round(z / step)}`;
  const seen = new Set();
  const q = [[startX, startZ]];
  seen.add(toKey(startX, startZ));
  const visited = [[startX, startZ]];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of dirs) {
      const nx = x + dx * step;
      const nz = z + dz * step;
      if (nx < min || nz < min || nx > max || nz > max) continue;
      const key = toKey(nx, nz);
      if (seen.has(key)) continue;
      if (!canMove(x, z, nx, nz, state)) continue;
      seen.add(key);
      q.push([nx, nz]);
      visited.push([nx, nz]);
    }
  }
  const found = [];
  for (const spot of HOTSPOTS) {
    const close = visited.some(([x, z]) => Math.hypot(x - spot.x, z - spot.z) <= Math.max(spot.r, 1.6));
    if (close) found.push(spot.id);
  }
  return found;
}
