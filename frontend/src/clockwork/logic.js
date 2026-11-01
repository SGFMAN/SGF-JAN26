/** The Clockwork Conspiracy. Pure rules. No rendering. */

export const SAVE_KEY = "sgf-clockwork-conspiracy-v1";
export const PUZZLE_TOTAL = 20;
export const STRIKE_CODE = "417";
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
  { id: "bram", name: "Stationmaster Bram", x: 3.3, z: -28.6, r: 1.8, yaw: 0 },
  { id: "nell", name: "Clerk Nell", x: -8.8, z: 4.4, r: 1.8, yaw: Math.PI },
  { id: "ivo", name: "Ivo the gearwright", x: 20, z: 16, r: 1.8, yaw: -Math.PI / 2 },
  { id: "odette", name: "Librarian Odette", x: -24.2, z: 16, r: 1.8, yaw: Math.PI / 2 },
  { id: "hugo", name: "Innkeeper Hugo", x: -26.4, z: -12.1, r: 1.8, yaw: Math.PI / 2 },
  { id: "pip", name: "Market Pip", x: 26.4, z: -8.8, r: 1.8, yaw: Math.PI },
  { id: "vesper", name: "Lady Vesper", x: 0, z: 26.3, r: 1.8, yaw: Math.PI },
  { id: "cole", name: "Watchman Cole", x: 34.1, z: 1.1, r: 1.8, yaw: -Math.PI / 2 },
];

const PLACES = [
  { id: "bag", name: "Carpet bag", x: 0, z: -32, r: 1.7 },
  { id: "board", name: "Noticeboard", x: -8.8, z: -20.5, r: 1.7 },
  { id: "cage", name: "Luggage cage", x: -6.6, z: -33, r: 1.8 },
  { id: "poster", name: "Soap poster", x: 7.7, z: -38.2, r: 1.6 },
  { id: "signal", name: "Station signal", x: 8.8, z: -20.5, r: 1.8 },
  { id: "engine", name: "Tank engine", x: 18.7, z: -30.8, r: 2.2 },
  { id: "tender", name: "Coal tender", x: 21, z: -33.5, r: 2.2 },
  { id: "face", name: "Town clock", x: 0, z: -6.6, r: 2.2 },
  { id: "hatch", name: "Floor hatch", x: 0, z: -1.2, r: 1.6 },
  { id: "hook", name: "Pendulum hook", x: 2.2, z: -0.8, r: 1.6 },
  { id: "loftdoor", name: "Loft door", x: 0, z: 0.4, r: 1.7 },
  { id: "plaque", name: "Charter plate", x: -1.1, z: 3.2, r: 1.55 },
  { id: "strike", name: "Strike wheels", x: 0, z: 3.2, r: 1.6 },
  { id: "fountain", name: "Fountain", x: -9.9, z: 2.6, r: 1.7 },
  { id: "statue", name: "Mayor's statue", x: 9.9, z: 2.4, r: 1.7 },
  { id: "bench", name: "Iron bench", x: -6.6, z: -16.5, r: 1.6 },
  { id: "lamp", name: "Street lamp", x: -11, z: -16.5, r: 1.5 },
  { id: "townsign", name: "Town post", x: -6.6, z: 8.8, r: 1.6 },
  { id: "book", name: "Dropped book", x: -14.2, z: 15.8, r: 1.5 },
  { id: "atlas", name: "Reading table", x: -28, z: 12.1, r: 1.6 },
  { id: "cabinet", name: "Brass cabinet", x: -30, z: 22.2, r: 1.7 },
  { id: "register", name: "Hotel register", x: -31, z: -10, r: 1.7 },
  { id: "drawer", name: "Hotel drawer", x: -30, z: -14.3, r: 1.5 },
  { id: "roomdoor", name: "Room 4", x: -28.6, z: -7.4, r: 1.7 },
  { id: "coat", name: "Hung coat", x: -28.6, z: -4, r: 1.6 },
  { id: "toolbox", name: "Toolbox", x: 13.2, z: 14.3, r: 1.5 },
  { id: "vise", name: "Bench vise", x: 30.8, z: 19.7, r: 1.6 },
  { id: "blank", name: "Gear blank", x: 28.6, z: 17.5, r: 1.6 },
  { id: "ledger", name: "Workshop ledger", x: 30.8, z: 16.4, r: 1.6 },
  { id: "parrot", name: "Mechanical parrot", x: 22, z: -12.6, r: 1.7 },
  { id: "valve", name: "Steam valve", x: 36.2, z: 0, r: 2 },
  { id: "hopper", name: "Coal hopper", x: 44, z: 1, r: 1.7 },
  { id: "keytable", name: "Hall table", x: 0, z: 36.2, r: 1.7 },
];

export const HOTSPOTS = [
  ...NPCS.map(({ id, name, x, z, r }) => ({ id, name, x, z, r })),
  ...PLACES,
];

export const NPC_SPOTS = Object.fromEntries(NPCS.map((npc) => [npc.id, [npc.x, npc.z, npc.yaw]]));

export const BUILDINGS = [
  { id: "station", name: "STATION", minX: -12, maxX: 12, minZ: -40, maxZ: -24, h: 7.6, door: { wall: "maxZ", center: 0, width: 2.8 }, open: () => true },
  { id: "tower", name: "TOWN CLOCK", minX: -4.2, maxX: 4.2, minZ: -4.2, maxZ: 4.6, h: 16, door: { wall: "minZ", center: 0, width: 2.8 }, open: () => true },
  { id: "hotel", name: "PENDULUM INN", minX: -36, maxX: -16, minZ: -20, maxZ: -2, h: 8.2, door: { wall: "maxX", center: -10.5, width: 2.8 }, open: () => true },
  { id: "library", name: "LIBRARY", minX: -36, maxX: -16, minZ: 8, maxZ: 24, h: 8.4, door: { wall: "maxX", center: 15.8, width: 2.8 }, open: () => true },
  { id: "workshop", name: "GEARWRIGHT", minX: 16, maxX: 34, minZ: 8, maxZ: 26, h: 6.9, door: { wall: "minX", center: 15.8, width: 2.8 }, open: () => true },
  { id: "mansion", name: "VESPER HOUSE", minX: -12, maxX: 12, minZ: 30, maxZ: 44, h: 11, door: { wall: "minZ", center: 0, width: 2.8 }, open: (s) => !!s?.flags?.gateOpen },
  { id: "factory", name: "OLD WORKS", minX: 38, maxX: 52, minZ: -8, maxZ: 10, h: 9.2, door: { wall: "minX", center: 0, width: 3.2 }, open: (s) => !!s?.flags?.valveOpen },
];

export const PARTITIONS = [
  { id: "room", minX: -36, maxX: -16, z: -6.05, thickness: 0.5, doorCenter: -28.6, doorWidth: 2.8, open: (s) => !!s?.flags?.roomOpen },
  { id: "loft", minX: -4.2, maxX: 4.2, z: 1.35, thickness: 0.5, doorCenter: 0, doorWidth: 2.6, open: (s) => !!s?.flags?.loftOpen },
];

export const SOLIDS = [
  { id: "fountain", x: -9.9, z: 0, r: 1.2 },
  { id: "statue", x: 9.9, z: 0, r: 0.65 },
  { id: "stallA", x: 22, z: -15.4, r: 1.15 },
  { id: "stallB", x: 30.8, z: -11, r: 1.05 },
  { id: "tree1", x: -14.3, z: 12.1, r: 0.45 },
  { id: "tree2", x: 13.2, z: -6.6, r: 0.45 },
  { id: "tree3", x: -14.5, z: -31, r: 0.4 },
  { id: "engine", x: 15.4, z: -33, r: 1.35 },
];

export const ITEMS = {
  chalk: { name: "Chalk stub", note: "A stub of chalk. The station used it for times, and then the times stopped." },
  claimTicket: { name: "Claim ticket", note: "LUGGAGE. The number is smudged. The cage will not mind." },
  scrapLeft: { name: "Torn notice", note: "Half a notice. The other half is still pretending to be a poster." },
  scrapRight: { name: "Other half", note: "The other half of a notice. Someone tore it with feeling." },
  timetable: { name: "Mended notice", note: "WHEN THE CLOCK STRIKES, WHISTLE THE SIGNAL. One blast. Bram's handwriting was not invited." },
  letter: { name: "Sealed letter", note: "For the librarian. The seal is a gear, pressed slightly off-center." },
  oilcan: { name: "Oil can", note: "A pocket oil can. Still heavy. Someone expected a stuck machine." },
  stackKey: { name: "Drawer key", note: "A small brass key. Odette said the brass drawer, and she said it only once." },
  halfPlate: { name: "Brass rubbing", note: "LEFT HAND. TWELVE TEETH. Smaller, underneath: the rest of the charter is on the loft plate, and that lamp drinks town gas." },
  ribbon: { name: "Red ribbon", note: "An archive ribbon with no book attached, which feels like gossip." },
  gearBlank: { name: "Gear blank", note: "A brass disc with no teeth and far too much potential." },
  gear: { name: "Cut gear", note: "Twelve teeth, left-handed. Ivo initialled it, then denied the sentiment." },
  gasket: { name: "Steam gasket", note: "A fibre gasket. It looks as if it left a valve in a hurry." },
  roomKey: { name: "Room 4 key", note: "Pendulum Inn, room 4. The tag has been rewritten in a neater hand than the lock deserves." },
  bob: { name: "Pendulum bob", note: "A brass weight with a hook scar. Heavy enough to be the point." },
  whistle: { name: "Tin whistle", note: "A station whistle. Pip's parrot recommended it, which is not a character reference." },
  windingKey: { name: "Winding key", note: "A long key with a toothed bow. It is not for a hotel, a cage, or a polite conversation." },
  coal: { name: "Lump of coal", note: "A lump. The tender will understand it immediately." },
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
    journal: ["The 4:10 is not a 4:10. The town smells of coal, brass, and a timetable someone tore in half."],
    hintGate: "",
    hintTier: 0,
    hintText: "",
    pose: { x: 0, z: -20.5, yaw: Math.PI, camYaw: 0, camPitch: 0.42, camDist: 4.8 },
    log: "Steam, brass, and a train that has forgotten the time. The town is waiting for somebody stubborn.",
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
  if (Math.abs(x) > 56 || Math.abs(z) > 50) return true;
  for (const solid of SOLIDS) {
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
  if (x > -3.8 && x < 3.8 && z > 1.6 && z < 4.4) return "Clock loft";
  if (x > -4.4 && x < 4.4 && z > -4.4 && z < 4.8) return "Clock tower";
  if (x > -12 && x < 12 && z < -24) return "The station";
  if (x < -16 && z < -2 && z > -20) return "Pendulum Inn";
  if (x < -16 && z > 8 && z < 24) return "The library";
  if (x > 16 && x < 34 && z > 8 && z < 26) return "The workshop";
  if (x > -12 && x < 12 && z > 30) return "Vesper House";
  if (x > 38) return "The old works";
  if (x > 18 && z < -6 && z > -18) return "The market";
  if (z < -18) return "Station yard";
  return "Town square";
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
    state.flags.bagTaken,
    state.flags.scrapsJoined,
    state.flags.cageOpened,
    state.flags.letterDelivered,
    state.flags.archiveOpened,
    state.flags.viseOiled,
    state.flags.gearCut,
    state.flags.registerMarked,
    state.flags.bobTaken,
    state.flags.parrotPaid,
    state.flags.gateOpen,
    state.flags.keyTaken,
    state.flags.valveOpen,
    state.flags.coalTaken,
    state.flags.tenderStoked,
    state.flags.hatchOpen,
    state.flags.bobHung,
    state.flags.loftOpen,
    state.flags.strikeSet,
    state.flags.signalDropped,
  ];
}

export function puzzlesSolved(state) {
  return puzzleFlags(state).filter(Boolean).length;
}

function currentGate(state) {
  const gates = [
    ["bag", !state.flags.bagTaken],
    ["claim", !state.flags.cageOpened],
    ["letter", !state.flags.letterDelivered],
    ["archive", !state.flags.archiveOpened],
    ["vise", !state.flags.viseOiled],
    ["gear", !state.flags.gearCut],
    ["register", !state.flags.registerMarked],
    ["coat", !state.flags.bobTaken],
    ["parrot", !state.flags.parrotPaid],
    ["vesper", !state.flags.gateOpen],
    ["key", !state.flags.keyTaken],
    ["valve", !state.flags.valveOpen],
    ["coal", !state.flags.coalTaken],
    ["tender", !state.flags.tenderStoked],
    ["hatch", !state.flags.hatchOpen],
    ["pendulum", !state.flags.bobHung],
    ["loft", !state.flags.loftOpen],
    ["strike", !state.flags.strikeSet],
    ["scraps", !state.flags.scrapsJoined],
    ["signal", !state.flags.signalDropped],
    ["depart", !state.flags.escaped],
  ];
  const actionable = {
    bag: !state.flags.bagTaken,
    claim: has(state, "claimTicket") && !state.flags.cageOpened,
    letter: has(state, "letter") && !state.flags.letterDelivered,
    archive: has(state, "stackKey") && !state.flags.archiveOpened,
    vise: has(state, "oilcan") && !state.flags.viseOiled,
    gear: !!state.flags.viseOiled && !state.flags.gearCut,
    register: has(state, "chalk") && !state.flags.registerMarked,
    coat: !!state.flags.registerMarked && !state.flags.bobTaken,
    parrot: has(state, "ribbon") && !state.flags.parrotPaid,
    vesper: !!state.flags.knowBrass && !state.flags.gateOpen,
    key: !!state.flags.gateOpen && !state.flags.keyTaken,
    valve: has(state, "gasket") && !state.flags.valveOpen,
    coal: !!state.flags.valveOpen && !state.flags.coalTaken,
    tender: has(state, "coal") && !state.flags.tenderStoked,
    hatch: has(state, "gear") && !state.flags.hatchOpen,
    pendulum: has(state, "bob") && !state.flags.bobHung,
    loft: has(state, "windingKey") && !state.flags.loftOpen,
    strike: !!state.flags.loftOpen && !!state.flags.hatchOpen && !!state.flags.bobHung && !state.flags.strikeSet,
    scraps: has(state, "scrapLeft") && has(state, "scrapRight") && !state.flags.scrapsJoined,
    signal: has(state, "whistle") && !!state.flags.strikeSet && !state.flags.signalDropped,
    depart: !!state.flags.signalDropped && !!state.flags.tenderStoked && !state.flags.escaped,
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
  bag: [
    "You did not arrive empty-handed. The station is keeping it for you, badly.",
    "There is a carpet bag inside the station.",
    "Pick up the carpet bag on the station floor.",
  ],
  claim: [
    "Lost luggage is a kind of promise.",
    "The claim ticket belongs at the luggage cage inside the station.",
    "Use the claim ticket on the luggage cage.",
  ],
  letter: [
    "Somebody in this town still receives letters.",
    "The sealed letter is for the woman in the library.",
    "Give the letter to Librarian Odette.",
  ],
  archive: [
    "Odette's drawers are organised by temperament.",
    "The small key opens the brass cabinet in the library.",
    "Use the drawer key on the brass cabinet.",
  ],
  vise: [
    "The workshop is stuck, in the literal sense.",
    "Ivo's bench vise wants the oil can from the luggage.",
    "Use the oil can on the bench vise.",
  ],
  gear: [
    "A blank disc is not a gear until someone chooses a number.",
    "Take the gear blank once the vise is free. The rubbing says how many teeth, and which hand. Tell Ivo.",
    "Pick up the gear blank and ask Ivo to cut a twelve-tooth left-handed gear.",
  ],
  register: [
    "The inn is out of ink and full of opinions.",
    "Hugo's register can be written in chalk. The stub came off the train with you.",
    "Use the chalk stub on the hotel register.",
  ],
  coat: [
    "Room 4 was left in a hurry, and so was its coat.",
    "The room key opens room 4. Look in the coat.",
    "Use the room key on room 4, then pick up what is in the hung coat.",
  ],
  parrot: [
    "Pip's parrot repeats useful things if you improve its temper.",
    "The archive ribbon is the sort of shine the market parrot respects.",
    "Use the red ribbon on the mechanical parrot.",
  ],
  vesper: [
    "The house on the north hill does not open for the mayor's version of events.",
    "Lady Vesper will open the gate if you know how the library files the town.",
    "Tell Lady Vesper the archive files the town under brass.",
  ],
  key: [
    "The hall is open. The table is doing the talking.",
    "The winding key is on the hall table inside Vesper House.",
    "Pick up the winding key from the hall table.",
  ],
  valve: [
    "The old works has been holding its breath.",
    "Cole's yard valve is stuck, and Ivo paid you in a gasket as well as a gear.",
    "Use the steam gasket on the valve outside the old works.",
  ],
  coal: [
    "An engine without coal is a philosophy lecture.",
    "Once the valve is seated, the hopper inside the works can spare a lump.",
    "Pick up coal from the hopper in the old works.",
  ],
  tender: [
    "The tender is a mouth.",
    "The lump of coal belongs in the engine's tender, in the station yard.",
    "Use the coal on the coal tender.",
  ],
  hatch: [
    "The clock tower has a mouth in the floor.",
    "The cut gear fits the hatch in the tower hall.",
    "Use the cut gear on the floor hatch.",
  ],
  pendulum: [
    "A clock without its weight is only furniture.",
    "The pendulum bob hangs on the hook in the tower hall.",
    "Use the pendulum bob on the pendulum hook.",
  ],
  loft: [
    "The loft door is a clock pretending to be architecture.",
    "The winding key from Vesper's hall opens the loft door inside the tower.",
    "Use the winding key on the loft door.",
  ],
  strike: [
    "The wheels upstairs are waiting for a sentence the town already wrote down.",
    "Read the charter plate in the loft once the town gas is back. The strike is three digits.",
    "Set the strike wheels to 417.",
  ],
  scraps: [
    "Someone tore a notice so it could not be obeyed by accident.",
    "One half was in the carpet bag. The other is still on the station noticeboard. Combine them.",
    "Pick up the scrap on the noticeboard and combine it with the torn notice.",
  ],
  signal: [
    "The signal arm takes the clock seriously, and then it takes a whistle.",
    "After the strike is set, the tin whistle belongs on the station signal.",
    "Use the tin whistle on the station signal.",
  ],
  depart: [
    "Bram is the one who is allowed to say the train may leave.",
    "The signal and the tender both have to be telling the truth. Then talk to Bram.",
    "Talk to Stationmaster Bram and board the train.",
  ],
  done: ["You are done.", "You are done.", "You are done."],
};

const LOOK = {
  bag: "A carpet bag slumped by the bench, like a passenger who has stopped believing in timetables.",
  board: "The station noticeboard. One scrap is still pinned. The rest is soap, sermons, and a mayor.",
  cage: "An iron luggage cage. The lock is a formality with a slot for a claim.",
  poster: "SOAP THAT RESPECTS THE SABBATH. The soap, pictured, looks unconvinced.",
  signal: "The departure signal. Its arm is up, which in this town means the clock has not given permission.",
  engine: "A small tank engine, polished in the places a proud man can reach and filthy everywhere else.",
  tender: "The tender. It is empty in a way that feels personal.",
  face: "The town clock has stopped at eleven fifty-seven. Both hands look personally offended.",
  hatch: "A hatch in the tower floor. The recess in it is toothed, like a gear that went out.",
  hook: "An empty hook under a silent pendulum rod. The rod is trying to be a clock without the heavy part.",
  loftdoor: "A narrow door to the loft. The keyhole is the shape of a clock's bow.",
  plaque: "A brass plate in the loft, and a gas lamp that is minding its own business.",
  strike: "Three brass wheels set into the loft wall. They want a number the way a door wants a key.",
  fountain: "A fountain with a bronze carp. The carp spits on a schedule. The schedule is late.",
  statue: "A statue of a mayor pointing at the future. Pigeons have filed a dissenting opinion.",
  bench: "An iron bench worn smooth by people waiting for a clock.",
  lamp: "A street lamp, lit, because the town trusts gas more than it trusts daylight.",
  townsign: "BRINDLEWICK. Underneath, newer paint: TRAINS WHEN THE CLOCK AGREES.",
  book: "A dropped novel on the library step. The bookmark is a tram ticket from somewhere with better punctuality.",
  atlas: "An atlas open to a page that is mostly sea. Brindlewick is a dot with ambitions.",
  cabinet: "A cabinet faced in brass, which is either a filing system or a warning.",
  register: "The hotel register. The inkwell is a dry rumour. The last line is a blank with a grudge.",
  drawer: "A drawer under the counter. Empty, and proud of it.",
  roomdoor: "Room 4. The lock is a hotel lock, which means it has already had a long day.",
  coat: "A coat on a peg, heavier on one side. Somebody left in a hurry and forgot the heavy side.",
  toolbox: "A toolbox outside the workshop. The tools are present. The enthusiasm is on lunch.",
  vise: "A bench vise seized around a brass blank. It has become a philosophy.",
  blank: "A toothless brass disc, pinched in the vise like a secret.",
  ledger: "Ivo's ledger. The latest page is trapped under the vise handle.",
  parrot: "A mechanical parrot on Pip's counter. It clicks its beak in the rhythm of a sentence it is not allowed to finish.",
  valve: "A steam valve on the works wall. The flange is bare. The handle will not spend the effort.",
  hopper: "A coal hopper. It has been waiting to be asked politely, or at least with a working valve.",
  keytable: "A hall table with one long key on a velvet pad, as if the key might bruise.",
  bram: "Stationmaster Bram. Navy coat, grey hair, the posture of a man who rhymes only under regulations.",
  nell: "Clerk Nell, green and quick, holding a portfolio that has never contained good news.",
  ivo: "Ivo the gearwright. Leather apron, white hair, and the expression of a man interrupted by a century.",
  odette: "Librarian Odette. Purple shawl, silver hair, and a stare that catalogues you.",
  hugo: "Innkeeper Hugo. Red waistcoat, wide as the counter, already preparing to be disappointed.",
  pip: "Market Pip. Yellow scarf, orange hair, and a parrot he pretends is a business partner.",
  vesper: "Lady Vesper. Black from hat to hem, pale as the clock face, amused by the entire hill.",
  cole: "Watchman Cole. Grey overalls, a rust-coloured cap, and the authority of a shut gate.",
};

export function dialogueFor(state, npcId) {
  if (npcId === "bram") {
    const choices = [
      { id: "late", label: "Why won't the train leave?" },
      { id: "rhyme", label: "Do you really have to rhyme?" },
    ];
    if (state.flags.signalDropped && state.flags.tenderStoked && !state.flags.escaped) {
      choices.unshift({ id: "board", label: "The train can leave." });
    }
    choices.push({ id: "bye", label: "I'll walk the platform." });
    const text = state.flags.escaped
      ? "Bram is already a memory with a better hat."
      : "Bram checks a watch, sighs at it, and puts it away. \"Time is a rumour until that clock says otherwise.\"";
    return { text, choices };
  }
  if (npcId === "nell") {
    return {
      text: "Nell taps a portfolio. \"The mayor would like the 4:10 to exist again. He would also like the credit. I would like you to be the one who gets coal under your nails.\"",
      choices: [
        { id: "help", label: "Where should I start?" },
        { id: "clock", label: "What happened to the clock?" },
        { id: "bye", label: "I'll look around." },
      ],
    };
  }
  if (npcId === "ivo") {
    const choices = [{ id: "what", label: "Can you cut a gear?" }];
    if (has(state, "gearBlank") && has(state, "halfPlate") && !state.flags.gearCut) {
      choices.unshift({ id: "cut", label: "Cut twelve teeth, left-handed." });
    }
    choices.push({ id: "bye", label: "I'll leave the vise to its thoughts." });
    const text = state.flags.gearCut
      ? "\"If it screams, it is not my gear,\" Ivo says. \"If it fits, I accept a small amount of glory.\""
      : "Ivo does not look up from a tooth he is filing into a shape the tooth did not request. \"If you are the mayor, the answer is no. If you are not, it is still probably no.\"";
    return { text, choices };
  }
  if (npcId === "odette") {
    const choices = [{ id: "files", label: "How do you file a town?" }];
    if (has(state, "letter") && !state.flags.letterDelivered) {
      choices.unshift({ id: "letter", label: "I have a letter for the library." });
    }
    choices.push({ id: "bye", label: "I'll whisper elsewhere." });
    const text = state.flags.letterDelivered
      ? "\"The brass drawer,\" Odette says, already bored of being helpful. \"Not the paper ones. The paper ones are for people who enjoy being wrong.\""
      : "Odette closes a book on a finger. \"If you have come to ask for the time, the clock has resigned and I do not blame it.\"";
    return { text, choices };
  }
  if (npcId === "hugo") {
    const choices = [{ id: "room", label: "What happened in room 4?" }];
    if (has(state, "chalk") && !state.flags.registerMarked) {
      choices.unshift({ id: "chalk", label: "I can mark the register in chalk." });
    }
    choices.push({ id: "bye", label: "I'll try the market." });
    const text = state.flags.registerMarked
      ? "\"Room 4 is yours to offend,\" Hugo says. \"The coat is not. The thing in the coat might be. I am off duty from curiosity.\""
      : "Hugo spreads empty hands over a drier inkwell. \"Guests, keys, and ink. I am currently out of the third and suspicious of the first.\"";
    return { text, choices };
  }
  if (npcId === "pip") {
    const choices = [{ id: "bird", label: "Your parrot is clicking." }];
    if (has(state, "ribbon") && !state.flags.parrotPaid) {
      choices.unshift({ id: "ribbon", label: "Would a ribbon improve him?" });
    }
    choices.push({ id: "bye", label: "I'll leave the bird to it." });
    const text = state.flags.parrotPaid
      ? "Pip beams. \"He is a poet now. A short poet. Do not encourage a second stanza.\""
      : "\"Prices are down,\" Pip says, \"because the clock is down, because the town is superstitious, because my parrot is a shareholder.\"";
    return { text, choices };
  }
  if (npcId === "vesper") {
    const choices = [
      { id: "who", label: "What is this house to the clock?" },
      { id: "mayor", label: "The mayor sent me." },
    ];
    if (state.flags.knowBrass && !state.flags.gateOpen) {
      choices.unshift({ id: "brass", label: "The archive files this town under brass." });
    }
    choices.push({ id: "bye", label: "I'll stay in the street." });
    const text = state.flags.gateOpen
      ? "\"The key is on the hall table,\" Vesper says. \"Try not to wind anyone backwards. The mayor has that privilege, and he has used it up.\""
      : "Lady Vesper studies you through the gate as if you were a draft. \"The hall opens for the archive's answer. It does not open for errands.\"";
    return { text, choices };
  }
  const choices = [
    { id: "shut", label: "Why is the yard shut?" },
    { id: "gas", label: "Did the gas go with the clock?" },
    { id: "bye", label: "I'll stay this side of the valve." },
  ];
  const text = state.flags.valveOpen
    ? "Cole peers at the valve, betrayed by its cooperation. \"Don't make a hobby of it. The hopper's inside. Leave the rest of the works where it is.\""
    : "Cole leans on a whistle he does not blow. \"Yard's shut. Valve's stuck. I am a disappointment with a hat, and the hat is the reliable part.\"";
  return { text, choices };
}

function talk(state, npcId, choiceId) {
  const s = clone(state);
  if (npcId === "bram" && choiceId === "late") {
    return say(s, "\"The signal takes its orders from the town clock,\" Bram says, \"and the town clock has taken up silence. I will not send a train out on a lie. Also the tender is empty, which is less philosophical and more annoying. When the clock has had its say, the signal likes a whistle. One blast. I am not whistling. I am in uniform.\"");
  }
  if (npcId === "bram" && choiceId === "rhyme") {
    return say(s, "\"The charter says the stationmaster announces a departure in rhyme,\" Bram says, with the face of a man reading his own sentence. \"I have been practising. The practising has not been going well.\"");
  }
  if (npcId === "bram" && choiceId === "board") {
    if (!(s.flags.signalDropped && s.flags.tenderStoked)) return keep(state, "Bram folds his arms. \"Not while the yard is still telling stories.\"");
    s.flags.escaped = true;
    s.escapedAt = s.elapsedMs;
    return say(
      s,
      "Bram squares his shoulders and produces a rhyme so modest the signal pretends not to hear it. The arm is already down. The tender is already fed. The 4:10 remembers what it is for, and you board while Brindlewick goes back to arguing with its own clock.",
      "The train left Brindlewick."
    );
  }
  if (npcId === "bram" && choiceId === "bye") return say(s, "Bram returns to a watch that has done nothing to deserve him.");
  if (npcId === "nell" && choiceId === "help") {
    return say(s, "\"Start where you landed,\" Nell says. \"The station keeps a bag better than it keeps a secret. After that, the town is a circle: library, workshop, inn, market, the house on the hill, the works, the tower. I would draw you a map, but the mayor charges for maps.\"");
  }
  if (npcId === "nell" && choiceId === "clock") {
    return say(s, "\"It stopped at eleven fifty-seven and took the railway with it,\" Nell says. \"Lady Vesper says that is the charter working as intended. The mayor says Vesper collects grudges. I say the loft of that tower has a plate nobody has read since the gas sulked off.\"");
  }
  if (npcId === "nell" && choiceId === "bye") return say(s, "Nell is already writing you into a report. You come out tidy, which is suspicious.");
  if (npcId === "ivo" && choiceId === "what") {
    return say(s, "\"I cut gears,\" Ivo says. \"The vise has seized, the oil is a memory, and there is a blank under the handle if the handle ever lets go. Bring me a count of teeth and a hand, left or right. I do not invent numbers. Numbers are how people lose fingers.\"");
  }
  if (npcId === "ivo" && choiceId === "cut") {
    if (!has(s, "gearBlank") || !has(s, "halfPlate") || s.flags.gearCut) return keep(state, "Ivo squints. \"I am not cutting a rumour.\"");
    pull(s, "gearBlank");
    s.inventory.push("gear", "gasket");
    s.flags.gearCut = true;
    return say(s, "Ivo cuts twelve left-handed teeth with insulting speed, blows brass dust off your cuff, and adds a fibre gasket as if it were small change. \"The works valve has been naked since the night the clock stopped. Do not tell Cole I am being neighbourly.\"", "Ivo cut the gear and threw in a gasket.");
  }
  if (npcId === "ivo" && choiceId === "bye") return say(s, "\"Mind the teeth,\" Ivo says, which covers several kinds.");
  if (npcId === "odette" && choiceId === "files") {
    s.flags.knowBrass = true;
    return say(s, "\"Brass, not paper,\" Odette says. \"The town files itself under the thing it is actually made of. If a house on the hill asks, that is the answer. I did not say it was a good system. I said it was ours.\"");
  }
  if (npcId === "odette" && choiceId === "letter") {
    if (!has(s, "letter") || s.flags.letterDelivered) return keep(state, "Odette has already accepted the only letter she wanted.");
    pull(s, "letter");
    s.inventory.push("stackKey");
    s.flags.letterDelivered = true;
    s.flags.knowBrass = true;
    return say(s, "Odette breaks the gear-seal with her thumb and almost smiles. \"Brass, not paper. That is the whole filing system and most of the town. The cabinet against the north wall agrees with me. This key is for that cabinet, and not for your curiosity in general.\"", "Odette took the letter and gave you a drawer key.");
  }
  if (npcId === "odette" && choiceId === "bye") return say(s, "\"Whisper if you must borrow the air,\" Odette says.");
  if (npcId === "hugo" && choiceId === "room") {
    return say(s, "\"Room 4 left a coat and a chalk debt,\" Hugo says. \"The inkwell died in the spring. Mark my register so it says a person was here, and the room is yours to disturb. The coat stays on the peg. Whatever is hiding in it has worse manners.\"");
  }
  if (npcId === "hugo" && choiceId === "chalk") {
    return markRegister(state);
  }
  if (npcId === "hugo" && choiceId === "bye") return say(s, "Hugo polishes a glass that has already surrendered.");
  if (npcId === "pip" && choiceId === "bird") {
    return say(s, "\"He repeats the last true thing he heard,\" Pip says. \"Unfortunately he heard it from a torn timetable and then became shy. A ribbon would improve his mood and my afternoon. Shiny. Red. Library-shaped, if you can steal with permission.\"");
  }
  if (npcId === "pip" && choiceId === "ribbon") {
    return payParrot(state);
  }
  if (npcId === "pip" && choiceId === "bye") return say(s, "The parrot watches you leave. It is taking notes.");
  if (npcId === "vesper" && choiceId === "who") {
    return say(s, "\"My family built the clock, and the charter that bosses it,\" Vesper says. \"I am not the reason it stopped. That was enthusiasm, poorly supervised. The hall opens for the archive's answer. The mayor's version of the town does not fit the lock.\"");
  }
  if (npcId === "vesper" && choiceId === "mayor") {
    return say(s, "Vesper's smile is a closed gate. \"Then you may tell the mayor the hill is out.\"");
  }
  if (npcId === "vesper" && choiceId === "brass") {
    if (!s.flags.knowBrass || s.flags.gateOpen) return keep(state, "Vesper waits, unconvinced.");
    s.flags.gateOpen = true;
    return say(s, "The gate unlatches itself, which is a habit it really should discuss with someone. \"Brass,\" Vesper says. \"Good. The winding key is on the hall table. The loft will know it. Try not to start the clock until it has all its parts and the charter has been read. The mayor prefers a clock that only flatters him.\"", "Vesper opened the house.");
  }
  if (npcId === "vesper" && choiceId === "bye") return say(s, "\"The street is also a kind of hall,\" Vesper says. \"A worse one.\"");
  if (npcId === "cole" && choiceId === "shut") {
    return say(s, "\"Valve's stuck, so the yard is stuck, so I am stuck,\" Cole says. \"I am not a mechanic. A mechanic would have a gasket and a regrettable sense of help. I have a hat.\"");
  }
  if (npcId === "cole" && choiceId === "gas") {
    return say(s, "\"Same night the clock quit, this valve seized and the town gas went sulky,\" Cole says. \"The loft lamp up the tower drinks from this pipe. I don't like coincidences. I also don't fix them. If you seat a gasket, the hopper inside can spare a lump. The engine in the yard has been dieting out of spite.\"");
  }
  if (npcId === "cole" && choiceId === "bye") return say(s, "Cole tips the reliable hat.");
  return keep(state, "They have nothing to add to that.");
}

function markRegister(state) {
  if (!has(state, "chalk") || state.flags.registerMarked) return keep(state, "The register has already been persuaded.");
  const s = clone(state);
  pull(s, "chalk");
  s.inventory.push("roomKey");
  s.flags.registerMarked = true;
  return say(s, "You print a name in chalk. Hugo, moved despite himself, slides over the key to room 4. \"The coat is on the peg. Search it if you must. I will be in the back, recovering from hospitality.\"", "The register earned the key to room 4.");
}

function payParrot(state) {
  if (!has(state, "ribbon") || state.flags.parrotPaid) return keep(state, "The parrot is already unbearable in a successful way.");
  const s = clone(state);
  pull(s, "ribbon");
  s.inventory.push("whistle");
  s.flags.parrotPaid = true;
  return say(s, "The parrot takes the ribbon with a click of gears and announces, very clearly, that someone should whistle the signal after the clock strikes. Pip looks proud and hands you a tin whistle, as if that were a normal transaction.", "The parrot traded a whistle for the ribbon.");
}

function applyItem(state, itemId, targetId) {
  if (!has(state, itemId)) return keep(state, "You are not holding that.");
  if (itemId === "chalk" && (targetId === "register" || targetId === "hugo")) return markRegister(state);
  if (itemId === "letter" && targetId === "odette") return talk(state, "odette", "letter");
  if (itemId === "ribbon" && (targetId === "parrot" || targetId === "pip")) return payParrot(state);
  if ((itemId === "gearBlank" && targetId === "ivo") || (itemId === "halfPlate" && targetId === "ivo")) {
    return talk(state, "ivo", "cut");
  }
  const s = clone(state);
  if (itemId === "claimTicket" && targetId === "cage") {
    if (s.flags.cageOpened) return keep(state, "The cage has already surrendered its one interesting secret.");
    pull(s, "claimTicket");
    s.inventory.push("letter", "oilcan");
    s.flags.cageOpened = true;
    return say(s, "The cage accepts the ticket the way a clerk accepts an excuse. Inside: a letter sealed with a gear, and a pocket oil can that has not been allowed to help anyone yet.", "The luggage cage held a letter and an oil can.");
  }
  if (itemId === "stackKey" && targetId === "cabinet") {
    if (s.flags.archiveOpened) return keep(state, "The brass drawer is already open. It is enjoying the attention.");
    pull(s, "stackKey");
    s.inventory.push("halfPlate", "ribbon");
    s.flags.archiveOpened = true;
    return say(s, "The brass drawer slides out, smug. Inside is a rubbing — twelve teeth, left hand — and a red ribbon that has abandoned its book.", "The brass cabinet held a rubbing and a ribbon.");
  }
  if (itemId === "oilcan" && targetId === "vise") {
    if (s.flags.viseOiled) return keep(state, "The vise is already a reformed character.");
    pull(s, "oilcan");
    s.flags.viseOiled = true;
    return say(s, "The oil goes in. The vise lets go of the blank with a sound like a grudge ending. Ivo makes a noise that might be thanks, if thanks were made of metal.", "The vise let go of the gear blank.");
  }
  if (itemId === "roomKey" && targetId === "roomdoor") {
    if (s.flags.roomOpen) return keep(state, "Room 4 is already open.");
    pull(s, "roomKey");
    s.flags.roomOpen = true;
    return say(s, "The lock turns like it has been waiting to be disappointed. Room 4 smells of a coat that left in a hurry.", "Room 4 is open.");
  }
  if (itemId === "gasket" && targetId === "valve") {
    if (s.flags.valveOpen) return keep(state, "The valve is already seated. Cole will never admit it looks better.");
    pull(s, "gasket");
    s.flags.valveOpen = true;
    return say(s, "The gasket seats. The handle gives. Somewhere in the pipework, town gas remembers its job, and Cole's hat remains the most reliable thing in the yard.", "The works valve is open.");
  }
  if (itemId === "coal" && targetId === "tender") {
    if (s.flags.tenderStoked) return keep(state, "The tender is fed. More coal would be showing off.");
    pull(s, "coal");
    s.flags.tenderStoked = true;
    return say(s, "The lump goes in. The engine makes a small, hopeful ticking, like a kettle that has heard a rumour of tea.", "The tender has coal.");
  }
  if (itemId === "gear" && targetId === "hatch") {
    if (s.flags.hatchOpen) return keep(state, "The hatch has already taken its gear.");
    pull(s, "gear");
    s.flags.hatchOpen = true;
    return say(s, "The gear drops into the toothed recess and turns a fraction, left-handed and pleased with itself. The hatch unlocks with a clock's idea of a sigh.", "The hatch took the gear.");
  }
  if (itemId === "bob" && targetId === "hook") {
    if (s.flags.bobHung) return keep(state, "The pendulum is already heavy enough.");
    pull(s, "bob");
    s.flags.bobHung = true;
    return say(s, "You hang the bob. The rod dips, considers gravity, and agrees to participate.", "The pendulum has its bob.");
  }
  if (itemId === "windingKey" && targetId === "loftdoor") {
    if (s.flags.loftOpen) return keep(state, "The loft is already open.");
    pull(s, "windingKey");
    s.flags.loftOpen = true;
    return say(s, "The long key turns. The loft door opens onto brass, shadow, and a lamp that is waiting for the town to send it gas.", "The clock loft is open.");
  }
  if (itemId === "whistle" && targetId === "signal") {
    if (!s.flags.strikeSet) return keep(state, "You blow one blast. The signal arm does not even pretend. The clock has not had its say.");
    if (s.flags.signalDropped) return keep(state, "The arm is already down. A second blast would be gloating.");
    s.flags.signalDropped = true;
    return say(s, "One blast. The signal arm drops as if the charter has tapped it on the shoulder.", "The station signal is down.");
  }
  if (itemId === "gear" && targetId === "hook") return keep(state, "The hook is not a pegboard, and the gear is not a coat.");
  if (itemId === "bob" && targetId === "hatch") return keep(state, "The hatch wants teeth, not a weight.");
  if (itemId === "windingKey" && targetId === "hatch") return keep(state, "Wrong hole. That one has teeth.");
  if (itemId === "roomKey" && targetId === "loftdoor") return keep(state, "A hotel key does not impress a clock.");
  if (itemId === "oilcan" && targetId === "parrot") return keep(state, "The parrot is loud, not rusty.");
  if (itemId === "coal" && targetId === "hugo") return keep(state, "Hugo does not take coal. He takes ink, and even that is a negotiation.");
  if (itemId === "whistle" && targetId === "bram") return keep(state, "\"I have a whistle,\" Bram says, tapping his throat. \"It is worse than yours, and I am saving it for the rhyme.\"");
  if (itemId === "gasket" && targetId === "vise") return keep(state, "The vise wanted oil. The gasket is offended to be mistaken for a lubricant.");
  return keep(state, refusal(itemId, targetId));
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
    if (action.id === "plaque") {
      if (!s.flags.loftOpen) return keep(state, "The loft door is shut. The plate can wait. It has had the practice.");
      if (!s.flags.valveOpen) return keep(state, "The gas lamp is out. You can see that the plate is writing. You cannot see which writing.");
      s.flags.plaqueRead = true;
      return say(s, "The lamp coughs awake. The charter plate reads: the clock strikes four, then one, then seven, and the railway may not pretend otherwise.", "The charter says the clock strikes four, then one, then seven.");
    }
    if (action.id === "ledger") {
      if (!s.flags.viseOiled) return say(s, "Ivo's ledger is trapped under the vise handle. The visible line says he is owed for six gears and one argument.");
      return say(s, "With the handle out of the way, the latest entry is a gear drawn with a face. Beside it: twelve, left, underlined twice.");
    }
    if (action.id === "cage" && s.flags.cageOpened) return say(s, "An open cage. It smells of paper, oil, and a job finished.");
    if (action.id === "vise" && s.flags.viseOiled) return say(s, "The vise works. It seems embarrassed about its earlier life.");
    if (action.id === "blank" && s.flags.blankTaken) return say(s, "The bench has a bright circle where the blank used to be.");
    if (action.id === "hatch" && s.flags.hatchOpen) return say(s, "The hatch wears its gear like a medal.");
    if (action.id === "hook" && s.flags.bobHung) return say(s, "The pendulum hangs true. It would like the rest of the clock to join it.");
    if (action.id === "roomdoor" && s.flags.roomOpen) return say(s, "Room 4 is open. The peg and the coat are doing most of the talking.");
    if (action.id === "coat" && s.flags.bobTaken) return say(s, "The coat is lighter, and somehow more coat-like.");
    if (action.id === "signal" && s.flags.signalDropped) return say(s, "The arm is down. The railway has remembered how to say yes.");
    if (action.id === "tender" && s.flags.tenderStoked) return say(s, "The tender is no longer a metaphor. It is a fire waiting for permission.");
    if (action.id === "valve" && s.flags.valveOpen) return say(s, "The valve holds. The pipe has the low hum of a town that has its gas back.");
    if (action.id === "strike" && s.flags.strikeSet) return say(s, "The wheels sit where the charter told them to sit.");
    if (action.id === "board" && s.flags.scrapTaken) return say(s, "The noticeboard is down to soap and a mayor. The interesting scrap has left.");
    return say(s, LOOK[action.id] || "You look. The town looks back, over the top of its spectacles.");
  }
  if (action.type === "TAKE") {
    const s = clone(state);
    if (action.id === "bag") {
      if (s.flags.bagTaken) return keep(state, "The bag is empty. It has done its one honest thing.");
      s.flags.bagTaken = true;
      s.inventory.push("chalk", "claimTicket", "scrapLeft");
      return say(s, "In the bag: a chalk stub, a smudged luggage claim, and half a torn notice.", "The carpet bag held chalk, a claim ticket, and half a notice.");
    }
    if (action.id === "board") {
      if (s.flags.scrapTaken) return keep(state, "The interesting scrap is already gone.");
      s.flags.scrapTaken = true;
      s.inventory.push("scrapRight");
      return say(s, "You unpin the remaining scrap. It matches the tear in your pocket a little too well.", "You took the other half of the notice.");
    }
    if (action.id === "blank") {
      if (!s.flags.viseOiled) return keep(state, "The vise has opinions. It is not sharing.");
      if (s.flags.blankTaken) return keep(state, "The blank is already yours.");
      s.flags.blankTaken = true;
      s.inventory.push("gearBlank");
      return say(s, "You lift the gear blank. It is warm from being gripped, and completely toothless.", "You took the gear blank.");
    }
    if (action.id === "coat") {
      if (!s.flags.roomOpen) return keep(state, "The door is shut. The coat is not that kind of famous.");
      if (s.flags.bobTaken) return keep(state, "The coat has already been searched.");
      s.flags.bobTaken = true;
      s.inventory.push("bob");
      return say(s, "The heavy side of the coat is a pendulum bob, wrapped in a handkerchief that says, in pencil, GIVE THIS BACK TO THE CLOCK.", "The coat was hiding a pendulum bob.");
    }
    if (action.id === "keytable") {
      if (!s.flags.gateOpen) return keep(state, "The gate is shut. The table can wait.");
      if (s.flags.keyTaken) return keep(state, "The velvet pad is empty.");
      s.flags.keyTaken = true;
      s.inventory.push("windingKey");
      return say(s, "You take the winding key. It is long, brass, and entirely too sure of itself.", "You took the winding key.");
    }
    if (action.id === "hopper") {
      if (!s.flags.valveOpen) return keep(state, "The hopper's chute is locked with the yard. Cole's hat is not a key.");
      if (s.flags.coalTaken) return keep(state, "You already have a lump. Greed is a second trip.");
      s.flags.coalTaken = true;
      s.inventory.push("coal");
      return say(s, "You take one honest lump. The hopper rumbles, which you choose to hear as consent.", "You took a lump of coal.");
    }
    return keep(state, "That stays where it was built. The town is attached to it.");
  }
  if (action.type === "COMBINE") {
    const { a, b } = action;
    if (a === b) return keep(state, "That does not combine with its own importance.");
    if (!has(state, a) || !has(state, b)) return keep(state, "You do not have both of those.");
    const pair = [a, b].sort().join("+");
    if (pair === "scrapLeft+scrapRight") {
      const s = clone(state);
      pull(s, "scrapLeft");
      pull(s, "scrapRight");
      s.inventory.push("timetable");
      s.flags.scrapsJoined = true;
      return say(s, "The tear matches. The mended notice says: when the clock strikes, whistle the signal. One blast. Someone had not wanted that sentence intact.", "The two scraps became one notice.");
    }
    return keep(state, `${itemName(a)} and ${itemName(b)} remain strangers.`);
  }
  if (action.type === "USE") return applyItem(state, action.itemId, action.targetId);
  if (action.type === "TALK") return talk(state, action.npcId, action.choiceId);
  if (action.type === "CODE") {
    const code = String(action.value ?? "").replace(/\s/g, "");
    if (!state.flags.loftOpen) return keep(state, "The loft is shut. The numbers bounce off the door.");
    if (!(state.flags.hatchOpen && state.flags.bobHung)) {
      return keep(state, "The wheels twitch and give up. The clock is still missing a part you can see from the hall.");
    }
    if (state.flags.strikeSet) return keep(state, "The strike is already set.");
    if (code !== STRIKE_CODE) return keep(state, "The gears try that number, dislike it, and settle back.");
    const s = clone(state);
    s.flags.strikeSet = true;
    return say(s, "Four. One. Seven. The wheels seat, the loft gives a deep polite click, and somewhere above the roofs the town clock remembers how to be a clock.", "The strike is set.");
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
    s.hintText = HINTS[gate]?.[tier] || "Keep looking. The town hides things in plain brass.";
    return { state: s, line: s.log, hint: s.hintText };
  }
  return keep(state, state.log);
}

const NPC_IDS = new Set(NPCS.map((npc) => npc.id));

export function canTake(state, id) {
  if (id === "bag") return !state.flags.bagTaken;
  if (id === "board") return !state.flags.scrapTaken;
  if (id === "blank") return !!state.flags.viseOiled && !state.flags.blankTaken;
  if (id === "coat") return !!state.flags.roomOpen && !state.flags.bobTaken;
  if (id === "keytable") return !!state.flags.gateOpen && !state.flags.keyTaken;
  if (id === "hopper") return !!state.flags.valveOpen && !state.flags.coalTaken;
  return false;
}

export function verbsFor(state, id) {
  const spot = hotspotById(id);
  if (!spot) return [];
  const verbs = [{ id: "look", label: "Look" }];
  if (canTake(state, id)) verbs.push({ id: "take", label: "Pick up" });
  if (NPC_IDS.has(id)) verbs.push({ id: "talk", label: "Talk" });
  if (id === "strike" && state.flags.loftOpen && !state.flags.strikeSet) verbs.push({ id: "operate", label: "Set the strike" });
  return verbs;
}

export function reachableHotspotIds(state) {
  const step = 1.1;
  const min = -56;
  const maxX = 56;
  const maxZ = 50;
  const startX = state.pose?.x ?? 0;
  const startZ = state.pose?.z ?? -20.5;
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
      if (nx < min || nz < min || nx > maxX || nz > maxZ) continue;
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
