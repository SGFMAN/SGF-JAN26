import React, { useEffect, useMemo, useRef, useState } from "react";
import { createJungleAudio } from "./audio.js";
import { actionLabel, cursorFor, nextAction } from "./cursors.js";
import { disposeItemIcons, getItemIcon } from "./icons.js";
import {
  ITEMS,
  NPCS,
  PUZZLE_TOTAL,
  areaName,
  canTake,
  createGame,
  dialogueFor,
  hotspotById,
  puzzlesSolved,
  reduce,
  verbsFor,
} from "./logic.js";
import { clearGame, loadGame, saveGame } from "./save.js";
import { mountJungle } from "./world.js";

const NPC_SET = new Set(NPCS.map((npc) => npc.id));

function buildIconMap() {
  const next = {};
  for (const id of Object.keys(ITEMS)) next[id] = getItemIcon(id);
  return next;
}

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

function actionIsHot(action, id, state, selected) {
  if (!id || !state) return false;
  if (action === "look") return true;
  if (action === "take") return canTake(state, id);
  if (action === "talk") return NPC_SET.has(id);
  if (action === "use") {
    if (selected) return true;
    return verbsFor(state, id).some((verb) => verb.id === "operate");
  }
  return false;
}

export default function LostExpedition({ onExit }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const audioRef = useRef(null);
  const panelRef = useRef(null);
  const pausedRef = useRef(false);
  const messageRef = useRef(null);
  const nearRef = useRef(null);
  const actionRef = useRef("walk");
  const selectedRef = useRef(null);
  const jungleRef = useRef(null);
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
  const [area, setArea] = useState("Base camp");
  const [muted, setMuted] = useState(true);
  const [hasSave, setHasSave] = useState(() => !!loadGame());
  const [code, setCode] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [action, setAction] = useState("walk");
  const iconMap = useMemo(() => buildIconMap(), []);
  if (audioRef.current == null) audioRef.current = createJungleAudio();

  useEffect(() => {
    panelRef.current = panel;
    pausedRef.current = paused;
    messageRef.current = message;
  }, [panel, paused, message]);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => () => disposeItemIcons(), []);

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
      audioRef.current.success();
    } else if (result?.line && /took|gave|became|opened|cut|marked|hung|strike|whistle|joined|traded|seated|fed|tuned|oiled|pinned|copied|wound|climbed|aligned|lit|sent|matched|broken|meshed/i.test(result.line)) {
      audioRef.current.take();
    }
  }

  function apply(actionPayload) {
    const prev = stateRef.current;
    if (!prev) return null;
    const result = reduce(prev, actionPayload);
    commit(result.state, result);
    if (!result.state.flags.escaped && actionPayload.type !== "POSE" && actionPayload.type !== "TICK") {
      const text = actionPayload.type === "HINT"
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
    setAction("walk");
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
    setAction("walk");
    setMode(saved.flags.escaped ? "won" : "play");
    setSession((n) => n + 1);
  }

  function openVerbMenu(id) {
    if (!id) return;
    setVerbTarget(id);
    setPanel("verbs");
  }

  const performActionRef = useRef(null);

  useEffect(() => {
    performActionRef.current = (id, clientX, clientY) => {
      const state = stateRef.current;
      const current = actionRef.current;
      const held = selectedRef.current;
      const jungle = jungleRef.current;
      if (!state || !jungle) return;

      if (current === "walk") {
        if (id) {
          const spot = hotspotById(id);
          if (spot) jungle.setWalkTarget(spot.x, spot.z);
          return;
        }
        const ground = jungle.pickGround(clientX, clientY);
        if (ground) jungle.setWalkTarget(ground.x, ground.z);
        else showMessage("The ground declines the invitation.");
        return;
      }

      if (!id) {
        if (current === "look") showMessage("Mud, leaves, and a long walk still ahead.");
        else if (current === "take") showMessage("There is nothing here worth putting in a pocket.");
        else if (current === "talk") showMessage("The jungle has opinions, but not conversation.");
        else if (current === "use") {
          if (held) showMessage(`${ITEMS[held]?.name || "That"} needs a more willing target.`);
          else showMessage("Use it on what, exactly?");
        }
        return;
      }

      if (current === "look") {
        apply({ type: "LOOK", id });
        return;
      }

      if (current === "take") {
        if (!canTake(state, id)) {
          showMessage(NPC_SET.has(id)
            ? "People are not collectibles. Usually."
            : "It refuses to come quietly.");
          return;
        }
        apply({ type: "TAKE", id });
        return;
      }

      if (current === "talk") {
        if (!NPC_SET.has(id)) {
          showMessage("It has nothing to say, and means it.");
          return;
        }
        setTalkNpc(id);
        setPanel("dialogue");
        return;
      }

      if (current === "use") {
        if (held) {
          apply({ type: "USE", itemId: held, targetId: id });
          return;
        }
        const verbs = verbsFor(state, id);
        if (verbs.some((verb) => verb.id === "operate") && id === "starWheel") {
          setVerbTarget(id);
          setCode("");
          setPanel("code");
          return;
        }
        showMessage("Select something in Inventory first, or try a different approach.");
      }
    };
  });

  useEffect(() => {
    if (mode !== "play" || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const input = { keys: new Set(), lookX: 0, lookY: 0, wheel: 0, jump: false, blocked: false };
    const jungle = mountJungle(canvas, () => stateRef.current || createGame(0));
    jungleRef.current = jungle;
    let frame = 0;
    let last = performance.now();
    let poseAcc = 0;
    let lastNear = null;
    let alive = true;

    const paintCursor = (clientX, clientY, draggingLook = false) => {
      if (draggingLook) {
        canvas.style.cursor = "grabbing";
        return;
      }
      if (pausedRef.current || panelRef.current || messageRef.current) {
        canvas.style.cursor = "default";
        return;
      }
      const id = jungle.pick(clientX, clientY);
      const hot = actionIsHot(actionRef.current, id, stateRef.current, selectedRef.current);
      canvas.style.cursor = cursorFor(actionRef.current, hot);
    };

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
    let downButton = 0;

    const onContextMenu = (event) => {
      if (event.target === canvas) event.preventDefault();
    };

    const onDown = (event) => {
      if (event.target !== canvas) return;
      if (event.button === 2) {
        event.preventDefault();
        if (pausedRef.current || panelRef.current || messageRef.current) return;
        setAction((prev) => nextAction(prev));
        return;
      }
      if (event.button !== 0 && event.button !== 1) return;
      dragging = true;
      moved = false;
      downX = event.clientX;
      downY = event.clientY;
      downButton = event.button;
    };

    const onUp = (event) => {
      const clicked = dragging && !moved && event.target === canvas;
      const button = downButton;
      dragging = false;
      if (!clicked || pausedRef.current || panelRef.current || messageRef.current) {
        paintCursor(event.clientX, event.clientY);
        return;
      }
      const id = jungle.pick(event.clientX, event.clientY);
      if (button === 1 || event.shiftKey) {
        openVerbMenu(id);
        return;
      }
      if (button === 0) performActionRef.current?.(id, event.clientX, event.clientY);
      paintCursor(event.clientX, event.clientY);
    };

    const onMove = (event) => {
      if (dragging && downButton === 0 && !pausedRef.current && !panelRef.current && !messageRef.current) {
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
      if (event.target !== canvas) return;
      paintCursor(event.clientX, event.clientY, false);
    };

    const onWheel = (event) => {
      event.preventDefault();
      if (messageRef.current || pausedRef.current || panelRef.current) return;
      input.wheel += event.deltaY * 0.004;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const onResize = () => jungle.resize();
    window.addEventListener("resize", onResize);
    jungle.resize();
    canvas.style.cursor = cursorFor(actionRef.current, false);

    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      input.blocked = pausedRef.current || !!panelRef.current || !!messageRef.current || stateRef.current?.flags?.escaped;
      const step = jungle.update(dt, input);
      if (step.moving) audioRef.current.step(now / 1000);
      audioRef.current.ambience(now / 1000);
      const id = jungle.nearest();
      nearRef.current = id;
      if (id !== lastNear) {
        lastNear = id;
        setNear(id);
      }
      poseAcc += dt;
      if (poseAcc > 2 && stateRef.current && !stateRef.current.flags.escaped) {
        poseAcc = 0;
        const pose = jungle.getPose();
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
        const pose = jungle.getPose();
        const next = { ...stateRef.current, pose };
        stateRef.current = next;
        saveGame(next);
      }
      jungle.destroy();
      jungleRef.current = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [mode, session]);

  useEffect(() => {
    if (mode !== "play" || !canvasRef.current) return;
    canvasRef.current.style.cursor = cursorFor(action, false);
  }, [action, mode]);

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

  useEffect(() => () => audioRef.current?.stop(), []);

  const dialogue = talkNpc && game ? dialogueFor(game, talkNpc) : null;
  const verbs = verbTarget && game ? verbsFor(game, verbTarget) : [];
  const solved = game ? puzzlesSolved(game) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#071018", color: "#f6edd8", fontFamily: "Georgia, 'Palatino Linotype', serif" }}>
      {mode === "menu" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "radial-gradient(ellipse at 50% 80%, #2f5a3a 0%, #0e1812 58%)" }}>
          <div style={{ letterSpacing: "0.28em", fontSize: 13, opacity: 0.7 }}>SANDPIT</div>
          <h1 style={{ margin: 0, fontSize: 46, fontWeight: 700, letterSpacing: "0.03em", textAlign: "center" }}>The Lost Expedition</h1>
          <p style={{ margin: 0, maxWidth: 460, textAlign: "center", opacity: 0.85 }}>The jungle keeps what it takes.</p>
          <button type="button" style={{ ...btn, padding: "12px 22px", fontSize: 18 }} onClick={startNew}>New Game</button>
          {hasSave ? (
            <button type="button" style={{ ...btn, padding: "12px 22px", fontSize: 18 }} onClick={continueGame}>Continue Game</button>
          ) : null}
          <p style={{ maxWidth: 520, textAlign: "center", fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
            WASD move · Shift run · Space jump · drag to look · wheel zooms · right-click cycles actions · left-click uses the action · middle-click or Shift-click opens the verb menu · I inventory · Esc pause
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
            <div style={{ marginTop: 8, fontSize: 14, background: "rgba(8,18,24,0.72)", border: "1px solid rgba(255,244,220,0.28)", borderRadius: 8, padding: "6px 10px", display: "inline-block" }}>
              Action: <strong>{actionLabel(action)}</strong>
              {selected ? ` · ${ITEMS[selected]?.name}` : ""}
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Right-click to change</div>
            </div>
          </div>
          <div style={{ position: "absolute", top: 58, right: 16, zIndex: 4, display: "flex", gap: 8 }}>
            <button type="button" style={btn} onClick={() => apply({ type: "HINT" })}>Hint</button>
            <button type="button" style={btn} onClick={() => setPanel("journal")}>Journal</button>
            <button type="button" style={btn} onClick={() => setPanel("inventory")}>Inventory</button>
            <button
              type="button"
              style={btn}
              onClick={async () => setMuted(await audioRef.current.toggle())}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button type="button" style={btn} onClick={() => setPaused(true)}>Pause</button>
            <button type="button" style={btn} onClick={onExit}>Exit Game</button>
          </div>
          {near && !panel && !paused && !message ? (
            <button
              type="button"
              onClick={() => openVerbMenu(near)}
              style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 3, background: "rgba(8,18,24,0.78)", border: "1px solid rgba(255,244,220,0.35)", borderRadius: 999, padding: "8px 14px", color: "#f6edd8", font: "inherit", cursor: "pointer" }}
            >
              Menu · {hotspotById(near)?.name}
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
                if (verb.id === "operate" && verbTarget === "starWheel") {
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
                  setAction("use");
                  if (ITEMS[id]?.note) showMessage(ITEMS[id].note);
                }}
                style={{
                  ...btn,
                  width: 132,
                  minHeight: 118,
                  borderColor: selected === id ? "#e1b03a" : "rgba(255,244,220,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 8px",
                }}
              >
                <img
                  src={iconMap[id] || getItemIcon(id)}
                  alt=""
                  width={64}
                  height={64}
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "contain",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    boxShadow: "inset 0 0 0 1px rgba(255,244,220,0.18)",
                  }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.2 }}>{ITEMS[id]?.name || id}</span>
              </button>
            ))}
          </div>
          <p style={{ opacity: 0.75 }}>Select an object to examine it and ready USE. Select two in a row to combine them.</p>
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
        <div style={{ position: "absolute", inset: 0, zIndex: 7, background: "radial-gradient(ellipse at 50% 30%, rgba(47,90,58,0.92), rgba(12,14,18,0.96))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <div style={{ letterSpacing: "0.22em", fontSize: 13 }}>GAME COMPLETED</div>
          <h2 style={{ margin: 0, fontSize: 48 }}>The expedition returns.</h2>
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
