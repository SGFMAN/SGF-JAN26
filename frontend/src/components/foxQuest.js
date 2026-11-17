import * as THREE from "three";

/** Six keepers — each holds one thread of the dusk-seal riddle. */
export const FOX_KEEPERS = [
  {
    id: 0,
    name: "Ash",
    title: "the Pale Banker",
    nx: -0.12,
    nz: -0.58,
    color: "#c9b8a4",
    accent: "#8a7a68",
    firstLines: [
      "I am Ash, the Pale Banker. I look after what the fire leaves behind.",
      "Talk to all six of us before the stones will do anything.",
      "You will know my place by the pale stone cairn.",
    ],
    againLines: ["You already heard me. The stones still need every fox."],
    spokenLines: [
      "Do not press me first. Set the pale ash down only after the green thorns have made a path.",
      "The voice with no town comes after me.",
    ],
  },
  {
    id: 1,
    name: "Bramble",
    title: "the Thorn Weaver",
    nx: 0.62,
    nz: -0.08,
    color: "#6f9a4e",
    accent: "#3d5c28",
    firstLines: [
      "I am Bramble, the Thorn Weaver. I bind things together.",
      "Find all six foxes. The roof stays shut if you skip anyone.",
      "My place is the green woven hut.",
    ],
    againLines: ["You already heard me. I weave only after the spark and the tear have both spoken."],
    spokenLines: [
      "I come after the morning tear has cooled the spark.",
      "Once I have made the path, the pale banker can set his ash on it.",
    ],
  },
  {
    id: 2,
    name: "Cinder",
    title: "the First Spark",
    nx: 0.48,
    nz: 0.42,
    color: "#e07038",
    accent: "#8a3010",
    firstLines: [
      "I am Cinder, the First Spark. I will not go near water.",
      "The roof will not open until you have found all of us.",
      "Look for the lantern that stays lit.",
    ],
    againLines: ["You already heard me. I am still first, once the stones are ready."],
    spokenLines: [
      "When the stones are ready, press me first. I am the spark that stays away from water.",
      "The morning tear comes straight after me. Not before.",
    ],
  },
  {
    id: 3,
    name: "Dew",
    title: "the Morning Tear",
    nx: -0.05,
    nz: 0.64,
    color: "#6ec4e0",
    accent: "#1f5f7a",
    firstLines: [
      "I am Dew, the Morning Tear. I gather on leaves in the soft light.",
      "Six foxes, one ring of stones. There is no shortcut.",
      "The glass pool near me is my mark.",
    ],
    againLines: ["You already heard me. I cool what burns, then I step aside."],
    spokenLines: [
      "I follow the spark. I never go before it.",
      "After I cool it, the green thorns can weave.",
    ],
  },
  {
    id: 4,
    name: "Echo",
    title: "the Townless Voice",
    nx: -0.64,
    nz: 0.12,
    color: "#a78bdb",
    accent: "#4a2f7a",
    firstLines: [
      "I am Echo, the Townless Voice. I have no house. I use other walls.",
      "Walk the whole wood. Every fox has to be heard.",
      "The ruined arch is mine.",
    ],
    againLines: ["You already heard me. The stones still need all six voices."],
    spokenLines: [
      "Call me after the pale ash is set down. I am the voice with no town.",
      "I come before the reed that drinks the sun.",
    ],
  },
  {
    id: 5,
    name: "Fenn",
    title: "the Sun Reed",
    nx: 0.28,
    nz: -0.36,
    color: "#e6c35c",
    accent: "#8a6a18",
    firstLines: [
      "I am Fenn, the Sun Reed. I lean toward whatever light is left.",
      "If even one fox has not spoken, the roof stays shut.",
      "The reed posts mark my place.",
    ],
    againLines: ["You already heard me. I am last, once everyone has spoken."],
    spokenLines: [
      "I am last. I am the reed that drinks the sun.",
      "Press me only after the voice with no town. Then the roof can open.",
    ],
  },
];

/** Pedestal activation order once all keepers have been heard. */
export const SEAL_ORDER = [2, 3, 1, 0, 4, 5];

export const QUEST_POEM = [
  "Open the roof by pressing the six stones in the right order.",
  "First, the spark that will not go near water.",
  "Then cool that spark with the morning tear.",
  "Then the green thorns weave a path.",
  "Then set the pale ash down on that path.",
  "Then call the voice that has no town.",
  "Last, the reed that drinks the sun.",
  "Get that order right and the roof opens.",
];

function boxMesh(w, h, d, color, emissive = null, emissiveIntensity = 0.2) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0.08,
    emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
    emissiveIntensity: emissive ? emissiveIntensity : 0,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function cylMesh(rTop, rBot, h, color, emissive = null) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.06,
    emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
    emissiveIntensity: emissive ? 0.35 : 0,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

const DRY_MARGIN = 0.35;

function isDryLand(world, x, z) {
  if ((x / world.halfW) ** 2 + (z / world.halfD) ** 2 > 0.82) return false;
  return world.dirt.sample(x, z) > world.seaLevel + DRY_MARGIN;
}

function outsideAvoid(avoid, x, z) {
  if (!avoid) return true;
  return Math.hypot(x - avoid.x, z - avoid.z) >= avoid.radius;
}

/** Find dry land near a preferred point. Never returns an underwater spot. */
function sampleDry(world, x, z, avoid = null) {
  if (isDryLand(world, x, z) && outsideAvoid(avoid, x, z)) {
    return { x, z, y: world.dirt.sample(x, z) };
  }

  let best = null;
  for (let ring = 1; ring <= 28; ring += 1) {
    const dist = ring * 2.2;
    const steps = Math.max(10, ring * 6);
    for (let i = 0; i < steps; i += 1) {
      const ang = (i / steps) * Math.PI * 2;
      const nx = x + Math.sin(ang) * dist;
      const nz = z + Math.cos(ang) * dist;
      if (!isDryLand(world, nx, nz) || !outsideAvoid(avoid, nx, nz)) continue;
      const yy = world.dirt.sample(nx, nz);
      if (!best || yy > best.y) best = { x: nx, z: nz, y: yy };
    }
    if (best) return best;
  }

  // Last resort: scan the bowl for any dry cell.
  let fallback = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ang = (attempt / 120) * Math.PI * 2;
    const dist = 6 + (attempt % 20) * Math.min(world.halfW, world.halfD) * 0.03;
    const nx = Math.sin(ang) * dist;
    const nz = Math.cos(ang) * dist;
    if (!isDryLand(world, nx, nz) || !outsideAvoid(avoid, nx, nz)) continue;
    const yy = world.dirt.sample(nx, nz);
    if (!fallback || yy > fallback.y) fallback = { x: nx, z: nz, y: yy };
  }
  if (fallback) return fallback;

  // Absolute fallback: highest sampled dirt point we can find.
  let peak = { x: 0, z: 0, y: -Infinity };
  for (let i = 0; i < 64; i += 1) {
    const ang = (i / 64) * Math.PI * 2;
    const dist = Math.min(world.halfW, world.halfD) * (0.15 + (i % 8) * 0.08);
    const nx = Math.sin(ang) * dist;
    const nz = Math.cos(ang) * dist;
    if ((nx / world.halfW) ** 2 + (nz / world.halfD) ** 2 > 0.82) continue;
    if (!outsideAvoid(avoid, nx, nz)) continue;
    const yy = world.dirt.sample(nx, nz);
    if (yy > peak.y) peak = { x: nx, z: nz, y: yy };
  }
  return peak;
}

/** How far past the outermost stone foxes must stay. */
const STONE_CLEAR_PAD = 3.4;

export function stoneRingAvoid(shrine, pedestals) {
  if (!shrine) return null;
  let radius = 7.2;
  for (let i = 0; i < (pedestals || []).length; i += 1) {
    const ped = pedestals[i];
    radius = Math.max(radius, Math.hypot(ped.x - shrine.x, ped.z - shrine.z));
  }
  return { x: shrine.x, z: shrine.z, radius: radius + STONE_CLEAR_PAD };
}

export function isOnStoneRing(shrine, pedestals, x, z) {
  const avoid = stoneRingAvoid(shrine, pedestals);
  if (!avoid) return false;
  return !outsideAvoid(avoid, x, z);
}

export function foxHomePosition(world, keeper, avoid = null) {
  const x = keeper.nx * world.halfW * 0.72;
  const z = keeper.nz * world.halfD * 0.72;
  return sampleDry(world, x, z, avoid);
}

/**
 * Builds shrine ring, cabin poem board, and per-fox landmark props.
 * Returns handles for runtime interaction / glow updates.
 */
export function buildFoxQuestProps(parent, world) {
  clearQuestGroup(parent);

  const shrineDry = sampleDry(world, -0.22 * world.halfW, -0.18 * world.halfD);
  const shrine = { x: shrineDry.x, z: shrineDry.z, y: shrineDry.y };

  const pedestals = [];
  const ringR = 7.2;
  for (let i = 0; i < FOX_KEEPERS.length; i += 1) {
    const keeper = FOX_KEEPERS[i];
    const ang = -Math.PI / 2 + (i / FOX_KEEPERS.length) * Math.PI * 2;
    // Prefer the ring point, but always settle on dry land.
    const idealX = shrine.x + Math.sin(ang) * ringR;
    const idealZ = shrine.z + Math.cos(ang) * ringR;
    const dry = sampleDry(world, idealX, idealZ);
    const root = new THREE.Group();
    root.position.set(dry.x, dry.y, dry.z);
    const base = cylMesh(0.85, 1.05, 0.45, "#3a342e");
    base.position.y = 0.22;
    const pillar = cylMesh(0.38, 0.45, 1.55, "#4a433c", keeper.color);
    pillar.position.y = 1.15;
    const cap = boxMesh(0.95, 0.18, 0.95, keeper.accent, keeper.color, 0.45);
    cap.position.y = 2.0;
    root.add(base, pillar, cap);
    parent.add(root);
    pedestals.push({
      id: keeper.id,
      root,
      pillar,
      cap,
      x: dry.x,
      z: dry.z,
      lit: false,
    });
  }

  // Central altar dish — same dry shrine footing.
  const altar = new THREE.Group();
  altar.position.set(shrine.x, shrine.y, shrine.z);
  const altarBase = cylMesh(1.6, 1.9, 0.5, "#2e2924");
  altarBase.position.y = 0.25;
  const dish = cylMesh(1.1, 0.7, 0.35, "#5a3d6e", "#7b3fa8");
  dish.position.y = 0.65;
  altar.add(altarBase, dish);
  parent.add(altar);

  // Poem cabin — dry land only.
  const cabinPos = sampleDry(world, 0.18 * world.halfW, 0.08 * world.halfD);
  const cabin = new THREE.Group();
  cabin.position.set(cabinPos.x, cabinPos.y, cabinPos.z);
  const floor = boxMesh(5.2, 0.25, 4.2, "#3b2f24");
  floor.position.y = 0.12;
  const wallL = boxMesh(0.25, 2.4, 4.0, "#4a3b2e");
  wallL.position.set(-2.4, 1.3, 0);
  const wallR = boxMesh(0.25, 2.4, 4.0, "#4a3b2e");
  wallR.position.set(2.4, 1.3, 0);
  const wallB = boxMesh(5.0, 2.4, 0.25, "#453628");
  wallB.position.set(0, 1.3, -1.9);
  const roof = boxMesh(5.6, 0.22, 4.6, "#2a221c");
  roof.position.y = 2.65;
  roof.rotation.z = 0.04;
  const board = boxMesh(2.4, 1.6, 0.12, "#1a1510", "#6b4a9a", 0.15);
  board.position.set(0, 1.45, 1.85);
  cabin.add(floor, wallL, wallR, wallB, roof, board);
  parent.add(cabin);

  // Landmarks near each fox home.
  const landmarks = [];
  for (let i = 0; i < FOX_KEEPERS.length; i += 1) {
    const keeper = FOX_KEEPERS[i];
    const home = foxHomePosition(world, keeper, stoneRingAvoid(shrine, pedestals));
    const mark = new THREE.Group();
    mark.position.set(home.x, home.y, home.z);
    if (keeper.id === 0) {
      // Charcoal cairn
      mark.add(cylMesh(0.7, 0.9, 0.7, "#2a2622"));
      const top = cylMesh(0.35, 0.55, 0.5, "#4a4540", keeper.color);
      top.position.y = 0.55;
      mark.add(top);
    } else if (keeper.id === 1) {
      // Woven hut frame
      const hut = boxMesh(2.2, 1.8, 2.2, "#355028", keeper.color, 0.2);
      hut.position.y = 0.9;
      mark.add(hut);
    } else if (keeper.id === 2) {
      // Lantern post
      const post = cylMesh(0.12, 0.16, 2.4, "#3a2a1c");
      post.position.y = 1.2;
      const lamp = boxMesh(0.5, 0.55, 0.5, "#5a2a10", keeper.color, 0.9);
      lamp.position.y = 2.5;
      mark.add(post, lamp);
    } else if (keeper.id === 3) {
      // Mirror pool rim
      const rim = cylMesh(1.4, 1.5, 0.25, "#35555e", keeper.color);
      rim.position.y = 0.15;
      mark.add(rim);
    } else if (keeper.id === 4) {
      // Ruined arch
      const l = boxMesh(0.45, 2.8, 0.45, "#4a4060", keeper.color, 0.25);
      l.position.set(-1.1, 1.4, 0);
      const r = boxMesh(0.45, 2.8, 0.45, "#4a4060", keeper.color, 0.25);
      r.position.set(1.1, 1.4, 0);
      const top = boxMesh(2.8, 0.4, 0.45, "#3a3550", keeper.color, 0.3);
      top.position.y = 2.9;
      mark.add(l, r, top);
    } else {
      // Reed totem
      for (let r = 0; r < 5; r += 1) {
        const reed = cylMesh(0.05, 0.07, 1.6 + r * 0.15, "#6a7a30", keeper.color);
        reed.position.set((r - 2) * 0.22, 0.9, (r % 2) * 0.15);
        mark.add(reed);
      }
    }
    parent.add(mark);
    landmarks.push({ id: keeper.id, root: mark, x: home.x, z: home.z });
  }

  return {
    shrine,
    pedestals,
    altar,
    cabin: { root: cabin, x: cabinPos.x, z: cabinPos.z },
    landmarks,
  };
}

export function clearQuestGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

export function setPedestalLit(pedestal, lit) {
  pedestal.lit = lit;
  const mats = [pedestal.pillar.material, pedestal.cap.material];
  mats.forEach((mat) => {
    mat.emissiveIntensity = lit ? 1.15 : 0.35;
  });
}

export function createSealBeam() {
  const geo = new THREE.CylinderGeometry(1.35, 1.9, 1, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#b44dff"),
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.visible = false;
  beam.frustumCulled = false;
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#e9c6ff"),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1, 16, 1, true), coreMat);
  beam.add(core);
  return beam;
}

export function sampleDomeRoofY(x, z, halfW, halfD, wallH) {
  const nx = x / Math.max(1, halfW);
  const nz = z / Math.max(1, halfD);
  const d2 = nx * nx + nz * nz;
  if (d2 >= 0.98) return null;
  return wallH * Math.sqrt(Math.max(0, 1 - d2)) + 0.12;
}
