import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getApiHeaders } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";

async function loadTextureFromUrl(url) {
  const headers = getApiHeaders();
  delete headers["Content-Type"];
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load texture (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const texture = await new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        objectUrl,
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err || new Error("Texture load failed"))
      );
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // Fit the full image onto each face (BoxGeometry UVs are 0–1 per face).
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    texture.center.set(0.5, 0.5);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { texture, objectUrl };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

/**
 * Kitchen preview: Polytec sample dropdown + continuously rotating textured cube.
 * Selected sample image is scaled onto each of the six faces.
 */
export default function PolytecKitchenCube() {
  const mountRef = useRef(null);
  const sceneApiRef = useRef(null);
  const [catalogue, setCatalogue] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedSampleId, setSelectedSampleId] = useState("");
  const [textureError, setTextureError] = useState("");

  const flatSamples = useMemo(() => {
    const list = Array.isArray(catalogue?.samples) ? catalogue.samples : [];
    return list.map((sample) => ({
      id: sample.id,
      name: sample.name,
      image_url: sample.image_url,
    }));
  }, [catalogue]);

  const selectedSample = useMemo(
    () => flatSamples.find((s) => String(s.id) === String(selectedSampleId)) || null,
    [flatSamples, selectedSampleId]
  );
  const selectedImageUrlRef = useRef(null);
  selectedImageUrlRef.current = selectedSample?.image_url || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError("");
        const res = await fetch(`${API_URL}/api/colour-groups/polytec`, {
          headers: getApiHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        if (!cancelled) setCatalogue(data);
      } catch (e) {
        if (!cancelled) {
          setListError(e.message || "Failed to load Polytec options");
          setCatalogue(null);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount rotating cube once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let disposed = false;
    let rafId = 0;
    let objectUrlToRevoke = null;
    let currentTexture = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f1ee);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(2.4, 1.8, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-3, 1, -2);
    scene.add(fill);

    const geometry = new THREE.BoxGeometry(1.35, 1.35, 1.35);
    const makeMat = () =>
      new THREE.MeshStandardMaterial({
        color: 0xc8c4be,
        roughness: 0.72,
        metalness: 0.04,
      });
    // Six materials → image is independently mapped/scaled onto each face.
    const materials = [makeMat(), makeMat(), makeMat(), makeMat(), makeMat(), makeMat()];
    const cube = new THREE.Mesh(geometry, materials);

    // Diamond pose: 45° either side of upright (symmetric), centre at origin.
    const tipDown = new THREE.Group();
    tipDown.rotation.order = "ZXY";
    tipDown.rotation.z = Math.PI / 4;
    tipDown.rotation.x = Math.PI / 4;
    tipDown.position.set(0, 0, 0);
    tipDown.add(cube);

    const spinner = new THREE.Group();
    spinner.add(tipDown);
    scene.add(spinner);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x323233, transparent: true, opacity: 0.35 })
    );
    cube.add(edges);

    camera.position.set(2.6, 1.4, 2.6);
    camera.lookAt(0, 0, 0);

    function resize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(mount);
    resize();

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      spinner.rotation.y += 0.005;
      renderer.render(scene, camera);
    }
    animate();

    function clearTextures() {
      for (const mat of materials) {
        mat.map = null;
        mat.color.set(0xc8c4be);
        mat.needsUpdate = true;
      }
      if (currentTexture) {
        currentTexture.dispose();
        currentTexture = null;
      }
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        objectUrlToRevoke = null;
      }
    }

    async function setImageUrl(imageUrl) {
      setTextureError("");
      if (!imageUrl) {
        clearTextures();
        return;
      }
      try {
        const { texture, objectUrl } = await loadTextureFromUrl(imageUrl);
        if (disposed) {
          texture.dispose();
          URL.revokeObjectURL(objectUrl);
          return;
        }
        clearTextures();
        objectUrlToRevoke = objectUrl;
        currentTexture = texture;
        for (const mat of materials) {
          mat.map = texture;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        }
      } catch (e) {
        if (!disposed) {
          console.error(e);
          setTextureError(e.message || "Failed to load sample image");
          clearTextures();
        }
      }
    }

    sceneApiRef.current = { setImageUrl };
    void setImageUrl(selectedImageUrlRef.current);

    return () => {
      disposed = true;
      sceneApiRef.current = null;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      clearTextures();
      geometry.dispose();
      edges.geometry.dispose();
      edges.material.dispose();
      for (const mat of materials) mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const api = sceneApiRef.current;
    if (!api) return;
    void api.setImageUrl(selectedSample?.image_url || null);
  }, [selectedSample?.image_url]);

  const samples = catalogue?.samples || [];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ flexShrink: 0, maxWidth: "420px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>
            {catalogue?.name || "Polytec - Doors & Panels"}
          </span>
          <select
            value={selectedSampleId}
            onChange={(e) => setSelectedSampleId(e.target.value)}
            disabled={loadingList || !!listError}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: FIELD_OUTLINE,
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              minHeight: "42px",
            }}
          >
            <option value="">{loadingList ? "Loading…" : "Select a finish"}</option>
            {samples.map((sample) => (
              <option key={sample.id} value={String(sample.id)}>
                {sample.name}
                {sample.image_url ? "" : " (no image)"}
              </option>
            ))}
          </select>
        </label>
        {listError ? (
          <div style={{ marginTop: "8px", color: "#842029", fontSize: "0.85rem" }}>{listError}</div>
        ) : null}
        {textureError ? (
          <div style={{ marginTop: "8px", color: "#842029", fontSize: "0.85rem" }}>{textureError}</div>
        ) : null}
        {selectedSample && !selectedSample.image_url ? (
          <div style={{ marginTop: "8px", color: UI.textMuted, fontSize: "0.85rem" }}>
            This sample has no image yet — upload one in Colour Settings.
          </div>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          gap: "16px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            flex: "0 0 38%",
            minWidth: "160px",
            maxWidth: "360px",
            minHeight: "280px",
            borderRadius: "10px",
            overflow: "hidden",
            border: FIELD_OUTLINE,
            background: "#f3f1ee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selectedSample?.image_url ? (
            <img
              src={selectedSample.image_url}
              alt={selectedSample.name || "Selected finish"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div style={{ color: UI.textMuted, fontSize: "0.9rem", textAlign: "center", padding: "16px" }}>
              {selectedSample ? "No image for this finish" : "Select a finish to preview"}
            </div>
          )}
        </div>

        <div
          ref={mountRef}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: "280px",
            borderRadius: "10px",
            overflow: "hidden",
            border: FIELD_OUTLINE,
            background: "#f3f1ee",
          }}
        />
      </div>
    </div>
  );
}
