import { useEffect, useState } from "react";
import { getApiHeaders } from "../auth";
import { money, variationTotal, VariationRow, makeVariationActions, jobStages, stagePercent, STAGE_NAMES } from "./bushfireShared";
import "./JobTracking.css";
import "./JobDetail.css";
import "./BushfireVariations.css";
import "./BushfireOrganizer.css";

const ELEC_OPTS = ["", "Power TBC", "Solar"];
const SEPTIC_OPTS = ["", "Permit TBC", "Ready"];

export default function BushfireUnitDetail({ jobId, canApprove, canWrite = true, onBack }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [local, setLocal] = useState(null);
  const [presets, setPresets] = useState([]);
  const [users, setUsers] = useState([]);
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");

  useEffect(() => {
    load();
    fetch("/api/bushfire/presets", { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setPresets(Array.isArray(data) ? data : []))
      .catch(() => setPresets([]));
    fetch("/api/users/names", { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function load() {
    setLoading(true);
    setError("");
    fetch(`/api/bushfire/jobs/${jobId}`, { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        setJob(data);
        setLocal(data);
      })
      .catch(() => setError("Could not load this unit"))
      .finally(() => setLoading(false));
  }

  function onJobChanged(updated) {
    setJob(updated);
    setLocal(updated);
  }

  async function patchJob(patch) {
    const res = await fetch(`/api/bushfire/jobs/${jobId}`, { method: "PUT", headers: getApiHeaders(), body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged(data);
  }

  async function patchStage(idx, patch) {
    const res = await fetch(`/api/bushfire/jobs/${jobId}/stages/${idx}`, { method: "PATCH", headers: getApiHeaders(), body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged(data);
  }

  async function deleteUnit() {
    if (!job || !confirm(`Delete the unit at "${job.address}"? This removes all its variations too.`)) return;
    const res = await fetch(`/api/bushfire/jobs/${jobId}`, { method: "DELETE", headers: getApiHeaders() });
    if (res.ok) onBack();
  }

  async function addTask() {
    if (!taskText.trim()) return;
    const res = await fetch(`/api/bushfire/jobs/${jobId}/tasks`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ text: taskText, dueDate: taskDue || null, assigneeUserId: taskAssignee ? Number(taskAssignee) : null }),
    });
    const t = await res.json().catch(() => ({}));
    if (res.ok) {
      onJobChanged({ ...job, tasks: [...job.tasks, t] });
      setTaskText("");
      setTaskDue("");
      setTaskAssignee("");
    }
  }
  async function toggleTask(t) {
    const res = await fetch(`/api/bushfire/jobs/${jobId}/tasks/${t.id}`, { method: "PATCH", headers: getApiHeaders(), body: JSON.stringify({ done: !t.done }) });
    const updated = await res.json().catch(() => ({}));
    if (res.ok) onJobChanged({ ...job, tasks: job.tasks.map((x) => (x.id === t.id ? updated : x)) });
  }
  async function deleteTask(t) {
    const res = await fetch(`/api/bushfire/jobs/${jobId}/tasks/${t.id}`, { method: "DELETE", headers: getApiHeaders() });
    if (res.ok) onJobChanged({ ...job, tasks: job.tasks.filter((x) => x.id !== t.id) });
  }

  async function saveAsPreset(v) {
    const res = await fetch("/api/bushfire/presets", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ label: v.name, description: v.description, unitCost: v.unitCost, qty: v.qty, extra: v.extra }),
    });
    if (res.ok) {
      const p = await res.json();
      setPresets((prev) => [...prev, p]);
    }
  }

  if (loading) return <div className="jt jd">Loading unit…</div>;
  if (error || !job)
    return (
      <div className="jt jd">
        <div className="jt-empty">{error || "Unit not found"}</div>
      </div>
    );

  const stages = jobStages(job);
  const doneCount = stages.filter((s) => s.complete).length;
  const { patchVariation, addVariation, deleteVariation } = makeVariationActions({ job, onJobChanged });
  const approvedTotal = job.variations.filter((v) => v.approved).reduce((s, v) => s + variationTotal(v), 0);
  const notApprovedTotal = job.variations.filter((v) => !v.approved).reduce((s, v) => s + variationTotal(v), 0);

  async function applyPreset(p) {
    if (p.isGroup) {
      const results = await Promise.all(
        p.groupItems.map((item) =>
          fetch(`/api/bushfire/jobs/${jobId}/variations`, {
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

  const nameFor = (id) => users.find((u) => u.id === id)?.name || "";

  return (
    <div className="jt jd">
      <div className="jd-breadcrumb">
        <button onClick={onBack}>← All units</button>
        <span>/ Bushfire Organizer</span>
      </div>

      <header className="jd-header">
        <div className="bo-detail-head-main">
          <input
            className="bo-detail-addr"
            value={local.address}
            disabled={!canWrite}
            onChange={(e) => setLocal((s) => ({ ...s, address: e.target.value }))}
            onBlur={() => patchJob({ address: local.address })}
          />
          <div className="jd-badges">
            {job.status === "hold" && <span className="jt-tag">ON HOLD</span>}
            {job.status === "archived" && <span className="jt-tag jt-tag--archived">COMPLETE</span>}
            <span className="jd-updated">Updated {job.updatedAt ? String(job.updatedAt).slice(0, 10) : "—"}</span>
          </div>
        </div>
        <div className="jd-header-right">
          <div className="jd-percent">
            <div className="jd-percent-num">{stagePercent(job)}%</div>
            <div className="jd-percent-sub">
              {doneCount} of {stages.length} stages done
            </div>
          </div>
          <div className="jd-actions">
            <button
              className="jt-managestages-btn"
              disabled={!canWrite}
              onClick={() => patchJob({ status: job.status === "hold" ? "active" : "hold" })}
            >
              {job.status === "hold" ? "Resume unit" : "Put on hold"}
            </button>
            <button
              className="jt-managestages-btn"
              disabled={!canWrite}
              onClick={() => patchJob({ status: job.status === "archived" ? "active" : "archived" })}
            >
              {job.status === "archived" ? "Reopen unit" : "Mark complete"}
            </button>
            <button className="jt-managestages-btn" onClick={() => window.print()}>
              Print unit report
            </button>
            {canWrite && (
              <button className="jt-stagemgr-danger jt-managestages-btn" onClick={deleteUnit}>
                Delete unit
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="jd-stagebar-panel">
        <div className="jd-stagebar-head">
          <h2>Build stages</h2>
          <div className="jt-legend">
            <span>
              <i style={{ background: "var(--done)" }} />
              Done
            </span>
            <span>
              <i style={{ background: "var(--empty)", border: "1px solid var(--line)" }} />
              Not done
            </span>
          </div>
        </div>
        <div className="jd-stagebar">
          {stages.map((s, idx) => (
            <div
              key={idx}
              className={"jd-stagebar-cell" + (s.complete ? " done" : "")}
              title={`${idx + 1}. ${STAGE_NAMES[idx]} — ${s.complete ? "Done" : "Not done"}`}
            />
          ))}
        </div>
        <div className="jd-stagebar-nums">
          {stages.map((_, idx) => (
            <span key={idx}>{idx + 1}</span>
          ))}
        </div>
      </div>

      <div className="jd-body">
        <div className="jd-main">
          <div className="jd-panel">
            <div className="jd-panel-head">
              <h2>Stage detail</h2>
              <span className="muted">Set the estimated date, then tick off each stage as it's done</span>
            </div>
            <div className="jd-table-wrap">
              <table className="jd-stage-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stage</th>
                    <th>Estimated date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s, idx) => (
                    <tr key={idx} className={s.complete ? "done" : ""}>
                      <td>{idx + 1}</td>
                      <td>{STAGE_NAMES[idx]}</td>
                      <td>
                        <input
                          type="date"
                          disabled={!canWrite}
                          value={s.estimatedDate || ""}
                          onChange={(e) => patchStage(idx, { estimatedDate: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          className={"bo-mark-btn" + (s.complete ? " bo-truck-done" : "")}
                          disabled={!canWrite}
                          onClick={() => patchStage(idx, { complete: !s.complete })}
                        >
                          {s.complete ? "✓ Complete" : "Mark complete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="jd-panel">
            <div className="jd-panel-head">
              <h2>Variations</h2>
              <span className="muted">
                {job.variations.length} variations · {money(approvedTotal)} approved · {money(notApprovedTotal)} not approved
              </span>
            </div>
            {canWrite && (
              <div className="bf-presets">
                {presets.map((p) => (
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
                        if (res.ok) setPresets((prev) => prev.filter((x) => x.id !== p.id));
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
        </div>

        <div className="jd-side">
          <div className="jd-panel">
            <h2>Unit details</h2>
            <div className="bo-corefields">
              <label>
                Status
                <select value={job.status} disabled={!canWrite} onChange={(e) => patchJob({ status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="hold">On hold</option>
                  <option value="archived">Complete</option>
                </select>
              </label>
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
              <label>
                Electrical service
                <select value={job.electricalService} disabled={!canWrite} onChange={(e) => patchJob({ electricalService: e.target.value })}>
                  {ELEC_OPTS.map((o) => (
                    <option key={o} value={o}>
                      {o || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Septic status
                <select value={job.septicStatus} disabled={!canWrite} onChange={(e) => patchJob({ septicStatus: e.target.value })}>
                  {SEPTIC_OPTS.map((o) => (
                    <option key={o} value={o}>
                      {o || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ARkit Truck 1 — Floor + Roof Pack
                <div className="bo-truck">
                  <input type="date" disabled={!canWrite} value={job.arkitTruck1Date} onChange={(e) => patchJob({ arkitTruck1Date: e.target.value })} />
                  <button
                    className={job.arkitTruck1Complete ? "bo-truck-done" : ""}
                    disabled={!canWrite}
                    onClick={() => patchJob({ arkitTruck1Complete: !job.arkitTruck1Complete })}
                  >
                    {job.arkitTruck1Complete ? "✓ Complete" : "Mark complete"}
                  </button>
                </div>
              </label>
              <label>
                ARkit Truck 2 — Wall Pack
                <div className="bo-truck">
                  <input type="date" disabled={!canWrite} value={job.arkitTruck2Date} onChange={(e) => patchJob({ arkitTruck2Date: e.target.value })} />
                  <button
                    className={job.arkitTruck2Complete ? "bo-truck-done" : ""}
                    disabled={!canWrite}
                    onClick={() => patchJob({ arkitTruck2Complete: !job.arkitTruck2Complete })}
                  >
                    {job.arkitTruck2Complete ? "✓ Complete" : "Mark complete"}
                  </button>
                </div>
              </label>
            </div>
          </div>

          <div className="jd-panel">
            <h2>Tasks</h2>
            {job.tasks.length === 0 && <div className="bo-empty-sub">No tasks yet.</div>}
            {job.tasks.map((t) => (
              <div key={t.id} className="bo-task-row">
                <input type="checkbox" checked={t.done} disabled={!canWrite} onChange={() => toggleTask(t)} />
                <span className={"bo-task-text" + (t.done ? " done" : "")}>{t.text}</span>
                {t.dueDate && <span className="bo-task-due">{t.dueDate}</span>}
                {t.assigneeUserId && <span className="bo-task-assignee">{nameFor(t.assigneeUserId)}</span>}
                {canWrite && (
                  <button onClick={() => deleteTask(t)} title="Delete task">
                    ✕
                  </button>
                )}
              </div>
            ))}
            {canWrite && (
              <div className="bo-task-add">
                <input placeholder="New task…" value={taskText} onChange={(e) => setTaskText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button onClick={addTask}>+ Add</button>
              </div>
            )}
          </div>

          <div className="jd-panel">
            <h2>Notes</h2>
            <textarea
              className="bo-notes"
              disabled={!canWrite}
              value={local.notes}
              onChange={(e) => setLocal((s) => ({ ...s, notes: e.target.value }))}
              onBlur={() => patchJob({ notes: local.notes })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
