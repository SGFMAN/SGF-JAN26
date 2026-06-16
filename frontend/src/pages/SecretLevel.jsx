import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SecretGameSceneView from "../Game/SecretGameSceneView";
import {
  getSpawnPosition,
  loadSceneConfig,
  saveSceneConfig,
} from "../Game/secretGameSceneConfig";
import { getSceneById, INITIAL_SCENE_INDEX, SECRET_GAME_SCENES } from "../Game/secretGameScenes";
import SecretSceneEditModal from "../components/SecretSceneEditModal";

const DEV_TOOLS = import.meta.env.DEV;

const ENTRY_LABELS = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

export default function SecretLevel() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/secret-area";
  const secretReturnTo = location.state?.secretReturnTo;
  const exitDirection = location.state?.exitDirection || null;

  const sceneId = location.state?.sceneId ?? SECRET_GAME_SCENES[INITIAL_SCENE_INDEX].id;
  const scene = useMemo(() => getSceneById(sceneId), [sceneId]);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editAction, setEditAction] = useState(null);
  const [sceneConfig, setSceneConfig] = useState(() => loadSceneConfig(scene.id));
  const [pendingLinkSceneId, setPendingLinkSceneId] = useState("");

  useEffect(() => {
    setSceneConfig(loadSceneConfig(scene.id));
    setEditAction(null);
  }, [scene.id]);

  const interactionMode =
    editAction === "definePath" ? "definePath" : editAction?.startsWith("defineEntry:") ? "defineEntry" : "play";
  const defineEntrySide = editAction?.startsWith("defineEntry:") ? editAction.split(":")[1] : null;

  useEffect(() => {
    if (defineEntrySide) {
      setPendingLinkSceneId(sceneConfig.sceneLinks?.[defineEntrySide] || "");
    }
  }, [defineEntrySide, sceneConfig.sceneLinks]);

  const initialSpawn = useMemo(
    () => getSpawnPosition(sceneConfig, exitDirection),
    [sceneConfig, exitDirection]
  );

  const hintText = useMemo(() => {
    if (editAction === "definePath") {
      return "Click to place points. Click the first point to close the walk area. Esc to cancel.";
    }
    if (defineEntrySide) {
      return `Choose linked scene above, then click to place the ${ENTRY_LABELS[defineEntrySide]} entry point. Esc to cancel.`;
    }
    if (sceneConfig.walkPolygon.length >= 3) {
      return "Click inside the walk area to move. Walk past an entry edge to change scene.";
    }
    return "Click anywhere to walk";
  }, [editAction, defineEntrySide, sceneConfig.walkPolygon.length]);

  function handleExit() {
    navigate(returnTo, {
      state: secretReturnTo ? { returnTo: secretReturnTo } : undefined,
    });
  }

  const persistConfig = useCallback(
    (patch) => {
      setSceneConfig((current) => {
        const nextConfig = {
          walkPolygon: patch.walkPolygon ?? current.walkPolygon,
          entryPoints: {
            ...current.entryPoints,
            ...(patch.entryPoints || {}),
          },
          sceneLinks: {
            ...current.sceneLinks,
            ...(patch.sceneLinks || {}),
          },
        };
        saveSceneConfig(scene.id, nextConfig);
        return nextConfig;
      });
    },
    [scene.id]
  );

  const handleWalkPolygonComplete = useCallback(
    (walkPolygon) => {
      persistConfig({ walkPolygon });
      setEditAction(null);
    },
    [persistConfig]
  );

  const handleEntryPointComplete = useCallback(
    (side, point) => {
      persistConfig({
        entryPoints: { [side]: point },
        sceneLinks: {
          [side]: pendingLinkSceneId || null,
        },
      });
      setEditAction(null);
    },
    [persistConfig, pendingLinkSceneId]
  );

  const handleSceneLinkChange = useCallback(
    (side, linkedSceneId) => {
      persistConfig({
        sceneLinks: { [side]: linkedSceneId },
      });
    },
    [persistConfig]
  );

  const handleSceneExit = useCallback(
    (direction) => {
      const linkedSceneId = sceneConfig.sceneLinks?.[direction];
      if (!linkedSceneId) return;
      navigate("/secret-area/level", {
        replace: true,
        state: {
          sceneId: linkedSceneId,
          exitDirection: direction,
          returnTo,
          secretReturnTo,
        },
      });
    },
    [sceneConfig.sceneLinks, navigate, returnTo, secretReturnTo]
  );

  const handleDefinePathCancel = useCallback(() => {
    setEditAction(null);
  }, []);

  const handleDefineEntryCancel = useCallback(() => {
    setEditAction(null);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <SecretGameSceneView
        key={`${scene.id}-${exitDirection || "start"}-${location.key}`}
        sceneSrc={scene.src}
        sceneLabel={scene.label}
        walkPolygon={sceneConfig.walkPolygon}
        entryPoints={sceneConfig.entryPoints}
        sceneLinks={sceneConfig.sceneLinks}
        initialSpawn={initialSpawn}
        interactionMode={interactionMode}
        defineEntrySide={defineEntrySide}
        onWalkPolygonComplete={handleWalkPolygonComplete}
        onEntryPointComplete={handleEntryPointComplete}
        onDefinePathCancel={handleDefinePathCancel}
        onDefineEntryCancel={handleDefineEntryCancel}
        onSceneExit={handleSceneExit}
      />

      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <button
          type="button"
          onClick={handleExit}
          style={{
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: "#061a10",
            background: "#22ff88",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          Back to Dance Floor
        </button>
        {DEV_TOOLS && (
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            style={{
              padding: "10px 18px",
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#061a10",
              background: "#ffdd00",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Edit
          </button>
        )}
      </div>

      {DEV_TOOLS && defineEntrySide && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            background: "rgba(0, 0, 0, 0.72)",
            borderRadius: "8px",
            border: "1px solid #3a4a56",
          }}
        >
          <label style={{ color: "#c8e8d8", fontSize: "0.88rem", fontWeight: 600 }}>
            Exit {ENTRY_LABELS[defineEntrySide]} links to scene:
          </label>
          <select
            value={pendingLinkSceneId}
            onChange={(e) => setPendingLinkSceneId(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid #3a4a56",
              background: "#0a1018",
              color: "#e8fff4",
              fontWeight: 600,
            }}
          >
            <option value="">None</option>
            {SECRET_GAME_SCENES.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Scene {opt.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <p
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          margin: 0,
          padding: "8px 14px",
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#e8fff4",
          background: "rgba(0, 0, 0, 0.55)",
          borderRadius: "8px",
          letterSpacing: "0.06em",
          pointerEvents: "none",
          maxWidth: "min(92vw, 640px)",
          textAlign: "center",
        }}
      >
        {hintText}
      </p>

      <SecretSceneEditModal
        open={editModalOpen}
        sceneLabel={scene.label}
        sceneOptions={SECRET_GAME_SCENES}
        sceneLinks={sceneConfig.sceneLinks}
        onSceneLinkChange={handleSceneLinkChange}
        onClose={() => setEditModalOpen(false)}
        onDefinePath={() => {
          setEditModalOpen(false);
          setEditAction("definePath");
        }}
        onDefineEntryPoint={(side) => {
          setEditModalOpen(false);
          setEditAction(`defineEntry:${side}`);
        }}
      />
    </div>
  );
}
