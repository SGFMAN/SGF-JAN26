import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

const FLY_SIZE = 26;
const GIANT_FLY_SIZE = 58;
const MIN_FLIES_BASE = 5;
/** Swatter SVG 80×80: square mesh rect in viewBox coords (see render). */
const SWATTER = {
  canvas: 80,
  offsetX: -40,
  offsetY: -56,
  meshX: 8,
  meshY: 4,
  meshW: 64,
  meshH: 52,
  /** Vertical shift of mesh at impact (matches swatSlam keyframe). */
  slamDy: 22,
};
const BASE_SPEED_MIN = 55;
const BASE_SPEED_RANGE = 95;
const MAX_SPEED = 520;
const COMBO_WINDOW_MS = 2000;
/** Continuous acceleration per second (applied in the game loop). */
const TIME_ACCEL_PER_SEC = 0.045;
const GIANT_PER_WAVE_CHANCE = 0.4;
const TIMER_BASE_SEC = 30;
const TIMER_LESS_PER_LEVEL = 2.5;
const TIMER_MIN_SEC = 12;
const TIMEOUT_FLY_MS = 1400;
const TIMEOUT_CRACK_PAUSE_MS = 2000;

const LEVEL_BACKGROUNDS = [
  "radial-gradient(ellipse 120% 80% at 50% 20%, #fff9c4 0%, #dce775 35%, #aed581 70%, #7cb342 100%)",
  "radial-gradient(ellipse 120% 80% at 50% 15%, #ffe0b2 0%, #ffcc80 40%, #ffb74d 75%, #f57c00 100%)",
  "radial-gradient(ellipse 120% 80% at 50% 25%, #b3e5fc 0%, #81d4fa 35%, #4fc3f7 70%, #0288d1 100%)",
  "radial-gradient(ellipse 120% 80% at 50% 20%, #e1bee7 0%, #ce93d8 40%, #ab47bc 75%, #6a1b9a 100%)",
  "radial-gradient(ellipse 120% 80% at 50% 18%, #ffcdd2 0%, #ef9a9a 40%, #e57373 75%, #c62828 100%)",
  "radial-gradient(ellipse 120% 80% at 50% 22%, #c8e6c9 0%, #a5d6a7 35%, #66bb6a 70%, #2e7d32 100%)",
];

function flySize(f) {
  return f.giant ? GIANT_FLY_SIZE : FLY_SIZE;
}

/** Axis-aligned hit box for the square mesh at pointer (impact pose). */
function swatterMeshRect(pointerX, pointerY, slam = true) {
  const dy = slam ? SWATTER.slamDy : 0;
  const left = pointerX + SWATTER.offsetX + SWATTER.meshX;
  const top = pointerY + SWATTER.offsetY + SWATTER.meshY + dy;
  return {
    left,
    top,
    right: left + SWATTER.meshW,
    bottom: top + SWATTER.meshH,
  };
}

function flyBounds(f) {
  const s = flySize(f);
  return { left: f.x, top: f.y, right: f.x + s, bottom: f.y + s };
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function randomVel(speedMult = 1, giant = false) {
  const a = Math.random() * Math.PI * 2;
  const base = BASE_SPEED_MIN + Math.random() * BASE_SPEED_RANGE;
  const s = (giant ? base * 0.55 : base) * speedMult;
  return { vx: Math.cos(a) * s, vy: Math.sin(a) * s };
}

function spawnFly(id, w, h, speedMult = 1, giant = false) {
  const pad = giant ? 56 : 48;
  const size = giant ? GIANT_FLY_SIZE : FLY_SIZE;
  return {
    id,
    giant,
    x: pad + Math.random() * Math.max(80, w - size - pad * 2),
    y: pad + Math.random() * Math.max(80, h - size - pad * 2),
    alive: true,
    wing: Math.random() * Math.PI * 2,
    wobble: Math.random() * Math.PI * 2,
    ...randomVel(speedMult, giant),
  };
}

function clampFlySpeed(f) {
  const sp = Math.hypot(f.vx, f.vy);
  if (sp <= MAX_SPEED) return;
  const scale = MAX_SPEED / sp;
  f.vx *= scale;
  f.vy *= scale;
}

function makeSplat(x, y, giant = false) {
  const parts = [];
  const n = giant ? 16 : 9;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = (giant ? 28 : 12) + Math.random() * (giant ? 36 : 14);
    parts.push({
      dx: Math.cos(a) * dist,
      dy: Math.sin(a) * dist,
      rot: Math.random() * 360,
      size: (giant ? 10 : 5) + Math.random() * (giant ? 12 : 6),
    });
  }
  return { id: `splat-${Date.now()}-${Math.random()}`, kind: "splat", x, y, giant, parts, born: Date.now() };
}

function levelTimeLimit(waveLevel) {
  return Math.max(TIMER_MIN_SEC, TIMER_BASE_SEC - (waveLevel - 1) * TIMER_LESS_PER_LEVEL);
}

function FlyGraphic({ size, giant = false, wing = 0 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: "block" }}>
      <ellipse
        cx="16"
        cy="18"
        rx={giant ? 9 : 7}
        ry={giant ? 11 : 9}
        fill={giant ? "#3d4a2a" : "#1a1a1a"}
      />
      <ellipse
        cx="10"
        cy="12"
        rx={giant ? 11 : 9}
        ry={giant ? 5 : 4}
        fill={giant ? "rgba(120,160,90,0.75)" : "rgba(180,220,255,0.55)"}
        transform={`rotate(${-25 + Math.sin(wing) * 22} 10 12)`}
      />
      <ellipse
        cx="22"
        cy="12"
        rx={giant ? 11 : 9}
        ry={giant ? 5 : 4}
        fill={giant ? "rgba(90,130,70,0.8)" : "rgba(180,220,255,0.55)"}
        transform={`rotate(${25 - Math.sin(wing) * 22} 22 12)`}
      />
      {giant ? (
        <>
          <ellipse cx="16" cy="20" rx="5" ry="3" fill="rgba(60,40,20,0.35)" />
          <circle cx="12" cy="16" r="2.2" fill="#fff" />
          <circle cx="20" cy="16" r="2.2" fill="#fff" />
          <circle cx="12.5" cy="16.5" r="1.1" fill="#111" />
          <circle cx="20.5" cy="16.5" r="1.1" fill="#111" />
        </>
      ) : (
        <>
          <circle cx="13" cy="16" r="1.8" fill="#fff" />
          <circle cx="19" cy="16" r="1.8" fill="#fff" />
          <circle cx="13.4" cy="16.4" r="0.9" fill="#111" />
          <circle cx="19.4" cy="16.4" r="0.9" fill="#111" />
        </>
      )}
    </svg>
  );
}

/** Jagged crack paths (viewBox 0–100); impact near centre. */
const SCREEN_CRACK_PATHS = [
  {
    d: "M50 50 L47 44 L52 36 L45 28 L51 18 L43 9 L32 4 L18 3 L6 8 L2 14",
    w: 0.55,
    o: 0.88,
  },
  {
    d: "M50 50 L54 43 L49 34 L56 24 L52 14 L61 6 L74 2 L88 5 L96 12 L99 8",
    w: 0.5,
    o: 0.85,
  },
  {
    d: "M50 50 L44 48 L36 52 L24 49 L12 51 L3 48 L0 42 L1 55 L4 62",
    w: 0.48,
    o: 0.82,
  },
  {
    d: "M50 50 L56 51 L64 47 L78 50 L91 54 L99 50 L100 58 L97 68",
    w: 0.5,
    o: 0.84,
  },
  {
    d: "M50 50 L48 56 L53 64 L46 74 L52 84 L41 93 L28 97 L14 94 L5 88",
    w: 0.52,
    o: 0.86,
  },
  {
    d: "M50 50 L55 57 L51 66 L58 76 L54 86 L63 94 L78 98 L92 92 L98 84",
    w: 0.54,
    o: 0.87,
  },
  {
    d: "M50 50 L42 46 L38 38 L42 26 L35 16 L40 8",
    w: 0.32,
    o: 0.65,
  },
  {
    d: "M50 50 L58 46 L64 38 L60 26 L68 14",
    w: 0.3,
    o: 0.62,
  },
  {
    d: "M50 50 L46 58 L40 66 L44 78 L38 88",
    w: 0.32,
    o: 0.64,
  },
  {
    d: "M50 50 L56 58 L62 68 L58 80 L64 90",
    w: 0.3,
    o: 0.63,
  },
  {
    d: "M50 50 L38 52 L28 56 L22 48 L14 58 L8 50",
    w: 0.28,
    o: 0.58,
  },
  {
    d: "M50 50 L62 52 L72 56 L78 48 L86 56 L92 50",
    w: 0.28,
    o: 0.58,
  },
  {
    d: "M50 50 L50 38 L48 24 L52 10 L50 2",
    w: 0.38,
    o: 0.72,
  },
  {
    d: "M50 50 L50 62 L47 76 L53 90 L50 98",
    w: 0.4,
    o: 0.74,
  },
  {
    d: "M12 8 L18 14 L10 22 L4 18 L8 10",
    w: 0.22,
    o: 0.5,
  },
  {
    d: "M88 10 L82 16 L90 24 L96 18",
    w: 0.2,
    o: 0.48,
  },
  {
    d: "M8 82 L14 76 L6 68 L2 74",
    w: 0.22,
    o: 0.5,
  },
  {
    d: "M92 88 L86 82 L94 74 L98 80",
    w: 0.2,
    o: 0.48,
  },
];

function ScreenCracks() {
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 45,
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {SCREEN_CRACK_PATHS.map((c, i) => (
        <path
          key={i}
          d={c.d}
          fill="none"
          stroke="rgba(12,12,12,0.9)"
          strokeWidth={c.w}
          strokeOpacity={c.o}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {SCREEN_CRACK_PATHS.map((c, i) => (
        <path
          key={`hi-${i}`}
          d={c.d}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={c.w * 0.35}
          strokeOpacity={c.o * 0.7}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d="M50 50 L46 42 L54 38 L48 32 L52 46 L44 52 L56 48 Z"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(30,30,30,0.4)"
        strokeWidth="0.2"
      />
      <path
        d="M0 0 L8 12 L0 24 M100 0 L92 14 L100 28 M0 100 L10 88 L0 76 M100 100 L90 86 L100 72"
        fill="none"
        stroke="rgba(25,25,25,0.55)"
        strokeWidth="0.35"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function makePopup(x, y, text, giant = false) {
  return {
    id: `pop-${Date.now()}-${Math.random()}`,
    kind: "popup",
    x,
    y,
    text,
    giant,
    born: Date.now(),
  };
}

/**
 * Playground mini-game: swat flies with the mouse (custom fly-swatter cursor).
 */
export default function FlySwatGame({ onBack }) {
  const arenaRef = useRef(null);
  const fliesRef = useRef([]);
  const nextIdRef = useRef(1);
  const sizeRef = useRef({ w: 800, h: 600 });
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const speedMultRef = useRef(1);
  const comboRef = useRef(0);
  const lastHitAtRef = useRef(0);
  const levelClearingRef = useRef(false);
  const lastSpeedUiRef = useRef(0);
  const timeLeftRef = useRef(TIMER_BASE_SEC);
  const gamePhaseRef = useRef("playing");
  const timeoutTimersRef = useRef([]);

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [speedLevel, setSpeedLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE_SEC);
  const [timeLimit, setTimeLimit] = useState(TIMER_BASE_SEC);
  const [gamePhase, setGamePhase] = useState("playing");
  const [showCracks, setShowCracks] = useState(false);
  const [showPlayAgainModal, setShowPlayAgainModal] = useState(false);
  const [attackWing, setAttackWing] = useState(0);
  const [flies, setFlies] = useState([]);
  const [effects, setEffects] = useState([]);
  const [mouse, setMouse] = useState({ x: -200, y: -200, swatting: false });
  const [swatAnimKey, setSwatAnimKey] = useState(0);
  const [swatImpact, setSwatImpact] = useState(null);
  const [inArena, setInArena] = useState(false);
  const [levelFlash, setLevelFlash] = useState(false);

  const setPhase = useCallback((phase) => {
    gamePhaseRef.current = phase;
    setGamePhase(phase);
  }, []);

  const clearTimeoutTimers = useCallback(() => {
    for (const id of timeoutTimersRef.current) {
      window.clearTimeout(id);
    }
    timeoutTimersRef.current = [];
  }, []);

  const resetTimerForLevel = useCallback((waveLevel) => {
    const limit = levelTimeLimit(waveLevel);
    timeLeftRef.current = limit;
    setTimeLeft(limit);
    setTimeLimit(limit);
  }, []);

  const syncFliesState = useCallback(() => {
    setFlies(fliesRef.current.filter((f) => f.alive).map((f) => ({ ...f })));
  }, []);

  const pushEffects = useCallback((items) => {
    if (!items.length) return;
    setEffects((prev) => [...prev, ...items].slice(-48));
  }, []);

  const spawnWave = useCallback(
    (waveLevel) => {
      const { w, h } = sizeRef.current;
      const count = MIN_FLIES_BASE + Math.min(12, waveLevel - 1) * 2;
      const mult = 1 + (waveLevel - 1) * 0.12;
      speedMultRef.current = mult;
      setSpeedLevel(mult);

      fliesRef.current = [];
      for (let i = 0; i < count; i++) {
        fliesRef.current.push(spawnFly(nextIdRef.current++, w, h, mult, false));
      }
      if (Math.random() < GIANT_PER_WAVE_CHANCE || waveLevel % 3 === 0) {
        fliesRef.current.push(spawnFly(nextIdRef.current++, w, h, mult * 0.85, true));
      }
      resetTimerForLevel(waveLevel);
      syncFliesState();
    },
    [resetTimerForLevel, syncFliesState]
  );

  const restartGame = useCallback(() => {
    clearTimeoutTimers();
    setShowPlayAgainModal(false);
    setShowCracks(false);
    setPhase("playing");
    levelClearingRef.current = false;
    comboRef.current = 0;
    lastHitAtRef.current = 0;
    speedMultRef.current = 1;
    setSpeedLevel(1);
    setScore(0);
    setLevel(1);
    setCombo(0);
    setEffects([]);
    setLevelFlash(false);
    spawnWave(1);
  }, [clearTimeoutTimers, setPhase, spawnWave]);

  const triggerTimeOut = useCallback(() => {
    if (gamePhaseRef.current !== "playing" || levelClearingRef.current) return;
    setPhase("timeout");
    setShowCracks(false);
    setShowPlayAgainModal(false);

    const t1 = window.setTimeout(() => {
      setShowCracks(true);
      const t2 = window.setTimeout(() => {
        setShowPlayAgainModal(true);
        setPhase("modal");
      }, TIMEOUT_CRACK_PAUSE_MS);
      timeoutTimersRef.current.push(t2);
    }, TIMEOUT_FLY_MS);
    timeoutTimersRef.current.push(t1);
  }, [setPhase]);

  const advanceLevel = useCallback(() => {
    if (levelClearingRef.current) return;
    if (fliesRef.current.some((f) => f.alive)) return;

    levelClearingRef.current = true;
    const { w, h } = sizeRef.current;
    pushEffects([
      makePopup(w / 2, h / 2, "LEVEL CLEAR!", false),
      makePopup(w / 2, h / 2 - 36, "Next wave…", false),
    ]);
    setLevelFlash(true);

    window.setTimeout(() => {
      setLevel((lv) => {
        const next = lv + 1;
        spawnWave(next);
        return next;
      });
      setLevelFlash(false);
      levelClearingRef.current = false;
    }, 900);
  }, [pushEffects, spawnWave]);

  const measureArena = useCallback(() => {
    const el = arenaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    sizeRef.current = { w: r.width, h: r.height };
  }, []);

  useEffect(() => {
    measureArena();
    const ro = new ResizeObserver(measureArena);
    if (arenaRef.current) ro.observe(arenaRef.current);
    return () => ro.disconnect();
  }, [measureArena]);

  useEffect(() => {
    const prune = setInterval(() => {
      const now = Date.now();
      setEffects((prev) => prev.filter((e) => now - e.born < 700));
    }, 120);
    return () => clearInterval(prune);
  }, []);

  useEffect(() => {
    let wingRaf = 0;
    const wingTick = () => {
      if (gamePhaseRef.current === "timeout") {
        setAttackWing((w) => w + 0.35);
      }
      wingRaf = requestAnimationFrame(wingTick);
    };
    wingRaf = requestAnimationFrame(wingTick);
    return () => cancelAnimationFrame(wingRaf);
  }, []);

  useEffect(() => {
    measureArena();
    clearTimeoutTimers();
    comboRef.current = 0;
    lastHitAtRef.current = 0;
    levelClearingRef.current = false;
    setLevel(1);
    setCombo(0);
    setEffects([]);
    setLevelFlash(false);
    setShowCracks(false);
    setShowPlayAgainModal(false);
    setPhase("playing");
    spawnWave(1);

    const tick = (ts) => {
      rafRef.current = requestAnimationFrame(tick);
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;
      if (dt <= 0) return;

      if (gamePhaseRef.current !== "playing" || levelClearingRef.current) {
        return;
      }

      timeLeftRef.current -= dt;
      if (timeLeftRef.current <= 0) {
        timeLeftRef.current = 0;
        setTimeLeft(0);
        triggerTimeOut();
        return;
      }

      const accel = 1 + TIME_ACCEL_PER_SEC * dt;
      speedMultRef.current *= accel;

      if (ts - lastSpeedUiRef.current > 100) {
        lastSpeedUiRef.current = ts;
        setTimeLeft(timeLeftRef.current);
        setSpeedLevel(speedMultRef.current);
      }

      const { w, h } = sizeRef.current;

      for (const f of fliesRef.current) {
        if (!f.alive) continue;
        const size = flySize(f);
        f.vx *= accel;
        f.vy *= accel;
        clampFlySpeed(f);
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.wing += dt * (f.giant ? 10 : 14);
        f.wobble += dt * 3;

        if (f.x <= 8) {
          f.x = 8;
          f.vx = Math.abs(f.vx);
        } else if (f.x >= w - size - 8) {
          f.x = w - size - 8;
          f.vx = -Math.abs(f.vx);
        }
        if (f.y <= 8) {
          f.y = 8;
          f.vy = Math.abs(f.vy);
        } else if (f.y >= h - size - 8) {
          f.y = h - size - 8;
          f.vy = -Math.abs(f.vy);
        }

        if (Math.random() < (f.giant ? 0.004 : 0.008)) {
          const nv = randomVel(speedMultRef.current, f.giant);
          f.vx = nv.vx;
          f.vy = nv.vy;
        }
      }

      syncFliesState();
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeoutTimers();
    };
  }, [clearTimeoutTimers, measureArena, setPhase, spawnWave, syncFliesState, triggerTimeOut]);

  const trySwat = useCallback(
    (clientX, clientY) => {
      const el = arenaRef.current;
      if (!el || levelClearingRef.current || gamePhaseRef.current !== "playing") return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const mesh = swatterMeshRect(x, y, true);
      const swatted = [];

      for (const f of fliesRef.current) {
        if (!f.alive) continue;
        if (boxesOverlap(flyBounds(f), mesh)) {
          f.alive = false;
          swatted.push(f);
        }
      }

      if (swatted.length === 0) {
        comboRef.current = 0;
        setCombo(0);
        return;
      }

      const now = Date.now();
      const nextCombo =
        lastHitAtRef.current && now - lastHitAtRef.current <= COMBO_WINDOW_MS
          ? comboRef.current + 1
          : 1;
      comboRef.current = nextCombo;
      lastHitAtRef.current = now;
      setCombo(nextCombo);

      let points = 0;
      const newEffects = [];
      for (const f of swatted) {
        const size = flySize(f);
        const cx = f.x + size / 2;
        const cy = f.y + size / 2;
        const base = f.giant ? 12 : 1;
        points += base * Math.max(1, nextCombo);
        newEffects.push(makeSplat(cx, cy, f.giant));
      }
      const label =
        swatted.length > 1
          ? `+${points}`
          : swatted[0].giant
            ? `+${points} BLOWFLY`
            : nextCombo > 1
              ? `+${points} ×${nextCombo}`
              : `+${points}`;
      const anchor = swatted[0];
      const aSize = flySize(anchor);
      newEffects.push(makePopup(anchor.x + aSize / 2, anchor.y, label, anchor.giant));

      setScore((s) => s + points);
      pushEffects(newEffects);
      syncFliesState();

      if (!fliesRef.current.some((f) => f.alive)) {
        advanceLevel();
      }
    },
    [advanceLevel, pushEffects, syncFliesState]
  );

  const onPointerDown = (e) => {
    if (e.button !== 0 || gamePhase !== "playing") return;
    const el = arenaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMouse({ x, y, swatting: true });
    setSwatAnimKey((k) => k + 1);
    const mesh = swatterMeshRect(x, y, true);
    setSwatImpact({
      left: mesh.left,
      top: mesh.top,
      width: SWATTER.meshW,
      height: SWATTER.meshH,
      born: Date.now(),
    });
    window.setTimeout(() => setSwatImpact(null), 280);
    trySwat(e.clientX, e.clientY);
  };

  const onPointerUp = () => {
    setMouse((m) => ({ ...m, swatting: false }));
  };

  const onPointerMove = (e) => {
    const el = arenaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMouse({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      swatting: e.buttons === 1,
    });
  };

  const bgIndex = (level - 1) % LEVEL_BACKGROUNDS.length;
  const timerUrgent = timeLeft <= 8 && gamePhase === "playing";
  const timerPct = timeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / timeLimit)) : 0;
  const inputLocked = gamePhase !== "playing";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: LIGHT_MONUMENT,
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          padding: "10px 14px",
          background: "#2d4a22",
          borderBottom: "2px solid #1a2f14",
          boxSizing: "border-box",
        }}
      >
        {typeof onBack === "function" ? (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "2px solid rgba(255,255,255,0.4)",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: WHITE,
              background: "rgba(255,255,255,0.1)",
              cursor: "pointer",
            }}
          >
            ← Playground menu
          </button>
        ) : null}
        <Link
          to="/projects"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: "10px",
            border: "2px solid rgba(255,255,255,0.4)",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: WHITE,
            background: "rgba(255,255,255,0.1)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ← Back to main
        </Link>
        <span style={{ fontSize: "1.15rem", fontWeight: 700, color: WHITE, letterSpacing: "0.5px" }}>
          Fly Swat
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.95rem", fontWeight: 700, color: "#c5e1a5" }}>
          Level {level}
          <span style={{ color: "rgba(255,255,255,0.85)", marginLeft: "12px" }}>Score: {score}</span>
          {combo > 1 ? (
            <span style={{ color: "#fff59d", marginLeft: "10px" }}>Combo ×{combo}</span>
          ) : null}
          <span style={{ color: "rgba(255,255,255,0.75)", marginLeft: "10px", fontWeight: 600 }}>
            Speed ×{speedLevel.toFixed(2)}
          </span>
        </span>
      </div>

      <div
        ref={arenaRef}
        role="application"
        aria-label="Fly swatting arena"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setInArena(false);
          setMouse((m) => ({ ...m, swatting: false }));
        }}
        onPointerEnter={() => {
          if (!inputLocked) setInArena(true);
        }}
        onPointerMove={(e) => {
          if (inputLocked) return;
          setInArena(true);
          onPointerMove(e);
        }}
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          cursor: inputLocked ? "default" : "none",
          touchAction: "none",
          background: LEVEL_BACKGROUNDS[bgIndex],
          boxShadow: "inset 0 0 80px rgba(0,0,0,0.08)",
          transition: "background 0.9s ease",
        }}
      >
        {levelFlash ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.45)",
              pointerEvents: "none",
              zIndex: 15,
              animation: "levelFlash 0.9s ease-out forwards",
            }}
          />
        ) : null}

        {gamePhase === "playing" ? (
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              top: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: timerUrgent ? "2.6rem" : "2.2rem",
                fontWeight: 800,
                color: timerUrgent ? "#b71c1c" : "#1b5e20",
                textShadow: "0 2px 8px rgba(255,255,255,0.95), 0 0 2px #fff",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                animation: timerUrgent ? "timerPulse 0.5s ease-in-out infinite" : "none",
              }}
            >
              {Math.ceil(timeLeft)}s
            </div>
            <div
              style={{
                width: "140px",
                height: "8px",
                borderRadius: "4px",
                background: "rgba(0,0,0,0.15)",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.5)",
              }}
            >
              <div
                style={{
                  width: `${timerPct * 100}%`,
                  height: "100%",
                  background: timerUrgent
                    ? "linear-gradient(90deg, #ef5350, #c62828)"
                    : "linear-gradient(90deg, #81c784, #2e7d32)",
                  transition: "width 0.1s linear",
                }}
              />
            </div>
          </div>
        ) : null}

        {gamePhase === "playing"
          ? flies.map((f) => {
              const size = flySize(f);
              return (
                <div
                  key={f.id}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: f.x,
                    top: f.y,
                    width: size,
                    height: size,
                    pointerEvents: "none",
                    transform: `rotate(${Math.sin(f.wobble) * (f.giant ? 10 : 18)}deg)`,
                    filter: f.giant ? "drop-shadow(0 0 10px rgba(74,106,42,0.9))" : undefined,
                    zIndex: f.giant ? 5 : 1,
                  }}
                >
                  <FlyGraphic size={size} giant={f.giant} wing={f.wing} />
                </div>
              );
            })
          : null}

        {gamePhase === "timeout" || showCracks ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 40,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                animation: gamePhase === "timeout" ? "flyAttackZoom 1.4s ease-in forwards" : "none",
                transform: showCracks && gamePhase !== "timeout" ? "scale(5.5)" : undefined,
              }}
            >
              <FlyGraphic size={GIANT_FLY_SIZE} giant={true} wing={attackWing} />
            </div>
          </div>
        ) : null}

        {showCracks ? (
          <>
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.12)",
                zIndex: 44,
                pointerEvents: "none",
                animation: "crackDim 0.4s ease-out forwards",
              }}
            />
            <div style={{ animation: "crackAppear 0.35s ease-out forwards" }}>
              <ScreenCracks />
            </div>
          </>
        ) : null}

        {effects.map((e) => {
          const age = Date.now() - e.born;
          if (e.kind === "splat") {
            return (
              <div
                key={e.id}
                aria-hidden
                style={{
                  position: "absolute",
                  left: e.x,
                  top: e.y,
                  pointerEvents: "none",
                  opacity: Math.max(0, 1 - age / 650),
                  transform: `scale(${1 + age / 900})`,
                  zIndex: 8,
                }}
              >
                {e.parts.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: p.dx,
                      top: p.dy,
                      width: p.size,
                      height: p.size * 0.65,
                      borderRadius: "45%",
                      background: e.giant ? "#3e4a2e" : "#2d2d2d",
                      transform: `rotate(${p.rot}deg)`,
                      opacity: e.giant ? 0.9 : 0.75,
                    }}
                  />
                ))}
              </div>
            );
          }
          return (
            <div
              key={e.id}
              aria-hidden
              style={{
                position: "absolute",
                left: e.x,
                top: e.y - age / 5,
                transform: "translate(-50%, -100%)",
                fontSize: e.giant ? "1.1rem" : "0.95rem",
                fontWeight: 800,
                color: e.giant ? "#33691e" : "#1b5e20",
                textShadow: "0 1px 3px rgba(255,255,255,0.9)",
                pointerEvents: "none",
                opacity: Math.max(0, 1 - age / 600),
                zIndex: 12,
              }}
            >
              {e.text}
            </div>
          );
        })}

        {swatImpact ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: swatImpact.left,
              top: swatImpact.top,
              width: swatImpact.width,
              height: swatImpact.height,
              pointerEvents: "none",
              zIndex: 18,
              borderRadius: "3px",
              boxSizing: "border-box",
              border: "2px solid rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.25)",
              animation: "swatImpactFlash 0.28s ease-out forwards",
            }}
          />
        ) : null}

        {inArena && mouse.x >= 0 && gamePhase === "playing" ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: mouse.x,
              top: mouse.y,
              width: SWATTER.canvas,
              height: SWATTER.canvas,
              marginLeft: SWATTER.offsetX,
              marginTop: SWATTER.offsetY,
              pointerEvents: "none",
              filter: "drop-shadow(2px 4px 6px rgba(0,0,0,0.35))",
              zIndex: 20,
              transformOrigin: "50% 88%",
            }}
          >
            <div
              key={swatAnimKey}
              style={{
                width: "100%",
                height: "100%",
                animation: "swatSlam 0.28s cubic-bezier(0.34, 1.2, 0.48, 1) forwards",
                transformOrigin: "50% 88%",
              }}
            >
              <svg width={SWATTER.canvas} height={SWATTER.canvas} viewBox="0 0 80 80">
                <line x1="40" y1="54" x2="40" y2="78" stroke="#4e342e" strokeWidth="5" strokeLinecap="round" />
                <line x1="40" y1="54" x2="40" y2="8" stroke="#5d4037" strokeWidth="4" strokeLinecap="round" />
                <rect x="8" y="4" width="64" height="52" rx="3" fill="#8d6e63" stroke="#5d4037" strokeWidth="2.5" />
                <rect x="12" y="8" width="56" height="44" fill="none" stroke="#6d4c41" strokeWidth="1.5" />
                {[20, 32, 44, 56].map((gx) => (
                  <line
                    key={`v${gx}`}
                    x1={gx}
                    y1="10"
                    x2={gx}
                    y2="50"
                    stroke="#6d4c41"
                    strokeWidth="1"
                    opacity="0.65"
                  />
                ))}
                {[18, 28, 38].map((gy) => (
                  <line
                    key={`h${gy}`}
                    x1="14"
                    y1={gy}
                    x2="66"
                    y2={gy}
                    stroke="#6d4c41"
                    strokeWidth="1"
                    opacity="0.65"
                  />
                ))}
              </svg>
            </div>
          </div>
        ) : null}
      </div>

      {showPlayAgainModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fly-swat-play-again-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "14px",
              padding: "28px 32px",
              maxWidth: "360px",
              width: "calc(100% - 40px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              textAlign: "center",
            }}
          >
            <h2
              id="fly-swat-play-again-title"
              style={{ margin: "0 0 8px", fontSize: "1.35rem", color: LIGHT_MONUMENT }}
            >
              Time&apos;s up!
            </h2>
            <p style={{ margin: "0 0 20px", color: "#555", fontSize: "0.95rem", lineHeight: 1.45 }}>
              A fly smashed the screen. You reached level {level} with score {score}.
            </p>
            <p style={{ margin: "0 0 22px", fontWeight: 700, fontSize: "1.05rem", color: LIGHT_MONUMENT }}>
              Play again?
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={restartGame}
                style={{
                  padding: "12px 24px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#558b2f",
                  color: WHITE,
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  clearTimeoutTimers();
                  if (typeof onBack === "function") onBack();
                }}
                style={{
                  padding: "12px 24px",
                  borderRadius: "10px",
                  border: `2px solid ${LIGHT_MONUMENT}`,
                  background: WHITE,
                  color: LIGHT_MONUMENT,
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes swatSlam {
          0% {
            transform: rotate(-4deg) translateY(0) scale(1);
          }
          35% {
            transform: rotate(-14deg) translateY(22px) scale(0.9);
          }
          55% {
            transform: rotate(-10deg) translateY(18px) scale(0.93);
          }
          100% {
            transform: rotate(-2deg) translateY(0) scale(1);
          }
        }
        @keyframes swatImpactFlash {
          0% {
            opacity: 0.85;
            transform: scale(0.92);
          }
          100% {
            opacity: 0;
            transform: scale(1.05);
          }
        }
        @keyframes levelFlash {
          from { opacity: 0.7; }
          to { opacity: 0; }
        }
        @keyframes timerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes flyAttackZoom {
          0% {
            transform: scale(0.12);
            opacity: 0.5;
          }
          55% {
            transform: scale(2.2);
            opacity: 1;
          }
          100% {
            transform: scale(5.5);
            opacity: 1;
          }
        }
        @keyframes crackAppear {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes crackDim {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
