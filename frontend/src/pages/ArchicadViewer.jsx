import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import ModelViewport from "../components/archicad/ModelViewport";
import useAppLogo from "../hooks/useAppLogo.js";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import { COLORBOND_RANGE_KEY, colourOptionEntriesFromCatalogue, normalizeColourSectionRanges } from "../constants/colourSectionRanges";
import { getApiHeaders } from "../utils/auth";
import { fetchColourGroupCatalogue } from "../utils/colourCatalogueCache";
import { UI } from "../utils/uiThemeTokens.js";

const API = "/api/tools/archicad-models";
const ACCEPT = ".pln,.ifc,.glb,.gltf";

function authHeaders() {
  const headers = getApiHeaders();
  delete headers["Content-Type"];
  return headers;
}

function byteHex(value) {
  const channel = Math.max(0, Math.min(255, Math.round(Number(value))));
  return channel.toString(16).padStart(2, "0");
}

function sampleHex(sample) {
  if (sample?.r == null || sample?.g == null || sample?.b == null) return "";
  return `#${byteHex(sample.r)}${byteHex(sample.g)}${byteHex(sample.b)}`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const FINISH_CONTROLS = [
  { key: "roof", label: "Roof", placeholder: "Roof colour", colours: "external", apply: "setRoofColor" },
  { key: "cladding", label: "Cladding", placeholder: "Cladding colour", colours: "external", apply: "setCladdingColor" },
  { key: "baseboards", label: "Baseboards", placeholder: "Baseboard colour", colours: "external", apply: "setBaseboardColor" },
  { key: "windows", label: "Windows", placeholder: "Window colour", colours: "windows", apply: "setWindowColor" },
  { key: "balustrade", label: "Balustrade", placeholder: "Balustrade colour", colours: "external", apply: "setBalustradeColor" },
  { key: "gutters", label: "Gutters and fascia", placeholder: "Gutter colour", colours: "external", apply: "setGutterColor" },
];

function statusColor(status) {
  if (status === "READY") return "#2f6b45";
  if (status === "FAILED") return "#8d2f2f";
  return "#8a6230";
}

function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    const headers = authHeaders();
    Object.entries(headers).forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

async function readJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export default function ArchicadViewer() {
  const logo = useAppLogo();
  const location = useLocation();
  const viewerApi = useRef(null);
  const stageRef = useRef(null);
  const replaceInput = useRef(null);
  const attachInput = useRef(null);
  const fileTarget = useRef(null);
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const [error, setError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [unitNote, setUnitNote] = useState("");
  const [selectedPart, setSelectedPart] = useState("");
  const [projection, setProjection] = useState("perspective");
  const [narrow, setNarrow] = useState(() => window.innerWidth < 980);
  const [externalColours, setExternalColours] = useState([]);
  const [windowColours, setWindowColours] = useState([]);
  const [finishes, setFinishes] = useState({
    roof: "",
    cladding: "",
    baseboards: "",
    windows: "",
    balustrade: "",
    gutters: "",
  });

  const selected = models.find((model) => model.id === selectedId) || null;
  const busy = models.some((model) => ["UPLOADING", "QUEUED", "PROCESSING", "OPTIMISING"].includes(model.status));

  const refresh = useCallback(async () => {
    const body = await readJson(API);
    setModels(body.models || []);
    setSelectedId((current) => {
      if (current && (body.models || []).some((model) => model.id === current)) return current;
      return (body.models || [])[0]?.id || null;
    });
  }, []);

  useEffect(() => {
    let stop = false;
    readJson(`${API}/capabilities`)
      .then((body) => {
        if (!stop) setCapabilities(body);
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    refresh().catch((err) => {
      if (!stop) setError(err.message);
    });
    return () => {
      stop = true;
    };
  }, [refresh]);

  useEffect(() => {
    let stop = false;
    const coloursForRange = async (rangeKey) => {
      if (!rangeKey) return [];
      if (rangeKey === COLORBOND_RANGE_KEY) {
        return COLORBOND_COLOURS.map((colour) => ({
          label: colour.name,
          hex: `#${byteHex(colour.r)}${byteHex(colour.g)}${byteHex(colour.b)}`,
        }));
      }
      const catalogue = await fetchColourGroupCatalogue(rangeKey);
      return colourOptionEntriesFromCatalogue(catalogue)
        .map((entry) => ({ label: entry.label, hex: sampleHex(entry.sample) }))
        .filter((entry) => entry.label && entry.hex);
    };
    (async () => {
      try {
        const body = await readJson("/api/colour-section-ranges");
        const ranges = normalizeColourSectionRanges(body.ranges);
        const [external, windows] = await Promise.all([
          coloursForRange(ranges.external),
          coloursForRange(ranges.windows),
        ]);
        if (!stop) {
          setExternalColours(external);
          setWindowColours(windows);
        }
      } catch (err) {
        console.error(err);
        if (!stop) {
          setExternalColours([]);
          setWindowColours([]);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => {
      refresh().catch((err) => setError(err.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 980);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setViewerError("");
    setUnitNote("");
    setSelectedPart("");
    setProjection("perspective");
  }, [selectedId, selected?.updatedAt]);

  const modelUrl = useMemo(() => {
    if (!selected?.hasModel) return "";
    return `${API}/${selected.id}/model.glb?v=${encodeURIComponent(selected.updatedAt || "")}`;
  }, [selected]);

  const headers = useMemo(() => authHeaders(), [selectedId]);

  const sendFile = async (file, url) => {
    setError("");
    setUploadName(file.name);
    setUploadProgress(1);
    try {
      const model = await uploadFile(url, file, setUploadProgress);
      setUploadProgress(100);
      await refresh();
      if (model?.id) setSelectedId(model.id);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
        setUploadName("");
      }, 600);
    }
  };

  const onFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    sendFile(file, API);
  };

  const capture = () => viewerApi.current?.capture?.() || "";

  const saveImage = () => {
    const url = capture();
    if (!url) return;
    const link = document.createElement("a");
    const base = (selected?.displayName || "archicad-view").replace(/\.[^.]+$/, "");
    link.href = url;
    link.download = `${base}.png`;
    link.click();
  };

  const printView = () => {
    const url = capture();
    if (!url) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!popup) {
      saveImage();
      setError("The print window was blocked, so the image was saved instead.");
      return;
    }
    popup.document.write(
      `<!DOCTYPE html><title>Archicad view</title><style>html,body{margin:0;background:#fff}img{width:100%;height:auto;display:block}</style><img src="${url}" alt="Archicad view">`
    );
    popup.document.close();
    popup.onload = () => popup.print();
  };

  const toggleFullscreen = () => {
    const node = stageRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  const buttonStyle = (active = false) => ({
    border: `1px solid ${UI.outline}`,
    background: active ? UI.buttonPrimary : UI.cardBg,
    color: active ? UI.pageText : UI.textPrimary,
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: "0.82rem",
    fontWeight: 650,
    cursor: "pointer",
  });

  const chooseFinish = (control, hex) => {
    if (!hex) return;
    setFinishes((current) => ({ ...current, [control.key]: hex }));
    viewerApi.current?.[control.apply]?.(hex);
  };

  return (
    <div style={{ minHeight: "100vh", background: UI.pageBg, color: UI.pageText }}>
      <style>{`
        @media (max-width: 980px) {
          .archicad-shell { flex-direction: column !important; height: auto !important; }
          .archicad-list { width: 100% !important; max-height: 360px; }
          .archicad-stage { min-height: 460px !important; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "22px 28px 8px" }}>
        <Link to="/projects" style={{ position: "absolute", left: 28 }}>
          <img src={logo} alt="SGF Logo" style={{ width: 108, height: "auto" }} />
        </Link>
        <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 700 }}>Archicad 3D Viewer</h1>
      </div>
      <div
        className="archicad-shell"
        style={{
          display: "flex",
          gap: 20,
          width: "calc(100vw - 36px)",
          margin: "12px auto 20px",
          height: "calc(100vh - 110px)",
          minHeight: 640,
        }}
      >
        <ToolsSidebarMenu activePath={location.pathname} fillHeight />
        <section
          className="archicad-list"
          style={{
            width: narrow ? "100%" : 330,
            flexShrink: 0,
            background: UI.panelBg,
            color: UI.textPrimary,
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: 16,
            overflow: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFiles(event.dataTransfer.files);
            }}
            style={{
              border: `1.5px dashed ${dragging ? UI.pageText : UI.outline}`,
              borderRadius: 12,
              background: UI.cardBg,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Import Archicad model</div>
            <div style={{ fontSize: "0.86rem", marginBottom: 12 }}>
              Drop a PLN here. The building is shown in this viewer.
            </div>
            <label style={{ ...buttonStyle(true), display: "inline-block" }}>
              Choose file
              <input
                type="file"
                accept={ACCEPT}
                style={{ display: "none" }}
                onChange={(event) => {
                  onFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {uploadProgress != null ? (
              <div style={{ marginTop: 12, textAlign: "left" }}>
                <div style={{ fontSize: "0.8rem", marginBottom: 4 }}>{uploadName}</div>
                <div style={{ height: 8, background: UI.panelBg, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${uploadProgress}%`, height: "100%", background: UI.buttonPrimary }} />
                </div>
                <div style={{ fontSize: "0.78rem", marginTop: 4 }}>Uploading {uploadProgress}%</div>
              </div>
            ) : null}
          </div>
          {capabilities?.note ? (
            <p style={{ fontSize: "0.8rem", lineHeight: 1.4, margin: "12px 4px" }}>{capabilities.note}</p>
          ) : null}
          {error ? (
            <p style={{ color: "#8d2f2f", fontSize: "0.86rem", margin: "8px 4px" }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {models.length === 0 ? <p style={{ fontSize: "0.9rem" }}>No test models yet.</p> : null}
            {models.map((model) => (
              <article
                key={model.id}
                onClick={() => setSelectedId(model.id)}
                style={{
                  background: UI.cardBg,
                  borderRadius: 12,
                  padding: 12,
                  cursor: "pointer",
                  outline: model.id === selectedId ? `2px solid ${UI.pageText}` : `1px solid ${UI.outline}`,
                }}
              >
                <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{model.displayName}</div>
                <div style={{ fontSize: "0.78rem", marginTop: 4 }}>
                  {formatBytes(model.sourceBytes)} · {model.sourceFormat.toUpperCase()}
                </div>
                <div style={{ color: statusColor(model.status), fontWeight: 700, fontSize: "0.82rem", marginTop: 6 }}>
                  {model.status}
                </div>
                <div style={{ fontSize: "0.8rem", marginTop: 4 }}>{model.statusMessage}</div>
                {model.errorDetail ? (
                  <div style={{ fontSize: "0.78rem", marginTop: 6, lineHeight: 1.35 }}>{model.errorDetail}</div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }} onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    style={buttonStyle()}
                    onClick={() => {
                      fileTarget.current = model.id;
                      setSelectedId(model.id);
                      replaceInput.current?.click();
                    }}
                  >
                    Replace
                  </button>
                  {model.canAttachConverted ? (
                    <button
                      type="button"
                      style={buttonStyle()}
                      onClick={() => {
                        fileTarget.current = model.id;
                        setSelectedId(model.id);
                        attachInput.current?.click();
                      }}
                    >
                      Attach GLB
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={buttonStyle()}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${model.displayName}?`)) return;
                      try {
                        await readJson(`${API}/${model.id}`, { method: "DELETE" });
                        if (selectedId === model.id) setSelectedId(null);
                        await refresh();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
          <input
            ref={replaceInput}
            type="file"
            accept={ACCEPT}
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              const id = fileTarget.current || selectedId;
              if (file && id) sendFile(file, `${API}/${id}/source`);
            }}
          />
          <input
            ref={attachInput}
            type="file"
            accept=".glb"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              const id = fileTarget.current || selectedId;
              if (file && id) sendFile(file, `${API}/${id}/converted`);
            }}
          />
        </section>
        <section
          ref={stageRef}
          className="archicad-stage"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 520,
            background: "#f4f2ee",
            color: UI.textPrimary,
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, background: "rgba(255,255,255,0.92)", zIndex: 2 }}>
            {[
              ["front", "Front"],
              ["rear", "Rear"],
              ["left", "Left"],
              ["right", "Right"],
              ["top", "Top"],
              ["threeD", "3D"],
            ].map(([id, label]) => (
              <button key={id} type="button" style={buttonStyle()} onClick={() => viewerApi.current?.setView(id)} disabled={!selected?.hasModel}>
                {label}
              </button>
            ))}
            <button type="button" style={buttonStyle()} onClick={() => viewerApi.current?.reset()} disabled={!selected?.hasModel}>
              Reset view
            </button>
            <button type="button" style={buttonStyle()} onClick={() => viewerApi.current?.fit()} disabled={!selected?.hasModel}>
              Fit
            </button>
            <button
              type="button"
              style={buttonStyle(projection === "ortho")}
              disabled={!selected?.hasModel}
              onClick={() => {
                const next = projection === "perspective" ? "ortho" : "perspective";
                setProjection(next);
                viewerApi.current?.setProjection(next);
              }}
            >
              {projection === "perspective" ? "Perspective" : "Orthographic"}
            </button>
            <button type="button" style={buttonStyle()} onClick={toggleFullscreen}>
              Full screen
            </button>
            <button type="button" style={buttonStyle()} onClick={printView} disabled={!selected?.hasModel}>
              Print view
            </button>
            <button type="button" style={buttonStyle()} onClick={saveImage} disabled={!selected?.hasModel}>
              Save image
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 10px 10px", background: "rgba(255,255,255,0.92)", zIndex: 2 }}>
            {FINISH_CONTROLS.map((control) => {
              const colours = control.colours === "windows" ? windowColours : externalColours;
              const selectedHex = finishes[control.key];
              return (
                <label key={control.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: UI.textPrimary, fontSize: "0.82rem", fontWeight: 650 }}>
                  {control.label}
                  {selectedHex ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: `1px solid ${UI.outline}`,
                        background: selectedHex,
                        flex: "0 0 auto",
                      }}
                    />
                  ) : null}
                  <select
                    value={selectedHex}
                    disabled={!selected?.hasModel || colours.length === 0}
                    onChange={(event) => chooseFinish(control, event.target.value)}
                    style={{ ...buttonStyle(), padding: "6px 8px", maxWidth: 180 }}
                  >
                    <option value="">{control.placeholder}</option>
                    {colours.map((colour) => (
                      <option key={colour.label} value={colour.hex}>
                        {colour.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <div style={{ position: "relative", flex: "1 1 auto", minHeight: 480, height: "100%" }}>
            {selected?.hasModel ? (
              <ModelViewport
                modelUrl={modelUrl}
                requestHeaders={headers}
                apiRef={viewerApi}
                onReady={({ note }) => setUnitNote(note || "")}
                onError={(message) => setViewerError(message)}
                onSelect={setSelectedPart}
                finishColors={finishes}
              />
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {selected ? selected.statusMessage : "Upload a PLN to start"}
                  </div>
                  <div style={{ maxWidth: 460, fontSize: "0.92rem", lineHeight: 1.45 }}>
                    {selected?.errorDetail ||
                      "Drop a PLN here. The building appears in this viewer when the model is ready."}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.92)", fontSize: "0.8rem" }}>
            <span>
              {selectedPart ? `Selected: ${selectedPart}` : "Click a part of the building to read its name."}
              {" "}
              WASD or the arrow keys move the view. E and C raise and lower it. Plus and minus zoom. Hold Shift to move faster.
            </span>
            <span>{viewerError || unitNote}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
