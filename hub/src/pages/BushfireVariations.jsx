import { useEffect, useMemo, useState } from "react";
import { getApiHeaders } from "../auth";
import { money, variationTotal, VariationRow, makeVariationActions } from "./bushfireShared";
import "./JobTracking.css";
import "./BushfireVariations.css";

function suburbOf(address) {
  const parts = (address || "").split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : address || "";
}

function PrintView({ job, mode, variations, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 50);
    const after = () => onClose();
    window.addEventListener("afterprint", after);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const total = variations.reduce((s, v) => s + variationTotal(v), 0);
  const grand = mode === "quote" ? total + Number(job.contractCost || 0) : total;

  return (
    <div className="bf-print">
      <button className="bf-print-close" onMouseDown={onClose}>
        Close
      </button>
      <h1>{mode === "invoice" ? "Invoice" : "Quote"}</h1>
      <div className="bf-print-addr">{job.address}</div>
      <div className="bf-print-date">{new Date().toLocaleDateString("en-AU")}</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th>Unit cost</th>
            <th>Qty</th>
            <th>Extra</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {variations.map((v) => (
            <tr key={v.id}>
              <td>{v.name}</td>
              <td>{v.description}</td>
              <td>{money(v.unitCost)}</td>
              <td>{v.qty}</td>
              <td>{money(v.extra)}</td>
              <td>{money(variationTotal(v))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bf-print-totals">
        {mode === "quote" && <div>Contract cost: {money(job.contractCost)}</div>}
        <div>Variations total: {money(total)}</div>
        <div className="bf-print-grand">Grand total: {money(grand)}</div>
      </div>
      {mode === "quote" && (
        <>
          <div className="bf-print-note">This quote is valid for 30 days from the date above.</div>
          <div className="bf-print-sign">
            <div>Signed: ____________________________</div>
            <div>Date: ____________________</div>
          </div>
        </>
      )}
    </div>
  );
}

function JobRow({ job, expanded, onToggle, presets, canApprove, canWrite, onJobChanged, onJobDeleted, onPrint }) {
  const [local, setLocal] = useState(job);
  useEffect(() => setLocal(job), [job.address, job.contractCost, job.notes, job.status]);
  const { patchVariation, addVariation, deleteVariation } = makeVariationActions({ job, onJobChanged });

  async function patchJob(patch) {
    const res = await fetch(`/api/bushfire/jobs/${job.id}`, { method: "PUT", headers: getApiHeaders(), body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged(data);
  }

  async function saveAsPreset(v) {
    const res = await fetch("/api/bushfire/presets", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ label: v.name, description: v.description, unitCost: v.unitCost, qty: v.qty, extra: v.extra }),
    });
    if (res.ok) presets.onAdded?.(await res.json());
  }

  async function applyPreset(p) {
    if (p.isGroup) {
      // Fire all four line items in parallel and merge into one state update —
      // sequential awaited onJobChanged calls would each close over the same
      // stale `job.variations` snapshot and clobber one another.
      const results = await Promise.all(
        p.groupItems.map((item) =>
          fetch(`/api/bushfire/jobs/${job.id}/variations`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({ name: item.name, unitCost: item.unitCost, qty: item.qty, extra: 0 }),
          }).then((r) => r.json())
        )
      );
      onJobChanged({ ...job, variations: [...job.variations, ...results.filter((v) => v && v.id)] });
    } else {
      await addVariation({ name: p.label, description: p.description, unitCost: p.unitCost || 0, qty: p.qty ?? 1, extra: p.extra || 0 });
    }
  }

  async function deleteJob() {
    if (!confirm(`Delete the bushfire job at "${job.address}"? This removes all its variations too.`)) return;
    const res = await fetch(`/api/bushfire/jobs/${job.id}`, { method: "DELETE", headers: getApiHeaders() });
    if (res.ok) onJobDeleted(job.id);
  }

  const total = job.variations.reduce((s, v) => s + variationTotal(v), 0);
  const approvedTotal = job.variations.filter((v) => v.approved).reduce((s, v) => s + variationTotal(v), 0);

  return (
    <div className={`bf-job ${job.status !== "active" ? "bf-job--" + job.status : ""}`}>
      <div className="bf-job-head" onClick={onToggle}>
        <span className="bf-job-caret">{expanded ? "▾" : "▸"}</span>
        <input
          className="bf-job-addr"
          value={local.address}
          disabled={!canWrite}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setLocal((s) => ({ ...s, address: e.target.value }))}
          onBlur={() => patchJob({ address: local.address })}
        />
        {job.status !== "active" && <span className={`bf-badge bf-badge--${job.status}`}>{job.status}</span>}
        <span className="bf-job-stat">{job.variations.length} variation{job.variations.length === 1 ? "" : "s"}</span>
        <span className="bf-job-stat">Total {money(total)}</span>
        <span className="bf-job-stat">Approved {money(approvedTotal)}</span>
      </div>
      {expanded && (
        <div className="bf-job-body" onClick={(e) => e.stopPropagation()}>
          <div className="bf-job-fields">
            <label>
              Contract cost
              <input
                type="number"
                step="0.01"
                disabled={!canWrite}
                value={local.contractCost}
                onChange={(e) => setLocal((s) => ({ ...s, contractCost: e.target.value }))}
                onBlur={() => patchJob({ contractCost: Number(local.contractCost || 0) })}
              />
            </label>
            <label className="bf-job-notes">
              Notes
              <textarea
                disabled={!canWrite}
                value={local.notes}
                onChange={(e) => setLocal((s) => ({ ...s, notes: e.target.value }))}
                onBlur={() => patchJob({ notes: local.notes })}
              />
            </label>
          </div>

          <div className="bf-job-actions">
            {canWrite &&
              (job.status !== "hold" ? (
                <button onClick={() => patchJob({ status: "hold" })}>Put on hold</button>
              ) : (
                <button onClick={() => patchJob({ status: "active" })}>Activate</button>
              ))}
            {canWrite &&
              (job.status !== "archived" ? (
                <button onClick={() => patchJob({ status: "archived" })}>Archive</button>
              ) : (
                <button onClick={() => patchJob({ status: "active" })}>Restore</button>
              ))}
            <button onClick={() => onPrint(job, "quote", job.variations)}>Print quote</button>
            <button onClick={() => onPrint(job, "invoice", job.variations.filter((v) => v.approved))}>Print invoice</button>
            {canWrite && (
              <button className="bf-danger" onClick={deleteJob}>
                Delete job
              </button>
            )}
          </div>

          {canWrite && (
            <div className="bf-presets">
              {presets.list.map((p) => (
                <span key={p.id} className="bf-preset-chip">
                  <button onClick={() => applyPreset(p)} title={p.description}>
                    + {p.label}
                  </button>
                  <button
                    className="bf-preset-remove"
                    title="Remove preset"
                    onClick={async () => {
                      if (!confirm(`Remove the "${p.label}" quick-add preset?`)) return;
                      const res = await fetch(`/api/bushfire/presets/${encodeURIComponent(p.id)}`, { method: "DELETE", headers: getApiHeaders() });
                      if (res.ok) presets.onDeleted?.(p.id);
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <table className="bf-var-table">
            <thead>
              <tr>
                <th>Variation</th>
                <th>Unit cost</th>
                <th>Qty</th>
                <th>Extra</th>
                <th>Total</th>
                <th>Approved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {job.variations.map((v) => (
                <VariationRow
                  key={v.id}
                  v={v}
                  canApprove={canApprove}
                  canWrite={canWrite}
                  onChange={patchVariation}
                  onDelete={deleteVariation}
                  onSaveAsPreset={saveAsPreset}
                  onPrintOne={(one) => onPrint(job, "quote", [one])}
                />
              ))}
              {!job.variations.length && (
                <tr>
                  <td colSpan={7} className="bf-empty-row">
                    No variations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {canWrite && (
            <button className="bf-addvar-btn" onClick={() => addVariation({ name: "New variation", unitCost: 0, qty: 1, extra: 0 })}>
              + Add variation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BushfireVariations({ canApprove, canWrite = true }) {
  const [jobs, setJobs] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [sortBy, setSortBy] = useState("address");
  const [expanded, setExpanded] = useState(() => new Set());
  const [addingJob, setAddingJob] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [printing, setPrinting] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/bushfire/jobs", { headers: getApiHeaders() }).then((r) => r.json()),
      fetch("/api/bushfire/presets", { headers: getApiHeaders() }).then((r) => r.json()),
    ])
      .then(([j, p]) => {
        if (j.error) throw new Error(j.error);
        setJobs(Array.isArray(j) ? j : []);
        setPresets(Array.isArray(p) ? p : []);
      })
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onJobChanged(updated) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }
  function onJobDeleted(id) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function createJob() {
    if (!newAddress.trim()) return;
    const res = await fetch("/api/bushfire/jobs", { method: "POST", headers: getApiHeaders(), body: JSON.stringify({ address: newAddress }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setJobs((prev) => [...prev, data]);
      setExpanded((prev) => new Set(prev).add(data.id));
      setNewAddress("");
      setAddingJob(false);
    }
  }

  const visibleJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = jobs
      .filter((j) => (showArchived ? true : j.status !== "archived"))
      .filter((j) => (showHold ? true : j.status !== "hold"))
      .filter((j) => !q || j.address.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      const addrA = a.address.toLowerCase();
      const addrB = b.address.toLowerCase();
      if (sortBy === "suburb") {
        const cmp = suburbOf(a.address).toLowerCase().localeCompare(suburbOf(b.address).toLowerCase());
        if (cmp) return cmp;
      }
      return addrA.localeCompare(addrB);
    });
  }, [jobs, search, showArchived, showHold, sortBy]);

  const summary = useMemo(() => {
    const counted = jobs
      .filter((j) => (showArchived ? true : j.status !== "archived"))
      .filter((j) => (showHold ? true : j.status !== "hold"));
    const allVariations = counted.flatMap((j) => j.variations);
    return {
      jobCount: counted.length,
      variationCount: allVariations.length,
      contractValue: counted.reduce((s, j) => s + Number(j.contractCost || 0), 0),
      approvedTotal: allVariations.filter((v) => v.approved).reduce((s, v) => s + variationTotal(v), 0),
      notApprovedTotal: allVariations.filter((v) => !v.approved).reduce((s, v) => s + variationTotal(v), 0),
    };
  }, [jobs, showArchived, showHold]);

  if (printing) {
    return <PrintView job={printing.job} mode={printing.mode} variations={printing.variations} onClose={() => setPrinting(null)} />;
  }
  if (loading) return <div className="jt bf">Loading bushfire variations…</div>;
  if (error)
    return (
      <div className="jt bf">
        <div className="jt-empty">{error}</div>
      </div>
    );

  return (
    <div className="jt bf">
      <div className="jt-top">
        <h1>Bushfire Variations</h1>
        <div className="jt-counts">
          <span className="bf-sumcard">
            <b>{summary.jobCount}</b>Jobs
          </span>
          <span className="bf-sumcard">
            <b>{summary.variationCount}</b>Variations
          </span>
          <span className="bf-sumcard">
            <b>{money(summary.contractValue)}</b>Contract value
          </span>
          <span className="bf-sumcard c-done">
            <b>{money(summary.approvedTotal)}</b>Approved
          </span>
          <span className="bf-sumcard c-late">
            <b>{money(summary.notApprovedTotal)}</b>Not approved
          </span>
        </div>
      </div>

      <div className="jt-toolbar">
        <input type="search" placeholder="Search address…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="bf-archived-toggle">
          <input type="checkbox" checked={showHold} onChange={(e) => setShowHold(e.target.checked)} />
          Show on hold
        </label>
        <label className="bf-archived-toggle">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <label className="bf-sort-select">
          Sort by
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="address">Full address</option>
            <option value="suburb">Suburb</option>
          </select>
        </label>
        {!canWrite ? null : addingJob ? (
          <>
            <input
              autoFocus
              placeholder="Job address"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createJob()}
            />
            <button className="jt-managestages-btn" onClick={createJob}>
              Save
            </button>
            <button
              className="jt-managestages-btn"
              onClick={() => {
                setAddingJob(false);
                setNewAddress("");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button className="jt-managestages-btn" onClick={() => setAddingJob(true)} style={{ marginLeft: "auto" }}>
            + Add job address
          </button>
        )}
      </div>

      <div className="bf-list">
        {!visibleJobs.length && <div className="jt-empty">No bushfire jobs yet.</div>}
        {visibleJobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            expanded={expanded.has(job.id)}
            onToggle={() => toggle(job.id)}
            presets={{
              list: presets,
              onAdded: (p) => setPresets((prev) => [...prev, p]),
              onDeleted: (id) => setPresets((prev) => prev.filter((p) => p.id !== id)),
            }}
            canApprove={canApprove}
            canWrite={canWrite}
            onJobChanged={onJobChanged}
            onJobDeleted={onJobDeleted}
            onPrint={(job, mode, variations) => setPrinting({ job, mode, variations })}
          />
        ))}
      </div>
    </div>
  );
}
