import React, { useEffect, useRef, useState } from "react";
import { createTownAudio } from "./audio.js";
import {
  ITEMS,
  PUZZLE_TOTAL,
  areaName,
  createGame,
  dialogueFor,
  hotspotById,
  puzzlesSolved,
  reduce,
  verbsFor,
} from "./logic.js";
import { clearGame, loadGame, saveGame } from "./save.js";
import { mountTown } from "./world.js";

const TINT = {
  chalk: "#f4f1ea",
  claimTicket: "#e6d7b0",
  scrapLeft: "#efe6d4",
  scrapRight: "#e4d8c4",
  timetable: "#f7f1e2",
  letter: "#f3efe4",
  oilcan: "#c4552a",
  stackKey: "#d4b36a",
  halfPlate: "#e1c27a",
  ribbon: "#a32030",
  gearBlank: "#c6a15a",
  gear: "#e0b45a",
  gasket: "#8d8478",
  roomKey: "#d4b36a",
  bob: "#c9a24a",
  whistle: "#d9dde2",
  windingKey: "#e1b03a",
  coal: "#2a2a2a",
};

const btn = {
  border: "1px solid rgba(255,244,220,0.45)",
  background: "rgba(12, 28, 36, 0.82)",
  color: "#f6edd8",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  font: "inherit",
};

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Clockwork({ onExit }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const audioBag = useRef(null);
  const panelRef = useRef(null);
  const pausedRef = useRef(false);
  const messageRef = useRef(null);
  const nearRef = useRef(null);
  const [mode, setMode] = useState("menu");
  const [paused, setPaused] = useState(false);
  const [game, setGame] = useState(null);
  const [session, setSession] = useState(0);
  const [panel, setPanel] = useState(null);
  const [verbTarget, setVerbTarget] = useState(null);
  const [talkNpc, setTalkNpc] = useState(null);
  const [message, setMessage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [near, setNear] = useState(null);
  const [area, setArea] = useState("Station yard");
  const [muted, setMuted] = useState(true);
  const [hasSave, setHasSave] = useState(() => !!loadGame());
  const [code, setCode] = useState("");
  const [elapsed, setElapsed] = useState(0);
  if (audioBag.current == null) audioBag.current = createTownAudio();

  useEffect(() => {
    panelRef.current = panel;
    pausedRef.current = paused;
    messageRef.current = message;
  }, [panel, paused, message]);

  function showMessage(text) {
    if (!text) return;
    messageRef.current = text;
    setMessage(text);
  }

  function commit(next, result) {
    stateRef.current = next;
    setGame(next);
    saveGame(next);
    if (next.flags.escaped) {
      setPaused(false);
      setPanel(null);
      setMessage(null);
      messageRef.current = null;
      setMode("won");
      audioBag.current.success();
    } else if (result?.line && /took|gave|became|opened|cut|marked|hung|strike|whistle|joined|traded|seated|fed/i.test(result.line)) {
      audioBag.current.take();
    }
  }

  function apply(action) {
    const prev = stateRef.current;
    if (!prev) return null;
    const result = reduce(prev, action);
    commit(result.state, result);
    if (!result.state.flags.escaped && action.type !== "POSE" && action.type !== "TICK") {
      const text = action.type === "HINT"
        ? `Hint ${result.state.hintTier || 1} of 3. ${result.hint || result.state.hintText || ""}`
        : result.line;
      if (text) showMessage(text);
    }
    return result;
  }

  function startNew() {
    clearGame();
    const next = createGame(Date.now());
    stateRef.current = next;
    setGame(next);
    setSelected(null);
    setPanel(null);
    setPaused(false);
    setVerbTarget(null);
    setTalkNpc(null);
    messageRef.current = next.log;
    setMessage(next.log);
    setMode("play");
    setSession((n) => n + 1);
    setHasSave(false);
    saveGame(next);
  }

  function continueGame() {
    const saved = loadGame();
    if (!saved) return;
    stateRef.current = saved;
    setGame(saved);
    setPanel(null);
    setPaused(false);
    setMode(saved.flags.escaped ? "won" : "play");
    setSession((n) => n + 1);
  }

  useEffect(() => {
    if (mode !== "play" || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const input = { keys: new Set(), lookX: 0, lookY: 0, wheel: 0, jump: false, blocked: false };
    const island = mountTown(canvas, () => stateRef.current || createGame(0));
    let frame = 0;
    let last = performance.now();
    let poseAcc = 0;
    let lastNear = null;
    let alive = true;

    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", " ", "i", "escape"].includes(key) || event.key === " ") {
        event.preventDefault();
      }
      if (messageRef.current) {
        if (key === "escape" || key === "enter") {
          event.preventDefault();
          messageRef.current = null;
          setMessage(null);
        }
        return;
      }
      if (key === "escape") {
        if (panelRef.current) {
          setPanel(null);
          setVerbTarget(null);
          setTalkNpc(null);
          return;
        }
        setPaused((value) => !value);
        return;
      }
      if (pausedRef.current || panelRef.current) {
        if (key === "i" && panelRef.current === "inventory") setPanel(null);
        return;
      }
      if (key === "i") {
        setPanel("inventory");
        return;
      }
      if (event.key === " " && !event.repeat) input.jump = true;
      if (key.length === 1) input.keys.add(key);
      if (event.key === "Shift") input.keys.add("shift");
    };
    const onKeyUp = (event) => {
      input.keys.delete(event.key.toLowerCase());
      if (event.key === "Shift") input.keys.delete("shift");
    };
    let dragging = false;
    let moved = false;
    let downX = 0;
    let downY = 0;
    const openTarget = (id) => {
      if (!id) return;
      setVerbTarget(id);
      setPanel("verbs");
    };
    const onDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      downX = event.clientX;
      downY = event.clientY;
    };
    const onUp = (event) => {
      const clicked = dragging && !moved && event.button === 0 && event.target === canvas;
      dragging = false;
      if (!clicked || pausedRef.current || panelRef.current || messageRef.current) {
        if (!panelRef.current && !messageRef.current) canvas.style.cursor = "grab";
        return;
      }
      openTarget(island.pick(event.clientX, event.clientY));
    };
    const onMove = (event) => {
      if (dragging && !pausedRef.current && !panelRef.current && !messageRef.current) {
        const dx = event.clientX - downX;
        const dy = event.clientY - downY;
        if (dx * dx + dy * dy > 36) moved = true;
        if (moved) {
          input.lookX += event.movementX * 0.005;
          input.lookY += event.movementY * 0.003;
          canvas.style.cursor = "grabbing";
        }
        return;
      }
      if (event.target !== canvas || pausedRef.current || panelRef.current || messageRef.current) return;
      canvas.style.cursor = island.pick(event.clientX, event.clientY) ? "pointer" : "grab";
    };
    const onWheel = (event) => {
      event.preventDefault();
      if (messageRef.current || pausedRef.current || panelRef.current) return;
      input.wheel += event.deltaY * 0.004;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const onResize = () => island.resize();
    window.addEventListener("resize", onResize);
    island.resize();

    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      input.blocked = pausedRef.current || !!panelRef.current || !!messageRef.current || stateRef.current?.flags?.escaped;
      const step = island.update(dt, input);
      if (step.moving) audioBag.current.step(now / 1000);
      audioBag.current.ambience(now / 1000);
      const id = island.nearest();
      nearRef.current = id;
      if (id !== lastNear) {
        lastNear = id;
        setNear(id);
      }
      poseAcc += dt;
      if (poseAcc > 2 && stateRef.current && !stateRef.current.flags.escaped) {
        poseAcc = 0;
        const pose = island.getPose();
        const next = { ...stateRef.current, pose };
        stateRef.current = next;
        saveGame(next);
        const spot = areaName(pose.x, pose.z);
        setArea((prev) => (prev === spot ? prev : spot));
        setElapsed(next.elapsedMs);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      if (stateRef.current && !stateRef.current.flags.escaped) {
        const pose = island.getPose();
        const next = { ...stateRef.current, pose };
        stateRef.current = next;
        saveGame(next);
      }
      island.destroy();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [mode, session]);

  useEffect(() => {
    if (mode !== "play") return undefined;
    const timer = setInterval(() => {
      const current = stateRef.current;
      if (!current || current.flags.escaped) return;
      const next = { ...current, elapsedMs: current.elapsedMs + 1000 };
      stateRef.current = next;
      setElapsed(next.elapsedMs);
      saveGame(next);
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, session]);

  useEffect(() => () => audioBag.current?.stop(), []);

  const dialogue = talkNpc && game ? dialogueFor(game, talkNpc) : null;
  const verbs = verbTarget && game ? verbsFor(game, verbTarget) : [];
  const solved = game ? puzzlesSolved(game) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#071018", color: "#f6edd8", fontFamily: "Georgia, 'Palatino Linotype', serif" }}>
      {mode === "menu" ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "radial-gradient(ellipse at 50% 80%, #5c4a32 0%, #141820 58%)" }}>
          <div style={{ letterSpacing: "0.28em", fontSize: 13, opacity: 0.7 }}>SANDPIT</div>
          <h1 style={{ margin: 0, fontSize: 46, fontWeight: 700, letterSpacing: "0.03em", textAlign: "center" }}>The Clockwork Conspiracy</h1>
          <p style={{ margin: 0, maxWidth: 460, textAlign: "center", opacity: 0.85 }}>The train is late.</p>
          <button type="button" style={{ ...btn, padding: "12px 22px", fontSize: 18 }} onClick={startNew}>New Game</button>
          {hasSave ? (
            <button type="button" style={{ ...btn, padding: "12px 22px", fontSize: 18 }} onClick={continueGame}>Continue Game</button>
          ) : null}
          <p style={{ maxWidth: 520, textAlign: "center", fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
            WASD move · Shift run · Space jump · drag the mouse to look · wheel zooms · click an object to use it · I inventory · Esc pause
          </p>
          <button type="button" style={btn} onClick={onExit}>Exit Game</button>
        </div>
      ) : null}

      {mode !== "menu" ? (
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: "grab" }} />
      ) : null}

      {mode === "play" && game ? (
        <>
          <div style={{ position: "absolute", top: 58, left: 16, zIndex: 3, textShadow: "0 1px 2px #000" }}>
            <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.8 }}>{area}</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>{formatTime(elapsed || game.elapsedMs)}</div>
          </div>
          <div style={{ position: "absolute", top: 58, right: 16, zIndex: 4, display: "flex", gap: 8 }}>
          <button type="button" style={btn} onClick={() => apply({ type: "HINT" })}>Hint</button>
            <button type="button" style={btn} onClick={() => setPanel("journal")}>Journal</button>
            <button type="button" style={btn} onClick={() => setPanel("inventory")}>Inventory</button>
            <button
              type="button"
              style={btn}
              onClick={async () => setMuted(await audioBag.current.toggle())}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button type="button" style={btn} onClick={() => setPaused(true)}>Pause</button>
            <button type="button" style={btn} onClick={onExit}>Exit Game</button>
          </div>
          {near && !panel && !paused && !message ? (
            <button
              type="button"
              onClick={() => {
                setVerbTarget(near);
                setPanel("verbs");
              }}
              style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 3, background: "rgba(8,18,24,0.78)", border: "1px solid rgba(255,244,220,0.35)", borderRadius: 999, padding: "8px 14px", color: "#f6edd8", font: "inherit", cursor: "pointer" }}
            >
              Click {hotspotById(near)?.name}
            </button>
          ) : null}
        </>
      ) : null}

      {panel === "verbs" && verbTarget && game ? (
        <div style={{ position: "absolute", left: "50%", bottom: 120, transform: "translateX(-50%)", zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: 520 }}>
          {verbs.map((verb) => (
            <button
              key={verb.id}
              type="button"
              style={btn}
              onClick={() => {
                if (verb.id === "look") apply({ type: "LOOK", id: verbTarget });
                if (verb.id === "take") apply({ type: "TAKE", id: verbTarget });
                if (verb.id === "talk") setTalkNpc(verbTarget);
                if (verb.id === "operate" && verbTarget === "strike") {
                  setCode("");
                  setPanel("code");
                }
                if (verb.id !== "operate") {
                  setPanel(verb.id === "talk" ? "dialogue" : null);
                  if (verb.id !== "talk") setVerbTarget(null);
                }
              }}
            >
              {verb.label}
            </button>
          ))}
          {selected ? (
            <button
              type="button"
              style={{ ...btn, borderColor: "#e1b03a" }}
              onClick={() => {
                apply({ type: "USE", itemId: selected, targetId: verbTarget });
                setPanel(null);
                setVerbTarget(null);
              }}
            >
              Use {ITEMS[selected]?.name}
            </button>
          ) : null}
          <button type="button" style={btn} onClick={() => { setPanel(null); setVerbTarget(null); }}>Close</button>
        </div>
      ) : null}

      {panel === "dialogue" && dialogue ? (
        <div style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", width: "min(720px, calc(100% - 40px))", zIndex: 5, background: "rgba(10, 20, 28, 0.94)", border: "1px solid rgba(255,244,220,0.4)", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 18, marginBottom: 12, lineHeight: 1.45 }}>{dialogue.text}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dialogue.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                style={{ ...btn, textAlign: "left" }}
                onClick={() => {
                  const result = apply({ type: "TALK", npcId: talkNpc, choiceId: choice.id });
                  if (choice.id === "bye" || result?.state?.flags?.escaped) {
                    setPanel(null);
                    setTalkNpc(null);
                  }
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "inventory" && game ? (
        <div style={{ position: "absolute", left: "50%", top: 120, transform: "translateX(-50%)", width: "min(760px, calc(100% - 32px))", zIndex: 5, background: "rgba(10, 20, 28, 0.94)", border: "1px solid rgba(255,244,220,0.4)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Inventory</strong>
            <button type="button" style={btn} onClick={() => setPanel(null)}>Close</button>
          </div>
          {game.inventory.length === 0 ? <p>Your pockets are empty.</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {game.inventory.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (selected && selected !== id) {
                    apply({ type: "COMBINE", a: selected, b: id });
                    setSelected(null);
                    return;
                  }
                  setSelected(id);
                  if (ITEMS[id]?.note) showMessage(ITEMS[id].note);
                }}
                style={{
                  ...btn,
                  width: 132,
                  minHeight: 92,
                  borderColor: selected === id ? "#e1b03a" : "rgba(255,244,220,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 8, background: TINT[id] || "#888", display: "inline-block", boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.25)" }} />
                {ITEMS[id]?.name || id}
              </button>
            ))}
          </div>
          <p style={{ opacity: 0.75 }}>Select an object to read about it. Select two in a row to combine them.</p>
        </div>
      ) : null}

      {panel === "journal" && game ? (
        <div style={{ position: "absolute", left: "50%", top: 110, transform: "translateX(-50%)", width: "min(640px, calc(100% - 32px))", maxHeight: "60vh", overflow: "auto", zIndex: 5, background: "rgba(10, 20, 28, 0.94)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Journal</strong>
            <button type="button" style={btn} onClick={() => setPanel(null)}>Close</button>
          </div>
          {game.journal.map((entry, index) => (
            <p key={`${index}-${entry.slice(0, 12)}`} style={{ lineHeight: 1.45 }}>{entry}</p>
          ))}
        </div>
      ) : null}

      {panel === "code" ? (
        <form
          style={{ position: "absolute", left: "50%", top: "38%", transform: "translate(-50%, -50%)", zIndex: 5, background: "rgba(10, 20, 28, 0.95)", padding: 18, borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}
          onSubmit={(event) => {
            event.preventDefault();
            apply({ type: "CODE", value: code });
            setPanel(null);
            setVerbTarget(null);
          }}
        >
          <strong>Three digits.</strong>
          <input value={code} onChange={(event) => setCode(event.target.value)} autoFocus inputMode="numeric" maxLength={3} style={{ font: "inherit", padding: 8, borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btn}>Try</button>
            <button type="button" style={btn} onClick={() => setPanel(null)}>Close</button>
          </div>
        </form>
      ) : null}

      {message && mode !== "won" ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 8,
            background: "rgba(4, 10, 14, 0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ width: "min(640px, 100%)", background: "#122028", border: "1px solid rgba(255,244,220,0.45)", borderRadius: 16, padding: "22px 22px 18px", boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}>
            <p style={{ margin: "0 0 18px", fontSize: 20, lineHeight: 1.5, color: "#ffffff" }}>{message}</p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                autoFocus
                style={{ ...btn, padding: "10px 22px", minWidth: 88 }}
                onClick={() => {
                  messageRef.current = null;
                  setMessage(null);
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paused && mode === "play" && !message ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 6, background: "rgba(4, 10, 14, 0.72)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Paused</h2>
          <button type="button" style={btn} onClick={() => setPaused(false)}>Resume</button>
          <button type="button" style={btn} onClick={startNew}>Restart Game</button>
          <button type="button" style={btn} onClick={onExit}>Exit Game</button>
        </div>
      ) : null}

      {mode === "won" && game ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 7, background: "radial-gradient(ellipse at 50% 30%, rgba(92,74,50,0.92), rgba(12,14,18,0.96))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <div style={{ letterSpacing: "0.22em", fontSize: 13 }}>GAME COMPLETED</div>
          <h2 style={{ margin: 0, fontSize: 48 }}>You caught the train.</h2>
          <p style={{ maxWidth: 560, lineHeight: 1.5 }}>{game.log}</p>
          <div>Time {formatTime(game.escapedAt ?? game.elapsedMs)}</div>
          <div>Puzzles solved {solved} / {PUZZLE_TOTAL}</div>
          <button type="button" style={{ ...btn, padding: "12px 18px" }} onClick={startNew}>Play again</button>
          <button type="button" style={btn} onClick={onExit}>Exit Game</button>
        </div>
      ) : null}
    </div>
  );
}
