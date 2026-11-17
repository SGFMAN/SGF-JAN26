/** The Lost Expedition. Pure rules. No rendering. */

export const SAVE_KEY = "sgf-lost-expedition-v1";
export const PUZZLE_TOTAL = 30;
export const STAR_CODE = "729";
export const WALL_THICK = 0.5;
export const SCALE = {
  player: 1.7,
  doorHeight: 2.35,
  doorWidth: 2.8,
  table: 0.76,
  chair: 0.46,
  counter: 0.92,
  bench: 0.9,
  storey: 3.35,
};

const PLAYER_R = 0.36;

export const NPCS = [
  { id: "mara", name: "Dr Mara Okonkwo", x: -4, z: -94, r: 1.8, yaw: 0.4 },
  { id: "rex", name: "Radio operator Rex", x: 2, z: -90, r: 1.8, yaw: Math.PI },
  { id: "sven", name: "Mechanic Sven", x: 22, z: -92, r: 1.8, yaw: -Math.PI / 2 },
  { id: "cook", name: "Camp cook Nia", x: -18, z: -98, r: 1.8, yaw: Math.PI / 2 },
  { id: "eli", name: "Ferryman Eli", x: -32, z: -72, r: 1.8, yaw: 0.2 },
  { id: "sergeant", name: "Sergeant Hale", x: -98, z: 22, r: 1.8, yaw: Math.PI / 2 },
  { id: "priest", name: "Curator Imani", x: 2, z: 84, r: 1.8, yaw: Math.PI },
  { id: "astronomer", name: "Dr Weiss", x: 108, z: 82, r: 1.8, yaw: -0.6 },
  { id: "porter", name: "Warehouse porter Jun", x: -98, z: -2, r: 1.8, yaw: 0 },
];

const PLACES = [
  { id: "pack", name: "Supply pack", x: 6, z: -102, r: 1.6 },
  { id: "radio", name: "Field radio", x: 0, z: -96, r: 1.6 },
  { id: "jeep", name: "Survey jeep", x: 24, z: -104, r: 2.2 },
  { id: "cache", name: "Buried cache", x: 10, z: -88, r: 1.6 },
  { id: "trailA", name: "North trail marker", x: 0, z: -78, r: 1.4 },
  { id: "ferry", name: "River crossing", x: -32, z: -72, r: 1.8 },
  { id: "bridge", name: "Rope bridge", x: -48, z: -58, r: 1.7 },
  { id: "trailB", name: "West trail marker", x: -68, z: -38, r: 1.4 },
  { id: "outpostDoor", name: "Outpost gate", x: -84, z: -8, r: 1.7 },
  { id: "ledger", name: "Mission ledger", x: -98, z: 20, r: 1.6 },
  { id: "fuse", name: "Fuse box", x: -100, z: -22, r: 1.5 },
  { id: "dynamo", name: "Hand dynamo", x: -100, z: 1, r: 1.6 },
  { id: "tunnelLamp", name: "Tunnel lamp", x: -98, z: 18, r: 1.6 },
  { id: "railSwitch", name: "Rail switch", x: -100, z: 24, r: 1.7 },
  { id: "trailC", name: "Temple trail marker", x: -40, z: 62, r: 1.4 },
  { id: "templeGate", name: "Temple gate", x: 0, z: 88, r: 1.8 },
  { id: "mosaic", name: "Floor mosaic", x: 0, z: 100, r: 1.7 },
  { id: "idol", name: "Stone idol", x: -4, z: 104, r: 1.6 },
  { id: "mirrorStand", name: "Mirror niche", x: 6, z: 96, r: 1.5 },
  { id: "aqueduct", name: "Dry aqueduct", x: -8, z: 108, r: 1.6 },
  { id: "seal", name: "Chamber seal", x: 0, z: 102, r: 1.5 },
  { id: "chamberDoor", name: "Inner chamber", x: 0, z: 104, r: 1.6 },
  { id: "cliff", name: "Observatory cliff", x: 88, z: 70, r: 1.8 },
  { id: "lens", name: "Brass lens", x: 110, z: 82, r: 1.5 },
  { id: "chart", name: "Star chart", x: 108, z: 86, r: 1.6 },
  { id: "gearBox", name: "Gear housing", x: 112, z: 80, r: 1.6 },
  { id: "domeLatch", name: "Dome latch", x: 110, z: 88, r: 1.5 },
  { id: "starWheel", name: "Alignment wheel", x: 110, z: 84, r: 1.6 },
  { id: "beacon", name: "Summit beacon", x: 114, z: 76, r: 1.7 },
  { id: "signalTower", name: "Signal mast", x: 130, z: 76, r: 1.7 },
  { id: "trailD", name: "East ridge marker", x: 52, z: 88, r: 1.4 },
  { id: "workbench", name: "Work bench", x: 24, z: -96, r: 1.5 },
  { id: "wrenchSpot", name: "Tool peg", x: 26, z: -98, r: 1.4 },
];

export const HOTSPOTS = [
  ...NPCS.map(({ id, name, x, z, r }) => ({ id, name, x, z, r })),
  ...PLACES,
];

export const NPC_SPOTS = Object.fromEntries(NPCS.map((npc) => [npc.id, [npc.x, npc.z, npc.yaw]]));

export const BUILDINGS = [
  {
    id: "radioHut",
    name: "RADIO HUT",
    minX: -7,
    maxX: 7,
    minZ: -104,
    maxZ: -88,
    h: 6.8,
    door: { wall: "maxZ", center: 0, width: 2.8 },
    open: () => true,
  },
  {
    id: "workshop",
    name: "WORKSHOP",
    minX: 14,
    maxX: 32,
    minZ: -108,
    maxZ: -90,
    h: 7.2,
    door: { wall: "minZ", center: 23, width: 2.8 },
    open: () => true,
  },
  {
    id: "warehouse",
    name: "WAREHOUSE",
    minX: -112,
    maxX: -88,
    minZ: -6,
    maxZ: 8,
    h: 8.4,
    door: { wall: "maxX", center: 1, width: 2.8 },
    open: (s) => !!s?.flags?.outpostDoor,
  },
  {
    id: "watchtower",
    name: "WATCHTOWER",
    minX: -108,
    maxX: -92,
    minZ: -30,
    maxZ: -14,
    h: 10.2,
    door: { wall: "maxZ", center: -100, width: 2.8 },
    open: (s) => !!s?.flags?.outpostDoor,
  },
  {
    id: "office",
    name: "OUTPOST OFFICE",
    minX: -112,
    maxX: -88,
    minZ: 12,
    maxZ: 28,
    h: 7.6,
    door: { wall: "maxX", center: 20, width: 2.8 },
    open: (s) => !!s?.flags?.outpostDoor,
  },
  {
    id: "templeHall",
    name: "TEMPLE HALL",
    minX: -12,
    maxX: 12,
    minZ: 90,
    maxZ: 110,
    h: 9.8,
    door: { wall: "minZ", center: 0, width: 2.8 },
    open: (s) => !!s?.flags?.templeGate,
  },
  {
    id: "observatory",
    name: "OBSERVATORY",
    minX: 98,
    maxX: 118,
    minZ: 72,
    maxZ: 92,
    h: 11.4,
    door: { wall: "minZ", center: 108, width: 2.8 },
    open: (s) => !!s?.flags?.ropeClimbed,
  },
  {
    id: "caveStation",
    name: "CAVE STATION",
    minX: 122,
    maxX: 138,
    minZ: 66,
    maxZ: 86,
    h: 6.8,
    door: { wall: "minX", center: 76, width: 2.8 },
    open: (s) => !!s?.flags?.chamberOpen,
  },
];

export const PARTITIONS = [
  {
    id: "chamber",
    minX: -8,
    maxX: 8,
    z: 103.2,
    thickness: 0.5,
    doorCenter: 0,
    doorWidth: 2.6,
    open: (s) => !!s?.flags?.chamberOpen,
  },
  {
    id: "tunnel",
    minX: -86,
    maxX: -72,
    z: 12,
    thickness: 0.5,
    doorCenter: -79,
    doorWidth: 2.8,
    open: (s) => !!s?.flags?.tunnelLit,
  },
];

export const SOLIDS = [
  { id: "westGate", x: -58, z: -52, r: 1.35 },
  { id: "tentA", x: -8, z: -103, r: 1.15 },
  { id: "tentB", x: 5, z: -104, r: 1.05 },
  { id: "cookpit", x: -14, z: -100, r: 0.55 },
  { id: "jeepBlock", x: 20, z: -106, r: 1.1 },
  { id: "totem", x: -2, z: -88, r: 0.5 },
  { id: "tree1", x: -20, z: -82, r: 0.42 },
  { id: "tree2", x: 18, z: -68, r: 0.4 },
  { id: "tree3", x: -55, z: -48, r: 0.45 },
  { id: "tree4", x: -72, z: 28, r: 0.42 },
  { id: "tree5", x: 24, z: 72, r: 0.4 },
  { id: "tree6", x: 72, z: 82, r: 0.45 },
];

export const ITEMS = {
  rations: { name: "Field rations", note: "Dry biscuits and a tin cup. The cup has someone's initials scratched inside." },
  radioCrystal: { name: "Tuning crystal", note: "A quartz slug marked with a frequency band. Rex would know what to do with it." },
  oilFlask: { name: "Machine oil", note: "A small flask. Smells like the workshop and better decisions." },
  coins: { name: "Trade coins", note: "Three brass tokens stamped with a river boat. Eli collects these at crossings." },
  bridgePin: { name: "Bridge pin", note: "A steel pin with a red tag: REPLACE AFTER CROSSING." },
  outpostKey: { name: "Outpost key", note: "Tagged OUTPOST WEST. The teeth look recently cut." },
  charcoal: { name: "Charcoal stick", note: "For copying ledgers without stealing them. Nia uses it on recipe cards." },
  wrench: { name: "Spanner wrench", note: "Heavy, scarred, and exactly the size Sven's jeep expects." },
  dynamoCrank: { name: "Dynamo crank", note: "Folds flat. Jun keeps one on every shelf in case the lights sulk." },
  lantern: { name: "Oil lantern", note: "Empty until someone feeds it. The wick remembers fire." },
  railToken: { name: "Switch token", note: "Brass disk: TURN ONLY AFTER TUNNEL LIGHT. Hale's handwriting." },
  templeRubbing: { name: "Temple rubbing", note: "Three tile shapes copied from the ledger margin. Order matters in old places." },
  mosaicA: { name: "Sun tile", note: "A ceramic shard painted with a rising sun." },
  mosaicB: { name: "River tile", note: "A ceramic shard with a blue zigzag." },
  mosaicC: { name: "Star tile", note: "A ceramic shard with a single bright point." },
  mosaicSet: { name: "Matched mosaic", note: "Sun, river, star. The temple floor has empty sockets in that order." },
  goldenIdol: { name: "Small idol", note: "Stone, not gold. Warm anyway. The chamber wanted it back; you disagree." },
  bronzeMirror: { name: "Bronze mirror", note: "Tarnished enough to be honest. The niche expects a reflection at noon." },
  channelStone: { name: "Channel stone", note: "A wedge cut to redirect water. The aqueduct is dry but not finished." },
  sealPick: { name: "Seal pick", note: "A narrow chisel. Imani lent it with a look that said do not drop it." },
  chamberKey: { name: "Chamber key", note: "Bone handle, iron teeth. It came from inside the idol's base." },
  climbingRope: { name: "Climbing rope", note: "Fifty metres, coil-tied. The cliff route is real if you believe in knots." },
  starLens: { name: "Star lens", note: "Ground glass in a brass ring. Weiss calls it the night's eye." },
  brassGear: { name: "Brass gear", note: "Forty-two teeth. The observatory box hums when you hold it nearby." },
  signalFlare: { name: "Signal flare", note: "One shot. Mara said save it until the sky and the radio agree." },
  cacheKey: { name: "Cache key", note: "Tied with expedition twine. The buried box behind camp still waits." },
  expeditionLog: { name: "Expedition log", note: "Every puzzle solved, every trail mapped. Mara needs this to call the rescue." },
  fuseWire: { name: "Spare fuse", note: "Glass tube, thin wire. The watchtower box was missing one." },
};

function has(state, id) {
  return state.inventory.includes(id);
}

function pull(state, id) {
  const index = state.inventory.indexOf(id);
  if (index >= 0) state.inventory.splice(index, 1);
}

export function createGame(now = 0) {
  return {
    v: 1,
    startedAt: now,
    elapsedMs: 0,
    escapedAt: null,
    inventory: [],
    flags: {},
    journal: ["The jungle swallowed the last supply drop. Mara says the expedition is still recoverable if you walk the trails in the right order."],
    hintGate: "",
    hintTier: 0,
    hintText: "",
    pose: { x: 0, z: -100, yaw: 0, camYaw: Math.PI, camPitch: 0.42, camDist: 4.8 },
    log: "Camp smoke, radio static, and a jeep that will not start. The map on the table has four zones circled in red.",
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

export function hotspotById(id) {
  return HOTSPOTS.find((spot) => spot.id === id) || null;
}

function itemName(id) {
  return ITEMS[id]?.name || hotspotById(id)?.name || "that";
}

function refusal(itemId, targetId) {
  return `${itemName(itemId)} and ${itemName(targetId)} consider the idea, and decline.`;
}

export function terrainHeight() {
  return 0;
}

function inWallSlab(x, z, minX, maxX, minZ, maxZ, door, open) {
  const t = WALL_THICK;
  const shells = [
    { wall: "minZ", hit: z >= minZ && z <= minZ + t && x >= minX && x <= maxX, along: x },
    { wall: "maxZ", hit: z <= maxZ && z >= maxZ - t && x >= minX && x <= maxX, along: x },
    { wall: "minX", hit: x >= minX && x <= minX + t && z >= minZ && z <= maxZ, along: z },
    { wall: "maxX", hit: x <= maxX && x >= maxX - t && z >= minZ && z <= maxZ, along: z },
  ];
  for (const shell of shells) {
    if (!shell.hit) continue;
    if (door && open && door.wall === shell.wall && Math.abs(shell.along - door.center) <= door.width / 2) continue;
    return true;
  }
  return false;
}

export function blocked(x, z, state) {
  if (Math.abs(x) > 140 || Math.abs(z) > 140) return true;
  for (const solid of SOLIDS) {
    if (solid.id === "jeepBlock" && state?.flags?.jeepStarted) continue;
    if (solid.id === "westGate" && state?.flags?.bridgePinned) continue;
    const dx = x - solid.x;
    const dz = z - solid.z;
    const reach = solid.r + PLAYER_R;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  for (const building of BUILDINGS) {
    if (inWallSlab(x, z, building.minX, building.maxX, building.minZ, building.maxZ, building.door, !!building.open?.(state))) {
      return true;
    }
  }
  for (const wall of PARTITIONS) {
    const half = wall.thickness / 2;
    if (x < wall.minX || x > wall.maxX) continue;
    if (z < wall.z - half || z > wall.z + half) continue;
    if (wall.open?.(state) && Math.abs(x - wall.doorCenter) <= wall.doorWidth / 2) continue;
    return true;
  }
  return false;
}

export function canMove(x, z, nx, nz, state) {
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (blocked(x + (nx - x) * t, z + (nz - z) * t, state)) return false;
  }
  return true;
}

export function clearLine(x, z, tx, tz, state) {
  const dist = Math.hypot(tx - x, tz - z);
  const steps = Math.max(1, Math.ceil(dist / 0.4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blocked(x + (tx - x) * t, z + (tz - z) * t, state)) return false;
  }
  return true;
}

export function areaName(x, z) {
  if (x > 98 && z > 70 && z < 94) return "Observatory ridge";
  if (x > 116 && z > 64 && z < 88) return "Cave station";
  if (x > -14 && x < 14 && z > 88 && z < 112) return "Temple precinct";
  if (x < -88 && z > 10 && z < 30) return "Outpost office";
  if (x < -88 && z > -30 && z < -8) return "Watchtower";
  if (x < -88 && z > -14 && z < 10) return "Warehouse yard";
  if (x < -88 && z > -14 && z < 30) return "Western outpost";
  if (x > 12 && x < 34 && z < -88) return "Workshop";
  if (x > -8 && x < 8 && z < -86) return "Radio hut";
  if (x > -20 && x < 20 && z < -86 && z > -112) return "Base camp";
  if (z < -86) return "Jungle camp";
  if (x < -60 && z > -60 && z < 40) return "West trail";
  if (x > 40 && z > 60) return "East ridge trail";
  if (z > 60 && z < 120 && Math.abs(x) < 40) return "Temple trail";
  if (z > -40 && z < 40 && Math.abs(x) < 40) return "Central crossing";
  return "Deep jungle";
}

export function placementIssues(state) {
  const issues = [];
  for (const spot of HOTSPOTS) {
    if (blocked(spot.x, spot.z, state)) issues.push(spot.id);
  }
  for (const solid of SOLIDS) {
    for (const spot of HOTSPOTS) {
      if (Math.hypot(spot.x - solid.x, spot.z - solid.z) < solid.r + 0.2) issues.push(`${spot.id} in ${solid.id}`);
    }
  }
  return issues;
}

export function puzzleFlags(state) {
  return [
    state.flags.packOpened,
    state.flags.radioTuned,
    state.flags.wrenchTaken,
    state.flags.axleOiled,
    state.flags.jeepStarted,
    state.flags.ferryPaid,
    state.flags.bridgePinned,
    state.flags.outpostDoor,
    state.flags.ledgerCopied,
    state.flags.fuseFound,
    state.flags.dynamoWound,
    state.flags.tunnelLit,
    state.flags.railSwitch,
    state.flags.templeGate,
    state.flags.mosaicMatched,
    state.flags.idolTaken,
    state.flags.mirrorSet,
    state.flags.waterChannel,
    state.flags.sealBroken,
    state.flags.chamberOpen,
    state.flags.ropeClimbed,
    state.flags.lensFound,
    state.flags.chartRead,
    state.flags.gearMeshed,
    state.flags.domeOpened,
    state.flags.starAligned,
    state.flags.beaconLit,
    state.flags.signalSent,
    state.flags.cacheOpened,
    state.flags.expeditionDone,
  ];
}

export function puzzlesSolved(state) {
  return puzzleFlags(state).filter(Boolean).length;
}

function currentGate(state) {
  const gates = [
    ["pack", !state.flags.packOpened],
    ["radio", !state.flags.radioTuned],
    ["wrench", !state.flags.wrenchTaken],
    ["axle", !state.flags.axleOiled],
    ["jeep", !state.flags.jeepStarted],
    ["ferry", !state.flags.ferryPaid],
    ["bridge", !state.flags.bridgePinned],
    ["outpost", !state.flags.outpostDoor],
    ["ledger", !state.flags.ledgerCopied],
    ["fuse", !state.flags.fuseFound],
    ["dynamo", !state.flags.dynamoWound],
    ["tunnel", !state.flags.tunnelLit],
    ["rail", !state.flags.railSwitch],
    ["temple", !state.flags.templeGate],
    ["mosaic", !state.flags.mosaicMatched],
    ["idol", !state.flags.idolTaken],
    ["mirror", !state.flags.mirrorSet],
    ["water", !state.flags.waterChannel],
    ["seal", !state.flags.sealBroken],
    ["chamber", !state.flags.chamberOpen],
    ["rope", !state.flags.ropeClimbed],
    ["lens", !state.flags.lensFound],
    ["chart", !state.flags.chartRead],
    ["gear", !state.flags.gearMeshed],
    ["dome", !state.flags.domeOpened],
    ["star", !state.flags.starAligned],
    ["beacon", !state.flags.beaconLit],
    ["signal", !state.flags.signalSent],
    ["cache", !state.flags.cacheOpened],
    ["log", !state.flags.expeditionDone],
    ["leave", !state.flags.escaped],
  ];
  const actionable = {
    pack: !state.flags.packOpened,
    radio: has(state, "radioCrystal") && !state.flags.radioTuned,
    wrench: !!state.flags.packOpened && !state.flags.wrenchTaken,
    axle: has(state, "oilFlask") && !state.flags.axleOiled,
    jeep: has(state, "wrench") && !!state.flags.axleOiled && !state.flags.jeepStarted,
    ferry: has(state, "coins") && !!state.flags.jeepStarted && !state.flags.ferryPaid,
    bridge: has(state, "bridgePin") && !!state.flags.ferryPaid && !state.flags.bridgePinned,
    outpost: has(state, "outpostKey") && !!state.flags.bridgePinned && !state.flags.outpostDoor,
    ledger: has(state, "charcoal") && !!state.flags.outpostDoor && !state.flags.ledgerCopied,
    fuse: !!state.flags.outpostDoor && !state.flags.fuseFound,
    dynamo: has(state, "dynamoCrank") && !!state.flags.fuseFound && !state.flags.dynamoWound,
    tunnel: has(state, "fuseWire") && has(state, "lantern") && !!state.flags.dynamoWound && !state.flags.tunnelLit,
    rail: has(state, "railToken") && !!state.flags.tunnelLit && !state.flags.railSwitch,
    temple: has(state, "templeRubbing") && !!state.flags.railSwitch && !state.flags.templeGate,
    mosaic: has(state, "mosaicSet") && !!state.flags.templeGate && !state.flags.mosaicMatched,
    idol: !!state.flags.mosaicMatched && !state.flags.idolTaken,
    mirror: has(state, "bronzeMirror") && !!state.flags.idolTaken && !state.flags.mirrorSet,
    water: has(state, "channelStone") && !!state.flags.mirrorSet && !state.flags.waterChannel,
    seal: has(state, "sealPick") && !!state.flags.waterChannel && !state.flags.sealBroken,
    chamber: has(state, "chamberKey") && !!state.flags.sealBroken && !state.flags.chamberOpen,
    rope: has(state, "climbingRope") && !!state.flags.chamberOpen && !state.flags.ropeClimbed,
    lens: !!state.flags.ropeClimbed && !state.flags.lensFound,
    chart: !!state.flags.domeOpened && !state.flags.chartRead,
    gear: has(state, "brassGear") && !!state.flags.lensFound && !state.flags.gearMeshed,
    dome: has(state, "wrench") && !!state.flags.gearMeshed && !state.flags.domeOpened,
    star: !!state.flags.chartRead && !!state.flags.domeOpened && !!state.flags.gearMeshed && !state.flags.starAligned,
    beacon: has(state, "starLens") && !!state.flags.starAligned && !state.flags.beaconLit,
    signal: has(state, "signalFlare") && !!state.flags.beaconLit && !state.flags.signalSent,
    cache: has(state, "cacheKey") && !!state.flags.signalSent && !state.flags.cacheOpened,
    log: has(state, "expeditionLog") && !!state.flags.cacheOpened && !state.flags.expeditionDone,
    leave: !!state.flags.expeditionDone && !state.flags.escaped,
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
  pack: [
    "The last drop left supplies somewhere obvious at camp.",
    "There is a supply pack near the tents.",
    "Pick up the supply pack beside base camp.",
  ],
  radio: [
    "Rex keeps asking for a part that was in the same crate as the rations.",
    "The tuning crystal belongs on the field radio in the hut.",
    "Use the tuning crystal on the field radio.",
  ],
  wrench: [
    "Sven's workshop has tools on the wall. The jeep will not wait forever.",
    "Take the spanner from the tool peg in the workshop.",
    "Pick up the wrench at the workshop tool peg.",
  ],
  axle: [
    "The survey jeep squeals when you look at it. Oil helps machines forgive you.",
    "Use the machine oil from the pack on the survey jeep.",
    "Use the oil flask on the jeep at camp.",
  ],
  jeep: [
    "A oiled axle still needs muscle and the right tool.",
    "Use the wrench on the jeep once the axle is oiled.",
    "Use the spanner wrench on the survey jeep.",
  ],
  ferry: [
    "Eli will not pole a boat for promises. He collects brass at the river.",
    "Pay Eli at the river crossing with the trade coins.",
    "Use the trade coins on the river crossing.",
  ],
  bridge: [
    "The rope bridge lists when the wind remembers it. Someone packed a pin for that.",
    "Secure the rope bridge with the bridge pin from the pack.",
    "Use the bridge pin on the rope bridge.",
  ],
  outpost: [
    "The western outpost gate is locked. Rex mentioned a key after the radio sang.",
    "Use the outpost key on the outpost gate.",
    "Use the outpost key on the western gate.",
  ],
  ledger: [
    "Hale keeps a mission ledger in the office. Copy it without stealing it.",
    "Use the charcoal stick on the mission ledger.",
    "Use charcoal on the ledger in the outpost office.",
  ],
  fuse: [
    "The watchtower fuse box is missing a spare.",
    "Take the spare fuse from the fuse box in the watchtower.",
    "Pick up the fuse at the watchtower fuse box.",
  ],
  dynamo: [
    "Jun stores a crank for when the warehouse lights fail.",
    "Talk to the warehouse porter, then wind the hand dynamo with the crank.",
    "Use the dynamo crank on the hand dynamo in the warehouse.",
  ],
  tunnel: [
    "The tunnel partition stays shut until there is light and a live fuse.",
    "Fill the lantern with oil, fit the fuse wire, and light the tunnel lamp.",
    "Use the fuse wire and lantern on the tunnel lamp after filling the lantern with oil.",
  ],
  rail: [
    "Hale marked the rail switch with a token for a reason.",
    "Use the switch token on the rail switch past the tunnel.",
    "Use the rail token on the rail switch.",
  ],
  temple: [
    "The temple gate wants proof you read Hale's margin notes.",
    "Use the temple rubbing on the temple gate.",
    "Use the temple rubbing copied from the ledger on the temple gate.",
  ],
  mosaic: [
    "Imani described three tile shapes. Combine the shards, then lay them in.",
    "Combine the three mosaic tiles, then use the matched set on the floor mosaic.",
    "Combine sun, river, and star tiles, then use the mosaic set on the temple floor.",
  ],
  idol: [
    "The inner hall keeps a stone idol on its plinth.",
    "Take the stone idol from the temple hall.",
    "Pick up the idol inside the temple.",
  ],
  mirror: [
    "Noon light should hit a bronze mirror in the niche.",
    "Use the bronze mirror on the mirror niche in the courtyard.",
    "Use the bronze mirror on the mirror stand.",
  ],
  water: [
    "The aqueduct is dry because a wedge is missing.",
    "Use the channel stone on the dry aqueduct.",
    "Use the channel stone on the aqueduct channel.",
  ],
  seal: [
    "The inner chamber is sealed with wax and stubbornness.",
    "Use the seal pick on the chamber seal.",
    "Use the seal pick on the wax seal.",
  ],
  chamber: [
    "Something inside the idol's base fits a bone-handled key.",
    "Use the chamber key on the inner chamber door.",
    "Use the chamber key on the chamber partition.",
  ],
  rope: [
    "Weiss watches the observatory from a cliff you cannot walk up.",
    "Use the climbing rope on the observatory cliff route.",
    "Use the climbing rope on the cliff below the observatory.",
  ],
  lens: [
    "The dome room keeps a brass lens on its table.",
    "Take the star lens from the observatory.",
    "Pick up the brass lens in the observatory.",
  ],
  chart: [
    "Weiss hid the alignment numbers where astronomers hide everything: on paper, under glass.",
    "Read the star chart once the dome is open.",
    "Look at the star chart in the observatory after opening the dome.",
  ],
  gear: [
    "The gear housing is one tooth shy of honesty.",
    "Use the brass gear on the gear housing.",
    "Use the brass gear on the observatory gear box.",
  ],
  dome: [
    "The dome latch is stuck the same way the jeep was.",
    "Use the wrench on the dome latch.",
    "Use the spanner on the observatory dome latch.",
  ],
  star: [
    "Three digits align the wheel. The chart and the open dome must agree first.",
    "Read the star chart, mesh the gear, open the dome, then set the alignment wheel.",
    "Enter the three-digit alignment at the star wheel once chart, gear, and dome are done.",
  ],
  beacon: [
    "The summit beacon needs the night's eye after the stars agree.",
    "Use the star lens on the summit beacon.",
    "Use the star lens on the beacon.",
  ],
  signal: [
    "Mara asked for one flare when the beacon is lit.",
    "Use the signal flare on the signal mast.",
    "Use the signal flare on the signal tower.",
  ],
  cache: [
    "The buried cache behind camp opens for a key from the cave station.",
    "Use the cache key on the buried cache.",
    "Use the cache key on the camp cache.",
  ],
  log: [
    "Mara needs the written record before she calls extraction.",
    "Use the expedition log on the field radio to transmit the summary.",
    "Use the expedition log on the radio hut radio.",
  ],
  leave: [
    "Extraction listens when the log is sent and the jeep still runs.",
    "Talk to Mara about evacuation once the expedition log is filed.",
    "Talk to Dr Mara Okonkwo and choose to leave the jungle.",
  ],
  done: ["You are done.", "You are done.", "You are done."],
};

const LOOK = {
  pack: "A canvas pack stamped SUPPLY DROP B. It has not been opened since the storm.",
  radio: "A field radio with a empty crystal socket and a dial Rex has scratched with pencil.",
  jeep: "A survey jeep on flat tyres and pride. The axle gleams dry metal.",
  cache: "A mound of fresh earth with a brass handle barely showing. Locked.",
  trailA: "A carved post: NORTH TO TEMPLE. Someone added WEST in red paint.",
  ferry: "A rope ferry across brown water. Eli keeps the boat on the near bank until paid.",
  bridge: "A rope bridge over a gorge. One pin slot gapes empty.",
  trailB: "A post points west toward the outpost. Boot prints overlap.",
  outpostDoor: "A steel gate in the jungle wall. OUTPOST WEST is stencilled on it.",
  ledger: "Hale's mission ledger. Margin sketches of temple tiles.",
  fuse: "A fuse box with one empty slot labelled SPARE.",
  dynamo: "A hand dynamo bolted to a crate. The handle is missing.",
  tunnelLamp: "A wall lamp with a cold wick and no fuse in the line.",
  railSwitch: "A rusted rail switch for a cart track that nobody admits using.",
  trailC: "Carved steps worn smooth. The temple smell starts here.",
  templeGate: "A stone gate with three shallow sockets shaped like tiles.",
  mosaic: "A floor mosaic with three empty sockets: sun, river, star.",
  idol: "A stone idol on a plinth. The base panel is loose.",
  mirrorStand: "A niche cut for a mirror at noon.",
  aqueduct: "A dry channel with a gap for a wedge stone.",
  seal: "A wax seal stamped with a constellation.",
  chamberDoor: "A low door behind the seal. Bone keyhole.",
  cliff: "A cliff face with old pitons. The observatory perches above.",
  lens: "A brass lens on felt. Scratches map constellations.",
  chart: "A star chart under glass. Handwritten notes in the margin.",
  domeLatch: "A jammed latch on the observatory dome.",
  starWheel: "Three numbered wheels under the dome slit.",
  beacon: "A summit beacon housing waiting for a lens.",
  signalTower: "A signal mast with a flare tube socket.",
  trailD: "East ridge trail. Weiss's flags mark the switchbacks.",
  workbench: "Oil stains and a vise. Sven's kingdom.",
  wrenchSpot: "A peg with one missing tool outline labelled SPANNER.",
  mara: "Dr Mara Okonkwo. Khaki shirt, tired eyes, and a map she will not put down.",
  rex: "Rex adjusts headphones that never quite cancel the jungle.",
  sven: "Sven wipes grease on a rag that has its own biography.",
  cook: "Nia stirs something that smells like hope and onions.",
  eli: "Eli poles a boat with the patience of a man who has seen every excuse.",
  sergeant: "Sergeant Hale. Clipboard, boots, and the belief that paperwork saves lives.",
  priest: "Curator Imani. Shawl of temple motifs and a voice trained for echoes.",
  astronomer: "Dr Weiss. Sunburned, ink-stained, watching the sky like it owes him money.",
  porter: "Jun the porter. Knows every crate by weight and every lie by tone.",
};

export function dialogueFor(state, npcId) {
  if (npcId === "mara") {
    const choices = [
      { id: "plan", label: "What is the plan?" },
      { id: "zones", label: "Which zones matter?" },
    ];
    if (state.flags.expeditionDone && !state.flags.escaped) {
      choices.unshift({ id: "leave", label: "Call extraction." });
    }
    choices.push({ id: "bye", label: "Back to the trails." });
    const text = state.flags.escaped
      ? "Mara is already a voice on a helicopter you cannot hear anymore."
      : "Mara taps the map. \"Four zones, thirty checkpoints, one radio call at the end. Do not skip the outpost ledger. Hale hid the temple sequence there.\"";
    return { text, choices };
  }
  if (npcId === "rex") {
    const choices = [
      { id: "static", label: "Why won't the radio work?" },
      { id: "key", label: "Any keys in the static?" },
    ];
    if (has(state, "expeditionLog") && !state.flags.expeditionDone) {
      choices.unshift({ id: "transmit", label: "Transmit the expedition log." });
    }
    choices.push({ id: "bye", label: "Leave the hut." });
    return {
      text: state.flags.radioTuned
        ? "Rex grins. \"Signal's clean. Outpost key frequency came through after you tuned her.\""
        : "Rex points at the crystal socket. \"No crystal, no key tone, no rescue channel.\"",
      choices,
    };
  }
  if (npcId === "sven") {
    const choices = [{ id: "jeep", label: "Can you fix the jeep?" }];
    if (has(state, "oilFlask") && !state.flags.axleOiled) {
      choices.unshift({ id: "oil", label: "I have machine oil." });
    }
    choices.push({ id: "bye", label: "Walk away greasy." });
    return {
      text: state.flags.jeepStarted
        ? "\"She runs,\" Sven says. \"Do not ask me to ride. I have seen your driving on paper.\""
        : "Sven jerks a thumb at the jeep. \"Oil the axle, then wrench the bolt I marked in yellow. Wrench's on my peg.\"",
      choices,
    };
  }
  if (npcId === "cook") {
    return {
      text: "Nia offers a ladle. \"Eat before you hike. Charcoal sticks by the fire if you need to copy Hale's scribbles without stealing the book.\"",
      choices: [
        { id: "charcoal", label: "May I take charcoal?" },
        { id: "food", label: "What's for dinner?" },
        { id: "bye", label: "Trail calls." },
      ],
    };
  }
  if (npcId === "eli") {
    const choices = [
      { id: "price", label: "What do you charge?" },
      { id: "west", label: "Is the west trail safe?" },
    ];
    if (has(state, "coins") && state.flags.jeepStarted && !state.flags.ferryPaid) {
      choices.unshift({ id: "pay", label: "Here are three tokens." });
    }
    choices.push({ id: "bye", label: "Stay dry." });
    return {
      text: state.flags.ferryPaid
        ? "Eli poles you across. \"Bridge is next. Pin her before the wind argues.\""
        : "Eli holds out a palm. \"Three brass tokens or you swim. I do not recommend swim.\"",
      choices,
    };
  }
  if (npcId === "sergeant") {
    return {
      text: state.flags.railSwitch
        ? "Hale salutes. \"Temple trail's open. Do not touch the idol without Imani's lecture first.\""
        : "Hale blocks the tunnel mouth on his map. \"Light it, throw my switch token, then we talk temple.\"",
      choices: [
        { id: "tunnel", label: "How do I light the tunnel?" },
        { id: "token", label: "Where is the switch token?" },
        { id: "bye", label: "Yes sergeant." },
      ],
    };
  }
  if (npcId === "priest") {
    const choices = [
      { id: "tiles", label: "Tell me about the mosaic." },
      { id: "mirror", label: "What about the mirror niche?" },
    ];
    if (has(state, "goldenIdol") && !has(state, "chamberKey")) {
      choices.unshift({ id: "base", label: "The idol base is loose." });
    }
    choices.push({ id: "bye", label: "Leave the hall." });
    return {
      text: state.flags.templeGate
        ? "Imani bows. \"Sun, river, star. Then mirror at noon, water in the channel, seal last.\""
        : "Imani waits at the gate. \"Bring Hale's rubbing or the stone will not move.\"",
      choices,
    };
  }
  if (npcId === "astronomer") {
    const choices = [
      { id: "dome", label: "How do I open the dome?" },
      { id: "stars", label: "What am I aligning?" },
    ];
    if (state.flags.starAligned && !state.flags.beaconLit) {
      choices.unshift({ id: "beacon", label: "The wheel is set." });
    }
    choices.push({ id: "bye", label: "Clouds incoming." });
    return {
      text: state.flags.ropeClimbed
        ? "Weiss points up. \"Gear, dome, chart, then the wheel. Beacon wants your lens after.\""
        : "Weiss shouts from the cliff. \"Rope up first. I do not catch falling archaeologists.\"",
      choices,
    };
  }
  const choices = [
    { id: "crank", label: "Need a dynamo crank?" },
    { id: "crate", label: "Any gear in the crates?" },
  ];
  if (!has(state, "dynamoCrank") && state.flags.outpostDoor) {
    choices.unshift({ id: "takeCrank", label: "Loan me the crank." });
  }
  choices.push({ id: "bye", label: "Back to stacking." });
  return {
    text: state.flags.dynamoWound
      ? "Jun nods at humming lights. \"Crank lives on the shelf. You brought it back once; that counts.\""
      : "Jun hefts a crate. \"Crank's on shelf two. Dynamo won't spin itself.\"",
    choices,
  };
}

function talk(state, npcId, choiceId) {
  const s = clone(state);
  if (npcId === "mara" && choiceId === "plan") {
    return say(s, "Mara traces a loop. \"Camp, outpost, temple, observatory. Pin the bridge, copy the ledger, align the stars, signal me, open the cache, transmit the log. Then we leave.\"");
  }
  if (npcId === "mara" && choiceId === "zones") {
    return say(s, "\"Camp starts the jeep. Outpost feeds the tunnel. Temple feeds the chamber. Observatory feeds the sky. Miss one and the radio stays mute.\"");
  }
  if (npcId === "mara" && choiceId === "leave") {
    if (!s.flags.expeditionDone) return keep(state, "Mara shakes her head. \"Not without the log on Rex's channel.\"");
    s.flags.escaped = true;
    s.escapedAt = s.elapsedMs;
    return say(s, "Mara hits transmit. Rotors beat the canopy open. You climb into the rescue ship while the jungle reclaims the trails behind you.", "Extraction reached camp.");
  }
  if (npcId === "mara" && choiceId === "bye") return say(s, "Mara returns to the map. The red circles look like wounds.");
  if (npcId === "rex" && choiceId === "static") {
    return say(s, "Rex taps the dial. \"Crystal seats here. Tune to OUTPOST, key tone prints on the tag. Without that, Hale's gate stays a wall.\"");
  }
  if (npcId === "rex" && choiceId === "key") {
    return say(s, "\"After tune, listen for three beeps. Key falls out of the slot like it wants to be used.\"");
  }
  if (npcId === "rex" && choiceId === "transmit") {
    if (!has(s, "expeditionLog") || s.flags.expeditionDone) return keep(state, "Rex waits for a complete log.");
    pull(s, "expeditionLog");
    s.flags.expeditionDone = true;
    return say(s, "Rex reads the log aloud into the mic. Static clears into a steady green light. \"Mara'll see it. Good work.\"", "Expedition log transmitted.");
  }
  if (npcId === "rex" && choiceId === "bye") return say(s, "Static swallows the hut again.");
  if (npcId === "sven" && choiceId === "jeep") {
    return say(s, "\"Yellow bolt on the axle, then starter lug. Oil first or you'll strip it.\"");
  }
  if (npcId === "sven" && choiceId === "oil") {
    return oilAxle(state);
  }
  if (npcId === "sven" && choiceId === "bye") return say(s, "Sven returns to a bolt that never asked for drama.");
  if (npcId === "cook" && choiceId === "charcoal") {
    if (has(s, "charcoal")) return keep(state, "You already have charcoal.");
    s.inventory.push("charcoal");
    return say(s, "Nia hands you a stick. \"Copy, don't steal. Hale shoots thieves.\"");
  }
  if (npcId === "cook" && choiceId === "food") return say(s, "\"Stew. Tastes like victory if you're hungry enough.\"");
  if (npcId === "cook" && choiceId === "bye") return say(s, "The pot bubbles approval.");
  if (npcId === "eli" && choiceId === "price") return say(s, "\"Three brass tokens. Same as last season.\"");
  if (npcId === "eli" && choiceId === "west") return say(s, "\"Bridge creaks. Pin it. Gate needs Hale's blessing via radio key.\"");
  if (npcId === "eli" && choiceId === "pay") {
    return payFerry(state);
  }
  if (npcId === "eli" && choiceId === "bye") return say(s, "Eli watches the water.");
  if (npcId === "sergeant" && choiceId === "tunnel") {
    return say(s, "Hale points. \"Fuse in the tower, crank in the warehouse, oil in the lantern. Lamp lights partition. Token throws the switch.\"");
  }
  if (npcId === "sergeant" && choiceId === "token") {
    if (s.flags.ledgerCopied) {
      if (!has(s, "railToken")) s.inventory.push("railToken");
      return say(s, "Hale tosses a brass disk. \"Only after the tunnel glows.\"");
    }
    return say(s, "\"Copy my ledger first. Then I trust you with the switch.\"");
  }
  if (npcId === "sergeant" && choiceId === "bye") return say(s, "Hale marks your name on a list.");
  if (npcId === "priest" && choiceId === "tiles") {
    return say(s, "\"Sun rises, river runs, star waits. Place them, then the idol may move.\"");
  }
  if (npcId === "priest" && choiceId === "mirror") {
    return say(s, "\"Bronze mirror at noon opens the channel stone path.\"");
  }
  if (npcId === "priest" && choiceId === "base") {
    if (!has(s, "goldenIdol")) return keep(state, "Which idol?");
    if (has(s, "chamberKey")) return keep(state, "You already have the key.");
    s.inventory.push("chamberKey");
    return say(s, "Imani pries the base. \"Bone key for the inner seal. Do not lose it in the dark.\"", "Chamber key from the idol base.");
  }
  if (npcId === "priest" && choiceId === "bye") return say(s, "Incense follows you out.");
  if (npcId === "astronomer" && choiceId === "dome") {
    return say(s, "\"Mesh the gear, wrench the latch, read the chart, then the wheel. Classic order.\"");
  }
  if (npcId === "astronomer" && choiceId === "stars") {
    return say(s, "\"Three digits from the chart. Set the wheel after the dome is open.\"");
  }
  if (npcId === "astronomer" && choiceId === "beacon") {
    return say(s, "\"Lens on the beacon, flare on the mast. Mara watches both.\"");
  }
  if (npcId === "astronomer" && choiceId === "bye") return say(s, "Weiss checks clouds.");
  if (npcId === "porter" && choiceId === "takeCrank") {
    if (has(s, "dynamoCrank")) return keep(state, "You already have the crank.");
    s.inventory.push("dynamoCrank");
    return say(s, "Jun tosses the crank. \"Return it or I'll invoice you in crates.\"");
  }
  if (npcId === "porter" && choiceId === "crank") return say(s, "\"Shelf two. You didn't hear that from me.\"");
  if (npcId === "porter" && choiceId === "crate") {
    if (s.flags.chamberOpen && !has(s, "brassGear")) {
      s.inventory.push("brassGear");
      return say(s, "Jun slides a gear from a crate marked OBSERVATORY. \"Weiss left an IOU.\"", "Brass gear from warehouse stock.");
    }
    return say(s, "\"Mostly tarps. One crate rattles like teeth.\"");
  }
  if (npcId === "porter" && choiceId === "bye") return say(s, "Jun stacks silence.");
  return keep(state, "They have nothing to add to that.");
}

function oilAxle(state) {
  if (!has(state, "oilFlask") || state.flags.axleOiled) return keep(state, "The axle is already oiled or you have no oil.");
  const s = clone(state);
  s.flags.axleOiled = true;
  return say(s, "Oil sinks into the axle. The squeal gives up.", "Jeep axle oiled.");
}

function payFerry(state) {
  if (!has(state, "coins") || !state.flags.jeepStarted || state.flags.ferryPaid) {
    return keep(state, "Eli is not impressed yet.");
  }
  const s = clone(state);
  pull(s, "coins");
  s.flags.ferryPaid = true;
  return say(s, "Eli pockets the tokens and poles you across. \"Bridge next. Wind picks up after noon.\"", "Ferry crossing paid.");
}

function fillLantern(state) {
  if (state.flags.lanternFilled) return keep(state, "Lantern already has oil.");
  if (!has(state, "lantern")) return keep(state, "You have no lantern.");
  const s = clone(state);
  s.flags.lanternFilled = true;
  return say(s, "You soak the wick from the cook's spare tin. The lantern feels heavier and more honest.");
}

function applyItem(state, itemId, targetId) {
  if (!has(state, itemId)) return keep(state, "You are not holding that.");
  if (itemId === "oilFlask" && (targetId === "jeep" || targetId === "sven")) return oilAxle(state);
  if (itemId === "coins" && (targetId === "ferry" || targetId === "eli")) return payFerry(state);
  if (itemId === "charcoal" && targetId === "ledger") return copyLedger(state);
  if (itemId === "expeditionLog" && targetId === "radio") return talk(state, "rex", "transmit");
  if (itemId === "expeditionLog" && targetId === "rex") return talk(state, "rex", "transmit");
  const s = clone(state);
  if (itemId === "radioCrystal" && targetId === "radio") {
    if (s.flags.radioTuned) return keep(state, "The radio is already tuned.");
    pull(s, "radioCrystal");
    s.inventory.push("outpostKey");
    s.flags.radioTuned = true;
    return say(s, "The crystal seats with a click. Three beeps, then Rex grins as the outpost key tone prints on a tag.", "Radio tuned; outpost key received.");
  }
  if (itemId === "wrench" && targetId === "jeep") {
    if (!s.flags.axleOiled) return keep(state, "The bolt won't turn dry. Oil it first.");
    if (s.flags.jeepStarted) return keep(state, "The jeep already runs.");
    s.flags.jeepStarted = true;
    return say(s, "You wrench the yellow bolt. The engine catches, coughs jungle dust, and settles into a steady idle.", "Survey jeep started.");
  }
  if (itemId === "bridgePin" && targetId === "bridge") {
    if (!s.flags.ferryPaid) return keep(state, "Cross the river first. The bridge is on the far side.");
    if (s.flags.bridgePinned) return keep(state, "The bridge is already pinned.");
    pull(s, "bridgePin");
    s.flags.bridgePinned = true;
    return say(s, "The pin seats. The bridge stops arguing with the wind.", "Rope bridge secured.");
  }
  if (itemId === "outpostKey" && targetId === "outpostDoor") {
    if (s.flags.outpostDoor) return keep(state, "The gate is already open.");
    if (!s.flags.bridgePinned) return keep(state, "The west trail is not secure yet.");
    pull(s, "outpostKey");
    s.flags.outpostDoor = true;
    return say(s, "The gate rolls aside. Hale's yard opens: warehouse, tower, office.", "Outpost gate open.");
  }
  if (itemId === "dynamoCrank" && targetId === "dynamo") {
    if (s.flags.dynamoWound) return keep(state, "The dynamo is already wound.");
    if (!s.flags.fuseFound) return keep(state, "Fix the fuse box first or you'll blow a bulb.");
    pull(s, "dynamoCrank");
    s.flags.dynamoWound = true;
    if (!has(s, "lantern")) s.inventory.push("lantern");
    return say(s, "You crank until the warehouse bulbs glow. Jun tosses you an empty lantern.", "Dynamo wound; lantern acquired.");
  }
  if (itemId === "fuseWire" && targetId === "tunnelLamp") {
    if (!s.flags.dynamoWound) return keep(state, "No power yet.");
    if (!s.flags.lanternFilled) return keep(state, "The lantern needs oil in the wick first.");
    if (s.flags.tunnelLit) return keep(state, "The tunnel is already lit.");
    pull(s, "fuseWire");
    s.flags.tunnelLit = true;
    return say(s, "Fuse in, lantern lit. The tunnel partition groans open.", "Tunnel lit and partition open.");
  }
  if (itemId === "oilFlask" && (targetId === "tunnelLamp" || targetId === "lantern")) {
    return fillLantern(state);
  }
  if (itemId === "lantern" && targetId === "tunnelLamp") {
    if (!s.flags.lanternFilled) return fillLantern(state);
    if (!has(s, "fuseWire")) return keep(state, "The line needs a fuse.");
    return applyItem(state, "fuseWire", "tunnelLamp");
  }
  if (itemId === "railToken" && targetId === "railSwitch") {
    if (!s.flags.tunnelLit) return keep(state, "The tunnel is dark. Hale would notice.");
    if (s.flags.railSwitch) return keep(state, "Switch already thrown.");
    pull(s, "railToken");
    s.flags.railSwitch = true;
    s.inventory.push("mosaicA", "mosaicB", "mosaicC");
    return say(s, "The switch clunks. A hidden crate opens with three ceramic shards.", "Rail switch thrown; mosaic tiles found.");
  }
  if (itemId === "templeRubbing" && targetId === "templeGate") {
    if (s.flags.templeGate) return keep(state, "Gate already open.");
    if (!s.flags.railSwitch) return keep(state, "The temple trail is still blocked on Hale's map.");
    pull(s, "templeRubbing");
    s.flags.templeGate = true;
    s.inventory.push("bronzeMirror", "sealPick");
    return say(s, "The rubbing matches carved outlines. The gate grinds open. Imani left tools on the step.", "Temple gate open.");
  }
  if (itemId === "mosaicSet" && targetId === "mosaic") {
    if (s.flags.mosaicMatched) return keep(state, "Mosaic already set.");
    pull(s, "mosaicSet");
    s.flags.mosaicMatched = true;
    s.inventory.push("channelStone");
    return say(s, "Sun, river, star click into place. A stone wedge rises from a hidden compartment.", "Temple mosaic matched.");
  }
  if (itemId === "bronzeMirror" && targetId === "mirrorStand") {
    if (!s.flags.mosaicMatched) return keep(state, "The hall is not ready.");
    if (s.flags.mirrorSet) return keep(state, "Mirror already set.");
    pull(s, "bronzeMirror");
    s.flags.mirrorSet = true;
    return say(s, "Noon light hits the bronze and throws a beam toward the aqueduct.", "Mirror aligned at noon.");
  }
  if (itemId === "channelStone" && targetId === "aqueduct") {
    if (!s.flags.mirrorSet) return keep(state, "The channel waits for the mirror beam.");
    if (s.flags.waterChannel) return keep(state, "Water already flows.");
    pull(s, "channelStone");
    s.flags.waterChannel = true;
    return say(s, "Water trickles through. The seal wax softens in the humidity.", "Aqueduct channel restored.");
  }
  if (itemId === "sealPick" && targetId === "seal") {
    if (!s.flags.waterChannel) return keep(state, "The seal is hard as pride.");
    if (s.flags.sealBroken) return keep(state, "Seal already broken.");
    s.flags.sealBroken = true;
    return say(s, "Wax flakes away. The inner door breathes cold air.", "Chamber seal broken.");
  }
  if (itemId === "chamberKey" && targetId === "chamberDoor") {
    if (!s.flags.sealBroken) return keep(state, "Break the seal first.");
    if (s.flags.chamberOpen) return keep(state, "Chamber already open.");
    pull(s, "chamberKey");
    s.flags.chamberOpen = true;
    s.inventory.push("climbingRope", "signalFlare");
    return say(s, "The partition opens on a rope coil and a flare tube.", "Inner chamber open.");
  }
  if (itemId === "climbingRope" && targetId === "cliff") {
    if (!s.flags.chamberOpen) return keep(state, "You are not ready for that climb.");
    if (s.flags.ropeClimbed) return keep(state, "Rope already set.");
    pull(s, "climbingRope");
    s.flags.ropeClimbed = true;
    return say(s, "You tie off and climb. Weiss waves from the observatory door.", "Cliff rope route established.");
  }
  if (itemId === "wrench" && targetId === "domeLatch") {
    if (!s.flags.gearMeshed) return keep(state, "The gear box must mesh first.");
    if (s.flags.domeOpened) return keep(state, "Dome already open.");
    s.flags.domeOpened = true;
    return say(s, "The latch yields. The dome slides open on a strip of sky.", "Observatory dome opened.");
  }
  if (itemId === "brassGear" && targetId === "gearBox") {
    if (!s.flags.lensFound) return keep(state, "Find the lens first. Weiss is particular.");
    if (s.flags.gearMeshed) return keep(state, "Gear already meshed.");
    pull(s, "brassGear");
    s.flags.gearMeshed = true;
    return say(s, "Teeth bite. The housing hums like a hive.", "Observatory gear meshed.");
  }
  if (itemId === "starLens" && targetId === "beacon") {
    if (!s.flags.starAligned) return keep(state, "Align the wheel first.");
    if (s.flags.beaconLit) return keep(state, "Beacon already lit.");
    pull(s, "starLens");
    s.flags.beaconLit = true;
    return say(s, "The beacon throws a white blade across the canopy. Mara would see it if she looked up.", "Summit beacon lit.");
  }
  if (itemId === "signalFlare" && targetId === "signalTower") {
    if (!s.flags.beaconLit) return keep(state, "Light the beacon first.");
    if (s.flags.signalSent) return keep(state, "Signal already sent.");
    pull(s, "signalFlare");
    s.flags.signalSent = true;
    s.inventory.push("cacheKey");
    return say(s, "The flare arcs red. A key drops from the cave station locker on a string.", "Signal flare sent; cache key received.");
  }
  if (itemId === "cacheKey" && targetId === "cache") {
    if (s.flags.cacheOpened) return keep(state, "Cache already opened.");
    pull(s, "cacheKey");
    s.flags.cacheOpened = true;
    s.inventory.push("expeditionLog");
    return say(s, "Earth peels back. Inside: the expedition log, complete except your signature.", "Buried cache opened.");
  }
  return keep(state, refusal(itemId, targetId));
}

function copyLedger(state) {
  if (!has(state, "charcoal") || state.flags.ledgerCopied) return keep(state, "Nothing to copy.");
  if (!state.flags.outpostDoor) return keep(state, "You cannot reach the ledger yet.");
  const s = clone(state);
  s.flags.ledgerCopied = true;
  s.inventory.push("templeRubbing");
  return say(s, "You rub charcoal over Hale's margin tiles: sun, river, star. The pattern matches the temple gate.", "Ledger copied to temple rubbing.");
}

export function reduce(state, action) {
  if (!state) return keep(createGame(0), "");
  if (state.flags.escaped && action.type !== "TICK" && action.type !== "POSE") return keep(state, state.log);
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
    if (action.id === "chart") {
      if (!s.flags.domeOpened) return keep(state, "The chart is under a dome that will not open yet.");
      s.flags.chartRead = true;
      return say(
        s,
        "Under glass: constellations and a note in Weiss's hand — align the wheel to seven, then two, then nine when the gear sings.",
        "Star chart read."
      );
    }
    if (action.id === "ledger" && s.flags.ledgerCopied) return say(s, "Charcoal ghosts mark the tile shapes. You already copied them.");
    if (action.id === "jeep" && s.flags.jeepStarted) return say(s, "The jeep ticks warm. Ready for trails.");
    if (action.id === "bridge" && s.flags.bridgePinned) return say(s, "The pin holds. The bridge sways but stays.");
    if (action.id === "starWheel" && s.flags.starAligned) return say(s, "The wheels sit on seven, two, nine.");
    return say(s, LOOK[action.id] || "You look. The jungle looks back.");
  }
  if (action.type === "TAKE") {
    const s = clone(state);
    if (action.id === "pack") {
      if (s.flags.packOpened) return keep(state, "The pack is empty.");
      s.flags.packOpened = true;
      s.inventory.push("rations", "radioCrystal", "oilFlask", "coins", "bridgePin");
      return say(s, "Inside: rations, a tuning crystal, machine oil, trade coins, and a bridge pin.", "Supply pack opened.");
    }
    if (action.id === "wrenchSpot") {
      if (s.flags.wrenchTaken) return keep(state, "The peg is bare.");
      s.flags.wrenchTaken = true;
      s.inventory.push("wrench");
      return say(s, "You take the spanner. Sven will pretend he noticed.", "Wrench taken from workshop.");
    }
    if (action.id === "fuse") {
      if (!s.flags.outpostDoor) return keep(state, "You cannot reach the tower yet.");
      if (s.flags.fuseFound) return keep(state, "You already have a fuse.");
      s.flags.fuseFound = true;
      s.inventory.push("fuseWire");
      return say(s, "You pull the spare fuse from the box.", "Spare fuse taken.");
    }
    if (action.id === "idol") {
      if (!s.flags.mosaicMatched) return keep(state, "The idol will not budge yet.");
      if (s.flags.idolTaken) return keep(state, "You already carry the idol.");
      s.flags.idolTaken = true;
      s.inventory.push("goldenIdol");
      return say(s, "The idol lifts. Something rattles in its base.", "Stone idol taken.");
    }
    if (action.id === "lens") {
      if (!s.flags.ropeClimbed) return keep(state, "The observatory is still above you.");
      if (s.flags.lensFound) return keep(state, "Lens already taken.");
      s.flags.lensFound = true;
      s.inventory.push("starLens");
      return say(s, "You pocket the brass lens. Scratches map the sky.", "Star lens taken.");
    }
    return keep(state, "That stays where the expedition put it.");
  }
  if (action.type === "COMBINE") {
    const { a, b } = action;
    if (a === b) return keep(state, "That does not combine with itself.");
    if (!has(state, a) || !has(state, b)) return keep(state, "You do not have both of those.");
    const tileIds = ["mosaicA", "mosaicB", "mosaicC"];
    if (tileIds.includes(a) && tileIds.includes(b)) {
      if (!tileIds.every((id) => has(state, id))) return keep(state, "You need all three tile shards.");
      const s = clone(state);
      for (const id of tileIds) pull(s, id);
      s.inventory.push("mosaicSet");
      return say(s, "Three shards become one pattern: sun, river, star.", "Mosaic tiles combined.");
    }
    return keep(state, `${itemName(a)} and ${itemName(b)} remain strangers.`);
  }
  if (action.type === "USE") return applyItem(state, action.itemId, action.targetId);
  if (action.type === "TALK") return talk(state, action.npcId, action.choiceId);
  if (action.type === "CODE") {
    const code = String(action.value ?? "").replace(/\s/g, "");
    if (!(state.flags.chartRead && state.flags.domeOpened && state.flags.gearMeshed)) {
      return keep(state, "The wheel spins freely. Something is not ready.");
    }
    if (state.flags.starAligned) return keep(state, "The wheel is already set.");
    if (code !== STAR_CODE) return keep(state, "The wheels try that number, shudder, and reset.");
    const s = clone(state);
    s.flags.starAligned = true;
    return say(s, "Seven. Two. Nine. The dome slit aligns with a star you cannot name and the housing clicks.", "Star alignment set.");
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
    s.hintText = HINTS[gate]?.[tier] || "Keep walking. The jungle hides checkpoints in plain sight.";
    return { state: s, line: s.log, hint: s.hintText };
  }
  return keep(state, state.log);
}

const NPC_IDS = new Set(NPCS.map((npc) => npc.id));

export function canTake(state, id) {
  if (id === "pack") return !state.flags.packOpened;
  if (id === "wrenchSpot") return !state.flags.wrenchTaken;
  if (id === "fuse") return !!state.flags.outpostDoor && !state.flags.fuseFound;
  if (id === "idol") return !!state.flags.mosaicMatched && !state.flags.idolTaken;
  if (id === "lens") return !!state.flags.ropeClimbed && !state.flags.lensFound;
  return false;
}

export function verbsFor(state, id) {
  const spot = hotspotById(id);
  if (!spot) return [];
  const verbs = [{ id: "look", label: "Look" }];
  if (canTake(state, id)) verbs.push({ id: "take", label: "Pick up" });
  if (NPC_IDS.has(id)) verbs.push({ id: "talk", label: "Talk" });
  if (id === "starWheel" && state.flags.domeOpened && state.flags.gearMeshed && !state.flags.starAligned) {
    verbs.push({ id: "operate", label: "Set alignment" });
  }
  return verbs;
}

export function reachableHotspotIds(state) {
  const step = 1.1;
  const min = -140;
  const max = 140;
  const startX = state.pose?.x ?? 0;
  const startZ = state.pose?.z ?? -100;
  const toKey = (x, z) => `${Math.round(x / step)}:${Math.round(z / step)}`;
  const seen = new Set();
  const queue = [[startX, startZ]];
  seen.add(toKey(startX, startZ));
  const visited = [[startX, startZ]];
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  while (queue.length) {
    const [x, z] = queue.shift();
    for (const [dx, dz] of dirs) {
      const nx = x + dx * step;
      const nz = z + dz * step;
      if (nx < min || nz < min || nx > max || nz > max) continue;
      const key = toKey(nx, nz);
      if (seen.has(key)) continue;
      if (!canMove(x, z, nx, nz, state)) continue;
      seen.add(key);
      queue.push([nx, nz]);
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
