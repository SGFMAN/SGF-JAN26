// Shared between BushfireVariations.jsx (the standalone Variation Tracker)
// and BushfireOrganizer.jsx (per-unit build tracking, whose Variations tab
// is the same data/behavior "just viewed per-unit" per the reference guide).
// Keeping variationTotal in one place matters: its qty-fallback quirk was a
// real bug once (see git history) and must never drift between the two pages.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getApiHeaders } from "../auth";

export const money = (n) => `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fixed, positional — must match backend/bushfireVariations.js STAGE_NAMES exactly.
export const STAGE_NAMES = [
  "Subfloor / Walls / Roof",
  "Electrical Rough In",
  "Plumbing Rough In",
  "Roof",
  "Kitchen & Wall Lining",
  "Lock Up – Axon Cladding / Wedi Board",
  "Flooring",
  "Painting",
  "Fit Off & Robes",
  "Plumbing & Electrical Fit Off",
  "Electrical Mains Install",
  "Clean",
  "Practical Completion",
];

export function jobStages(job) {
  return Array.isArray(job.stages) && job.stages.length === STAGE_NAMES.length
    ? job.stages
    : STAGE_NAMES.map(() => ({ complete: false, estimatedDate: "" }));
}
export function stagePercent(job) {
  const st = jobStages(job);
  return st.length ? Math.round((st.filter((s) => s.complete).length / st.length) * 100) : 0;
}
export function currentStageIndex(job) {
  const st = jobStages(job);
  for (let i = 0; i < st.length; i++) if (!st[i].complete) return i;
  return st.length;
}

/** A lightweight stage popover — just a date and a complete toggle, unlike the
 * construction StagePopover's five-state status machine. Reuses the same
 * .jt-pop positioning/markup conventions so it looks native next to it. */
export function BushfireStagePopover({ job, stageIdx, anchorRect, onClose, onSave }) {
  const ref = useRef(null);
  const stage = jobStages(job)[stageIdx];
  const [estimatedDate, setEstimatedDate] = useState(stage.estimatedDate || "");
  const [pos, setPos] = useState(
    anchorRect ? { left: anchorRect.left, top: anchorRect.bottom + 6, visibility: "hidden" } : { visibility: "hidden" }
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const rect = anchorRect || { left: window.innerWidth / 2 - w / 2, right: window.innerWidth / 2 + w / 2, top: 80, bottom: 80, width: w };
    let left = Math.min(window.innerWidth - w - 8, Math.max(8, rect.left + rect.width / 2 - w / 2));
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    setPos({ left, top, visibility: "visible" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="jt-pop" ref={ref} style={pos} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Stage status">
      <h3>
        {stageIdx + 1}. {STAGE_NAMES[stageIdx]}
      </h3>
      <div className="pj">{job.address}</div>
      <div className="jt-seg" style={{ gridTemplateColumns: "1fr" }}>
        <button className={stage.complete ? "on" : ""} onClick={() => onSave({ complete: !stage.complete })}>
          <i style={{ background: stage.complete ? "var(--done)" : "var(--empty)" }} />
          {stage.complete ? "✓ Complete" : "Mark complete"}
        </button>
      </div>
      <label>
        Estimated date
        <input
          type="date"
          value={estimatedDate}
          onChange={(e) => {
            setEstimatedDate(e.target.value);
            onSave({ estimatedDate: e.target.value });
          }}
        />
      </label>
      <div className="pbtns">
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function variationTotal(v) {
  // A variation with no stored `parts` is really a single implicit line item —
  // its qty defaults to 1 when falsy (0 or unset), matching the reference
  // tracker's behaviour for quick-added lines whose quantity hasn't been
  // filled in yet. A genuine stored part's own qty is never defaulted this
  // way: qty: 0 on an actual line item means "doesn't apply", not "unset".
  const parts = Array.isArray(v.parts) && v.parts.length ? v.parts : v.unitCost || v.qty ? [{ unitCost: v.unitCost, qty: v.qty || 1 }] : [];
  const partsTotal = parts.reduce((s, p) => s + Number(p.unitCost || 0) * Number(p.qty || 0), 0);
  return partsTotal + Number(v.extra || 0);
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export function readAttachment(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — keep attachments under 8 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PartsEditor({ v, onChange, canWrite = true }) {
  const [parts, setParts] = useState(v.parts || []);
  useEffect(() => setParts(v.parts || []), [v.parts]);

  function commit(next) {
    setParts(next);
    onChange(v.id, { parts: next });
  }
  function updatePart(idx, patch) {
    setParts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function blurPart() {
    onChange(v.id, { parts });
  }
  function removePart(idx) {
    commit(parts.filter((_, i) => i !== idx));
  }
  function addPart() {
    commit([...parts, { name: "New line", unitCost: 0, qty: 1 }]);
  }

  return (
    <tr className="bf-parts-row">
      <td colSpan={7}>
        <table className="bf-parts-table">
          <thead>
            <tr>
              <th>Line item</th>
              <th>Unit cost</th>
              <th>Qty</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, idx) => (
              <tr key={p.id || idx}>
                <td>
                  <input disabled={!canWrite} value={p.name} onChange={(e) => updatePart(idx, { name: e.target.value })} onBlur={blurPart} />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canWrite}
                    value={p.unitCost}
                    onChange={(e) => updatePart(idx, { unitCost: e.target.value })}
                    onBlur={() => onChange(v.id, { parts: parts.map((pp, i) => (i === idx ? { ...pp, unitCost: Number(pp.unitCost || 0) } : pp)) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canWrite}
                    value={p.qty}
                    onChange={(e) => updatePart(idx, { qty: e.target.value })}
                    onBlur={() => onChange(v.id, { parts: parts.map((pp, i) => (i === idx ? { ...pp, qty: Number(pp.qty || 0) } : pp)) })}
                  />
                </td>
                <td className="bf-var-total">{money(Number(p.unitCost || 0) * Number(p.qty || 0))}</td>
                <td>
                  {canWrite && (
                    <button onClick={() => removePart(idx)} title="Remove line">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && (
          <button className="bf-addvar-btn" onClick={addPart}>
            + Add line
          </button>
        )}
      </td>
    </tr>
  );
}

export function VariationRow({ v, canApprove, canWrite = true, onChange, onDelete, onSaveAsPreset, onPrintOne }) {
  const [local, setLocal] = useState(v);
  useEffect(() => setLocal(v), [v]);
  const save = (patch) => onChange(v.id, patch);
  const itemized = Array.isArray(v.parts) && v.parts.length > 0;
  const [partsOpen, setPartsOpen] = useState(false);

  return (
    <>
      <tr className={v.approved ? "approved" : ""}>
        <td>
          <input
            disabled={!canWrite}
            value={local.name}
            onChange={(e) => setLocal((s) => ({ ...s, name: e.target.value }))}
            onBlur={() => save({ name: local.name })}
          />
          <input
            className="bf-var-desc"
            placeholder="Description"
            disabled={!canWrite}
            value={local.description}
            onChange={(e) => setLocal((s) => ({ ...s, description: e.target.value }))}
            onBlur={() => save({ description: local.description })}
          />
        </td>
        <td>
          {itemized ? (
            <button className="bf-itemised-toggle" onClick={() => setPartsOpen((o) => !o)}>
              {v.parts.length} line{v.parts.length === 1 ? "" : "s"} {partsOpen ? "▴" : "▾"}
            </button>
          ) : (
            <input
              type="number"
              step="0.01"
              disabled={!canWrite}
              value={local.unitCost}
              onChange={(e) => setLocal((s) => ({ ...s, unitCost: e.target.value }))}
              onBlur={() => save({ unitCost: Number(local.unitCost || 0) })}
            />
          )}
        </td>
        <td>
          {itemized ? (
            <span className="bf-var-muted">—</span>
          ) : (
            <input
              type="number"
              step="0.01"
              disabled={!canWrite}
              value={local.qty}
              onChange={(e) => setLocal((s) => ({ ...s, qty: e.target.value }))}
              onBlur={() => save({ qty: Number(local.qty || 0) })}
            />
          )}
        </td>
        <td>
          <input
            type="number"
            step="0.01"
            disabled={!canWrite}
            value={local.extra}
            onChange={(e) => setLocal((s) => ({ ...s, extra: e.target.value }))}
            onBlur={() => save({ extra: Number(local.extra || 0) })}
          />
        </td>
        <td className="bf-var-total">{money(variationTotal(v))}</td>
        <td>
          <input type="checkbox" checked={v.approved} disabled={!canApprove} onChange={(e) => onChange(v.id, { approved: e.target.checked })} />
        </td>
        <td className="bf-var-actions">
          {v.attachmentData ? (
            <>
              <a href={v.attachmentData} download={v.attachmentName || "attachment"} title={v.attachmentName}>
                📎
              </a>
              {canWrite && (
                <button title="Remove attachment" onClick={() => onChange(v.id, { removeAttachment: true })}>
                  ✕
                </button>
              )}
            </>
          ) : (
            canWrite && (
              <label className="bf-attach-btn" title="Attach file">
                📎
                <input
                  type="file"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const data = await readAttachment(file);
                      onChange(v.id, { attachmentData: data, attachmentName: file.name, attachmentType: file.type });
                    } catch (err) {
                      alert(err.message || "Failed to attach file");
                    }
                  }}
                />
              </label>
            )
          )}
          {onPrintOne && (
            <button title="Print this variation" onClick={() => onPrintOne(v)}>
              🖨
            </button>
          )}
          {canWrite && onSaveAsPreset && (
            <button title="Save as preset" onClick={() => onSaveAsPreset(v)}>
              ⭐
            </button>
          )}
          {canWrite && (
            <button title="Delete variation" onClick={() => onDelete(v.id)}>
              🗑
            </button>
          )}
        </td>
      </tr>
      {itemized && partsOpen && <PartsEditor v={v} onChange={onChange} canWrite={canWrite} />}
    </>
  );
}

/** Shared variation-mutation helpers against a job's variations, used by both bushfire pages. */
export function makeVariationActions({ job, onJobChanged }) {
  async function patchVariation(id, patch) {
    const body = { ...patch };
    if (body.removeAttachment) {
      delete body.removeAttachment;
      const res = await fetch(`/api/bushfire/variations/${id}/attachment`, { method: "DELETE", headers: getApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onJobChanged({ ...job, variations: job.variations.map((v) => (v.id === id ? data : v)) });
      return;
    }
    const url = Object.prototype.hasOwnProperty.call(body, "approved") ? `/api/bushfire/variations/${id}/approve` : `/api/bushfire/variations/${id}`;
    const method = url.endsWith("/approve") ? "PATCH" : "PUT";
    const res = await fetch(url, { method, headers: getApiHeaders(), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged({ ...job, variations: job.variations.map((v) => (v.id === id ? data : v)) });
  }

  async function addVariation(data) {
    const res = await fetch(`/api/bushfire/jobs/${job.id}/variations`, { method: "POST", headers: getApiHeaders(), body: JSON.stringify(data) });
    const v = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged({ ...job, variations: [...job.variations, v] });
  }

  async function deleteVariation(id) {
    if (!confirm("Delete this variation?")) return;
    const res = await fetch(`/api/bushfire/variations/${id}`, { method: "DELETE", headers: getApiHeaders() });
    if (res.ok) onJobChanged({ ...job, variations: job.variations.filter((v) => v.id !== id) });
  }

  return { patchVariation, addVariation, deleteVariation };
}
