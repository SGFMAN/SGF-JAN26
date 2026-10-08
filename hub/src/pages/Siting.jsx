import { useEffect, useMemo, useRef, useState } from "react";
import { getApiHeaders } from "../auth";
import "./JobTracking.css";
import "./Siting.css";

// Ported from the Granny Flats Organizer's own Site Check
// (server/public/site-check.html) — same field list, same site-plan markup
// tool, same "mark complete -> email a copy" flow. The PDF plan markup is
// flattened here client-side with pdf-lib before completing, same as the
// reference; the backend just stores whatever data: URL results.

const SECTIONS = [
  { title: "Site Access", fields: [
    { key: "truckAccess", label: "Truck access", type: "yn" },
    { key: "machineAccess", label: "Machine access", type: "yn" },
    { key: "existingCarport", label: "Existing carport", type: "yn" },
    { key: "existingCarportHeight", label: "Carport height", type: "text" },
    { key: "existingCarportWidth", label: "Carport width", type: "text" },
    { key: "gate", label: "Gate", type: "yn" },
    { key: "gateWidth", label: "Gate width", type: "text" },
    { key: "fenceRemoval", label: "Fence removal", type: "yn" },
    { key: "fenceRemovalMaterial", label: "Fence material", type: "select", options: ["Colorbond", "Timber"] },
    { key: "fenceRemovalBy", label: "Fence removal by", type: "select", options: ["Superior", "Owner"] },
    { key: "overheadObstructions", label: "Overhead obstructions", type: "yn" },
    { key: "pets", label: "Pets", type: "yn" },
    { key: "tempFencingRequired", label: "Temporary fencing required", type: "yn" },
  ] },
  { title: "Granny Flat Location — Site Prep", fields: [
    { key: "siteLevels", label: "Site levels", type: "text" },
    { key: "treeRemoval", label: "Tree removal", type: "yn" },
    { key: "treeRemovalBy", label: "Tree removal by", type: "select", options: ["Superior", "Owner"] },
    { key: "treeLopperRequired", label: "Tree lopper required", type: "yn" },
    { key: "treeLopperBy", label: "Tree lopper by", type: "select", options: ["Superior", "Owner"] },
    { key: "shedRemoval", label: "Shed removal", type: "yn" },
    { key: "shedRemovalBy", label: "Shed removal by", type: "select", options: ["Superior", "Owner"] },
    { key: "shedSlabRemoval", label: "Shed slab removal", type: "yn" },
    { key: "shedSlabRemovalBy", label: "Shed slab removal by", type: "select", options: ["Superior", "Owner"] },
    { key: "otherObjectRemoval", label: "Other object removal", type: "yn" },
    { key: "otherObjectRemovalBy", label: "Other object removal by", type: "select", options: ["Superior", "Owner"] },
    { key: "retainingWall", label: "Retaining wall", type: "yn", hint: "Refer to drawings" },
    { key: "cutConcretePiers", label: "Cut concrete — piers", type: "yn" },
    { key: "materialStorage", label: "Material storage", type: "select", options: ["Limited", "Open"] },
  ] },
  { title: "Services", fields: [
    { key: "sewerLocation", label: "Sewer location", type: "text" },
    { key: "vent", label: "Vent", type: "text" },
    { key: "io", label: "I/O", type: "text" },
    { key: "org", label: "ORG", type: "text" },
    { key: "stormwaterPoints", label: "Stormwater points", type: "text" },
    { key: "waterConnectionToHouse", label: "Water connection to the house", type: "yn" },
    { key: "waterConnection34Inch", label: "¾ inch", type: "yn" },
    { key: "waterConnectionGal", label: "GAL", type: "yn" },
    { key: "switchBoardLocation", label: "Switch board location known", type: "yn" },
    { key: "switchBoardLocationNotes", label: "Switch board location notes", type: "text" },
    { key: "concreteCuttingOrPavers", label: "Concrete cutting or pavers to remove", type: "yn" },
    { key: "machineAccessToServices", label: "Machine access to services", type: "yn" },
    { key: "connectServicesBeforeBuild", label: "Connect services before the build", type: "yn" },
    { key: "locateServicesBeforeBuild", label: "Locate power/phone/sewer lines before build", type: "yn" },
  ] },
];

function dataUrlToBytes(dataUrl) {
  const base64 = (dataUrl || "").split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToDataUrl(bytes, mime) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}
function hexToRgbFrac(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
function drawPlanShape(ctx, s, w, h) {
  const color = s.color || "#d0332b";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.type === "pen") {
    if (!s.points || s.points.length < 2) return;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = p[0] * w, y = p[1] * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else if (s.type === "arrow") {
    const x1 = s.x1 * w, y1 = s.y1 * h, x2 = s.x2 * w, y2 = s.y2 * h;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 14;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
    ctx.stroke();
  } else if (s.type === "text") {
    ctx.font = "600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(s.text, s.x * w, s.y * h);
  }
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.min(Math.max(t, 0), 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export default function Siting({ jobId, writablePages = [], onBack }) {
  const [job, setJob] = useState(null);
  const [siting, setSiting] = useState(null);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);

  const pdfjsRef = useRef(null);
  const planDocRef = useRef(null);
  const [planPageNum, setPlanPageNum] = useState(1);
  const [planPageCount, setPlanPageCount] = useState(1);
  const [planTool, setPlanTool] = useState("pen");
  const [planColor, setPlanColor] = useState("#d0332b");
  const [planReady, setPlanReady] = useState(false);
  const planLiveRef = useRef({ stroke: null, shape: null, pointerId: null });
  const planTextInputRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const planFileInputRef = useRef(null);
  const photoInputRef = useRef(null);

  const readOnly = !!siting?.completed;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function load() {
    setError("");
    try {
      const [jobRes, sitingRes] = await Promise.all([
        fetch(`/api/construction-tracking/${jobId}`, { headers: getApiHeaders() }),
        fetch(`/api/sgfhub/sitings/${jobId}`, { headers: getApiHeaders() }),
      ]);
      if (!jobRes.ok) throw new Error("This job isn't available on your account.");
      if (!sitingRes.ok) {
        const d = await sitingRes.json().catch(() => ({}));
        throw new Error(d.error || "Not authorised for Siting on this job");
      }
      setJob(await jobRes.json());
      setSiting(await sitingRes.json());
    } catch (e) {
      setError(e.message || "Failed to load");
    }
  }

  function fieldValue(key) {
    return siting?.data?.[key] !== undefined ? siting.data[key] : "";
  }

  async function saveField(key, value) {
    setSiting((prev) => ({ ...prev, data: { ...prev.data, [key]: value } }));
    try {
      const res = await fetch(`/api/sgfhub/sitings/${jobId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ data: { [key]: value } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      alert("Couldn't save — check your connection and try again.");
    }
  }

  // ---------- Photos ----------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 900;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addPhotos(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    const photos = Array.isArray(fieldValue("photos")) ? fieldValue("photos").slice() : [];
    const errors = [];
    for (const file of files) {
      try { photos.push(await resizeImage(file)); }
      catch (err) { errors.push(err.message || `Could not add ${file.name}`); }
    }
    await saveField("photos", photos);
    if (errors.length) alert(errors.join("\n"));
  }

  function removePhoto(idx) {
    const photos = (Array.isArray(fieldValue("photos")) ? fieldValue("photos") : []).slice();
    photos.splice(idx, 1);
    saveField("photos", photos);
  }

  // ---------- Plan markup ----------
  function planOriginal() { return siting?.data?.planOriginal; }
  function planShapesAll() { return siting?.data?.planShapes || {}; }
  function planShapesForPage(n) {
    const all = planShapesAll();
    return all[n] || [];
  }
  function savePlanShapes(nextAll) {
    saveField("planShapes", nextAll);
  }
  function mutateShapes(mutator) {
    const all = { ...planShapesAll() };
    const list = (all[planPageNum] || []).slice();
    mutator(list);
    all[planPageNum] = list;
    savePlanShapes(all);
    redrawPlanShapes(list);
  }

  function redrawPlanShapes(list) {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const shapes = list || planShapesForPage(planPageNum);
    shapes.forEach((s) => drawPlanShape(ctx, s, w, h));
    const live = planLiveRef.current;
    if (live.stroke && live.stroke.length > 1) drawPlanShape(ctx, { type: "pen", color: planColor, points: live.stroke }, w, h);
    if (live.shape) drawPlanShape(ctx, { type: "arrow", color: planColor, ...live.shape }, w, h);
  }

  async function ensurePdfjs() {
    if (pdfjsRef.current) return pdfjsRef.current;
    const pdfjsLib = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjsRef.current = pdfjsLib;
    return pdfjsLib;
  }

  async function renderPlanPage(n) {
    const doc = planDocRef.current;
    if (!doc) return;
    const pageNum = Math.min(Math.max(n, 1), doc.numPages);
    setPlanPageNum(pageNum);
    const page = await doc.getPage(pageNum);
    const wrap = canvasWrapRef.current;
    const maxWidth = Math.min((wrap && wrap.clientWidth) || 680, 900);
    const base = page.getViewport({ scale: 1 });
    const scale = maxWidth / base.width;
    const viewport = page.getViewport({ scale });
    const bg = bgCanvasRef.current, draw = drawCanvasRef.current;
    [bg, draw].forEach((c) => {
      c.width = viewport.width; c.height = viewport.height;
      c.style.width = viewport.width + "px"; c.style.height = viewport.height + "px";
    });
    if (wrap) wrap.style.height = viewport.height + "px";
    await page.render({ canvasContext: bg.getContext("2d"), viewport }).promise;
    redrawPlanShapes(planShapesForPage(pageNum));
  }

  async function openPlanViewer(dataUrl) {
    const pdfjsLib = await ensurePdfjs();
    const doc = await pdfjsLib.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
    planDocRef.current = doc;
    setPlanPageCount(doc.numPages);
    setPlanReady(true);
    await renderPlanPage(1);
  }

  useEffect(() => {
    const original = planOriginal();
    if (original && !planReady) {
      openPlanViewer(original.dataUrl).catch((e) => alert("Couldn't open that PDF: " + e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siting?.data?.planOriginal]);

  async function handlePlanFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf") { alert("Please choose a PDF file."); return; }
    if (file.size > 20 * 1024 * 1024) { alert("That PDF is larger than 20MB — please use a smaller file."); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      planDocRef.current = null;
      setPlanReady(false);
      await saveField("planOriginal", { name: file.name, dataUrl });
      await saveField("planShapes", {});
      await saveField("planAnnotated", null);
      try { await openPlanViewer(dataUrl); } catch (e) { alert("Couldn't open that PDF: " + e.message); }
    };
    reader.onerror = () => alert("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function planPointFromEvent(e) {
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.min(Math.max(x, 0), 1), Math.min(Math.max(y, 0), 1)];
  }

  function eraseShapeNear(fx, fy) {
    const canvas = drawCanvasRef.current;
    const w = canvas.width, h = canvas.height;
    const list = planShapesForPage(planPageNum).slice();
    const px = fx * w, py = fy * h, threshold = 16;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      let hit = false;
      if (s.type === "arrow") {
        hit = distToSegment(px, py, s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h) <= threshold;
      } else if (s.type === "pen") {
        for (let j = 0; j < s.points.length - 1 && !hit; j++) {
          const a = s.points[j], b = s.points[j + 1];
          if (distToSegment(px, py, a[0] * w, a[1] * h, b[0] * w, b[1] * h) <= threshold) hit = true;
        }
      } else if (s.type === "text") {
        const tw = (s.text || "").length * 8 + 6;
        hit = px >= s.x * w - 4 && px <= s.x * w + tw && py >= s.y * h - 4 && py <= s.y * h + 22;
      }
      if (hit) { list.splice(i, 1); mutateShapes((l) => { l.length = 0; l.push(...list); }); return true; }
    }
    return false;
  }

  function startPlanText(fx, fy) {
    if (planTextInputRef.current) planTextInputRef.current.remove();
    const wrap = canvasWrapRef.current;
    const canvas = drawCanvasRef.current;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "st-plan-text-input";
    input.style.left = fx * canvas.clientWidth + "px";
    input.style.top = fy * canvas.clientHeight + "px";
    input.style.color = planColor;
    wrap.appendChild(input);
    planTextInputRef.current = input;
    input.focus();
    function commit() {
      const text = input.value.trim();
      input.remove();
      planTextInputRef.current = null;
      if (text) mutateShapes((list) => list.push({ type: "text", color: planColor, x: fx, y: fy, text }));
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { input.value = ""; commit(); }
    });
    input.addEventListener("blur", commit);
  }

  function onCanvasPointerDown(e) {
    if (readOnly || !planReady) return;
    if (planTextInputRef.current) return;
    const [fx, fy] = planPointFromEvent(e);
    if (planTool === "text") { startPlanText(fx, fy); return; }
    if (planTool === "eraser") { eraseShapeNear(fx, fy); return; }
    const canvas = drawCanvasRef.current;
    planLiveRef.current.pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    if (planTool === "pen") planLiveRef.current.stroke = [[fx, fy]];
    else if (planTool === "arrow") planLiveRef.current.shape = { x1: fx, y1: fy, x2: fx, y2: fy };
  }
  function onCanvasPointerMove(e) {
    if (e.pointerId !== planLiveRef.current.pointerId) return;
    const [fx, fy] = planPointFromEvent(e);
    if (planTool === "pen" && planLiveRef.current.stroke) { planLiveRef.current.stroke.push([fx, fy]); redrawPlanShapes(); }
    else if (planTool === "arrow" && planLiveRef.current.shape) { planLiveRef.current.shape.x2 = fx; planLiveRef.current.shape.y2 = fy; redrawPlanShapes(); }
  }
  function finishStroke(e) {
    if (e.pointerId !== planLiveRef.current.pointerId) return;
    planLiveRef.current.pointerId = null;
    if (planTool === "pen" && planLiveRef.current.stroke) {
      const stroke = planLiveRef.current.stroke;
      planLiveRef.current.stroke = null;
      if (stroke.length > 1) mutateShapes((list) => list.push({ type: "pen", color: planColor, points: stroke }));
      else redrawPlanShapes();
    } else if (planTool === "arrow" && planLiveRef.current.shape) {
      const s = planLiveRef.current.shape;
      planLiveRef.current.shape = null;
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.01) mutateShapes((list) => list.push({ type: "arrow", color: planColor, ...s }));
      else redrawPlanShapes();
    }
  }

  function undoPlan() {
    mutateShapes((list) => list.pop());
  }
  function clearPlanPage() {
    if (!window.confirm("Clear all markup on this page?")) return;
    mutateShapes((list) => { list.length = 0; });
  }

  async function flattenAnnotatedPlan() {
    const original = planOriginal();
    if (!original) return null;
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(dataUrlToBytes(original.dataUrl));
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    const allShapes = planShapesAll();
    pages.forEach((page, idx) => {
      const shapes = allShapes[idx + 1] || [];
      const { width, height } = page.getSize();
      shapes.forEach((s) => {
        const c = hexToRgbFrac(s.color);
        const color = rgb(c.r, c.g, c.b);
        if (s.type === "pen" && s.points && s.points.length > 1) {
          for (let i = 0; i < s.points.length - 1; i++) {
            const a = s.points[i], b = s.points[i + 1];
            page.drawLine({ start: { x: a[0] * width, y: height - a[1] * height }, end: { x: b[0] * width, y: height - b[1] * height }, thickness: 2.4, color });
          }
        } else if (s.type === "arrow") {
          const x1 = s.x1 * width, y1 = height - s.y1 * height, x2 = s.x2 * width, y2 = height - s.y2 * height;
          page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 2.4, color });
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 11;
          const a1 = angle + Math.PI - Math.PI / 7, a2 = angle + Math.PI + Math.PI / 7;
          page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 + headLen * Math.cos(a1), y: y2 + headLen * Math.sin(a1) }, thickness: 2.4, color });
          page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 + headLen * Math.cos(a2), y: y2 + headLen * Math.sin(a2) }, thickness: 2.4, color });
        } else if (s.type === "text") {
          page.drawText(s.text || "", { x: s.x * width, y: height - s.y * height - 14, size: 13, font, color });
        }
      });
    });
    const bytes = await pdfDoc.save();
    return bytesToDataUrl(bytes, "application/pdf");
  }

  // ---------- Complete / reopen ----------
  async function handleComplete() {
    if (!window.confirm("Mark this Siting complete? A copy will be emailed and it will lock for editing.")) return;
    setCompleting(true);
    try {
      if (planOriginal()) {
        const annotatedDataUrl = await flattenAnnotatedPlan();
        await saveField("planAnnotated", { name: planOriginal().name || "site-plan.pdf", dataUrl: annotatedDataUrl });
      }
      const res = await fetch(`/api/sgfhub/sitings/${jobId}/complete`, { method: "POST", headers: getApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to complete");
      setSiting(data);
      if (data.emailSent === false) alert("Siting marked complete, but the email couldn't be sent: " + (data.emailError || "unknown error"));
    } catch (e) {
      alert(e.message || "Failed to complete");
    } finally {
      setCompleting(false);
    }
  }

  async function handleReopen() {
    if (!window.confirm("Reopen this Siting for editing? It will need to be completed again to re-send the email.")) return;
    try {
      const res = await fetch(`/api/sgfhub/sitings/${jobId}/reopen`, { method: "POST", headers: getApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reopen");
      setSiting(data);
    } catch (e) {
      alert(e.message);
    }
  }

  const photos = useMemo(() => (Array.isArray(fieldValue("photos")) ? fieldValue("photos") : []), [siting]);
  const canWrite = job?.state ? writablePages.includes(`${job.state.toLowerCase()}_job_tracking`) : false;

  if (error) {
    return (
      <div className="jt siting-page">
        <div className="st-breadcrumb"><button onClick={onBack}>← All jobs</button></div>
        <div className="jt-empty">{error}</div>
      </div>
    );
  }
  if (!job || !siting) {
    return <div className="jt siting-page">Loading…</div>;
  }

  return (
    <div className="jt siting-page">
      <div className="st-breadcrumb">
        <button onClick={onBack}>← All jobs</button>
        <span>/ Siting</span>
      </div>

      <header className="st-header">
        <h1>Siting — {job.address}</h1>
        {job.pmName && <p className="st-sub">Project manager: {job.pmName}</p>}
      </header>

      {readOnly && (
        <div className="st-banner">
          <span>
            Completed by {siting.completedByName || "someone"}{siting.completedAt ? " on " + new Date(siting.completedAt).toLocaleString() : ""}.
            {siting.emailSent === false
              ? " Email failed to send — " + (siting.emailError || "")
              : " Emailed with a copy and photos attached."}
          </span>
          {canWrite && <button className="st-ghost-btn" onClick={handleReopen}>Reopen for editing</button>}
        </div>
      )}

      <div className="st-card">
        <div className="st-frow">
          <label>Date of inspection</label>
          <div className="st-fcontrol">
            <input
              type="date"
              className="st-ftext"
              value={fieldValue("dateOfInspection")}
              disabled={readOnly || !canWrite}
              onChange={(e) => saveField("dateOfInspection", e.target.value)}
            />
          </div>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div className="st-card" key={section.title}>
          <h2>{section.title}</h2>
          {section.fields.map((f) => (
            <div className="st-frow" key={f.key}>
              <label>
                {f.label}
                {f.hint && <span className="st-fhint">{f.hint}</span>}
              </label>
              <div className="st-fcontrol">
                {f.type === "text" ? (
                  <input
                    type="text"
                    className="st-ftext"
                    defaultValue={fieldValue(f.key)}
                    disabled={readOnly || !canWrite}
                    onBlur={(e) => e.target.value !== fieldValue(f.key) && saveField(f.key, e.target.value)}
                  />
                ) : (
                  <div className="st-yngroup">
                    {(f.type === "yn" ? ["Yes", "No"] : f.options).map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={"st-ynbtn" + (fieldValue(f.key) === o ? " active" : "")}
                        disabled={readOnly || !canWrite}
                        onClick={() => saveField(f.key, o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="st-card">
        <h2>Photos</h2>
        <p className="st-hint-text">Take as many as required — the house, driveway/curb condition, access, and any existing damage.</p>
        {!readOnly && canWrite && (
          <div className="st-photo-input" onClick={() => photoInputRef.current?.click()}>Click to add photos</div>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
        />
        <div className="st-photo-preview">
          {photos.map((src, idx) => (
            <div className="st-photo-thumb" key={idx}>
              <img src={src} alt={`Site photo ${idx + 1}`} />
              {!readOnly && canWrite && <button type="button" onClick={() => removePhoto(idx)} title="Remove">✕</button>}
            </div>
          ))}
        </div>
      </div>

      {(planOriginal() || (!readOnly && canWrite)) && (
        <div className="st-card">
          <h2>Site Plan</h2>
          <p className="st-hint-text">Upload the plan and mark up access points, service locations, or anything worth flagging.</p>
          {!planOriginal() && !readOnly && canWrite && (
            <div className="st-plan-upload-box" onClick={() => planFileInputRef.current?.click()}>Click to upload the site plan (PDF)</div>
          )}
          <input
            ref={planFileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => { handlePlanFile(e.target.files[0]); e.target.value = ""; }}
          />
          {planOriginal() && (
            <div>
              {!readOnly && canWrite && (
                <div className="st-plan-toolbar">
                  {["pen", "arrow", "text", "eraser"].map((t) => (
                    <button key={t} type="button" className={"st-plan-tool-btn" + (planTool === t ? " active" : "")} onClick={() => setPlanTool(t)}>
                      {t === "pen" ? "✏️ Pen" : t === "arrow" ? "↗️ Arrow" : t === "text" ? "🔤 Text" : "🧽 Erase"}
                    </button>
                  ))}
                  <div className="st-plan-toolbar-sep" />
                  {["#d0332b", "#1c2530", "#2457c9", "#e08a1e"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={"st-plan-color-swatch" + (planColor === c ? " active" : "")}
                      style={{ background: c }}
                      onClick={() => setPlanColor(c)}
                    />
                  ))}
                  <div className="st-plan-toolbar-sep" />
                  <button type="button" className="st-ghost-btn" onClick={undoPlan}>Undo</button>
                  <button type="button" className="st-ghost-btn" onClick={clearPlanPage}>Clear page</button>
                  <button type="button" className="st-ghost-btn" onClick={() => planFileInputRef.current?.click()}>Change plan</button>
                </div>
              )}
              {planPageCount > 1 && (
                <div className="st-plan-page-nav">
                  <button type="button" className="st-ghost-btn" onClick={() => renderPlanPage(planPageNum - 1)}>‹</button>
                  <span>Page {planPageNum} of {planPageCount}</span>
                  <button type="button" className="st-ghost-btn" onClick={() => renderPlanPage(planPageNum + 1)}>›</button>
                </div>
              )}
              <div className="st-plan-canvas-wrap" ref={canvasWrapRef}>
                <canvas ref={bgCanvasRef} />
                <canvas
                  ref={drawCanvasRef}
                  className="st-plan-draw-canvas"
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                />
              </div>
              <div className="st-plan-meta-row">
                <span>{planOriginal()?.name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="st-card">
        <h2>Additional notes</h2>
        <textarea
          className="st-notes-area"
          defaultValue={fieldValue("additionalNotes")}
          disabled={readOnly || !canWrite}
          onBlur={(e) => e.target.value !== fieldValue("additionalNotes") && saveField("additionalNotes", e.target.value)}
        />
      </div>

      {!readOnly && canWrite && (
        <div className="st-complete-bar">
          <button className="st-primary-btn" onClick={handleComplete} disabled={completing}>
            {completing ? "Completing…" : "Mark complete & email copy"}
          </button>
        </div>
      )}
      {!canWrite && !readOnly && <div className="jt-empty">You have read-only access to Job Tracking, so Siting is view-only here.</div>}
    </div>
  );
}
