import { useEffect, useRef, useState } from "react";
import { getApiHeaders } from "../auth";

export default function StageManager({ onClose }) {
  const [defs, setDefs] = useState([]);
  const [edits, setEdits] = useState({}); // stage key -> in-progress label text, kept apart from `defs` so blur can compare against the last saved label
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [newAfterKey, setNewAfterKey] = useState("");
  const [newAllowNA, setNewAllowNA] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Rename/reorder/add/remove all hit the same server-side list and each
  // response replaces `defs` wholesale — if two overlap (e.g. renaming a
  // stage then immediately clicking reorder on another row), whichever
  // response lands second wins and silently discards the other's change.
  // Queueing them keeps requests — and the state updates from their
  // responses — strictly in the order the user triggered them.
  const queueRef = useRef(Promise.resolve());
  function enqueue(task) {
    const result = queueRef.current.then(task, task);
    queueRef.current = result.catch(() => {});
    return result;
  }

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError("");
    fetch("/api/construction-stages/definitions", { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setDefs)
      .catch(() => setError("Could not load stages"))
      .finally(() => setLoading(false));
  }

  function renameStage(key, label) {
    return enqueue(async () => {
      try {
        const res = await fetch(`/api/construction-stages/definitions/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({ label }),
        });
        if (!res.ok) throw new Error();
        setDefs(await res.json());
      } catch {
        load();
      }
    });
  }

  function reorder(orderedKeys) {
    return enqueue(async () => {
      setDefs((prev) => orderedKeys.map((k) => prev.find((d) => d.key === k)));
      try {
        const res = await fetch("/api/construction-stages/definitions/reorder", {
          method: "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({ order: orderedKeys }),
        });
        if (!res.ok) throw new Error();
        setDefs(await res.json());
      } catch {
        load();
      }
    });
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= defs.length) return;
    const keys = defs.map((d) => d.key);
    [keys[index], keys[target]] = [keys[target], keys[index]];
    reorder(keys);
  }

  function removeStage(key) {
    setConfirmRemoveKey(null);
    return enqueue(async () => {
      try {
        const res = await fetch(`/api/construction-stages/definitions/${encodeURIComponent(key)}`, {
          method: "DELETE",
          headers: getApiHeaders(),
        });
        if (!res.ok) throw new Error();
        setDefs(await res.json());
      } catch {
        load();
      }
    });
  }

  async function addStage() {
    if (!newLabel.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await enqueue(async () => {
        const res = await fetch("/api/construction-stages/definitions", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({ label: newLabel.trim(), afterKey: newAfterKey || undefined, allowNA: newAllowNA }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAddError(data.error || "Failed to add stage");
          return;
        }
        setDefs(data);
        setNewLabel("");
        setNewAfterKey("");
        setNewAllowNA(false);
      });
    } catch {
      setAddError("Failed to add stage");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="jt-scrim" onMouseDown={onClose} />
      <div className="jt-stagemgr" role="dialog" aria-label="Manage stages">
        <div className="jt-stagemgr-head">
          <h2>Manage stages</h2>
          <button className="jt-stagemgr-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          Rename, reorder, add or remove stages in the pipeline. This changes every job on this page.
        </p>
        {loading && <p>Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && (
          <div className="jt-stagemgr-list">
            {defs.map((def, i) => (
              <div key={def.key} className="jt-stagemgr-row">
                <span className="jt-stagemgr-order">{i + 1}</span>
                <input
                  className="jt-stagemgr-label"
                  value={edits[def.key] ?? def.label}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [def.key]: e.target.value }))}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    if (trimmed && trimmed !== def.label) renameStage(def.key, trimmed);
                    setEdits((prev) => {
                      const next = { ...prev };
                      delete next[def.key];
                      return next;
                    });
                  }}
                />
                {def.allowNA && <span className="badge active">N/A allowed</span>}
                <div className="jt-stagemgr-actions">
                  <button disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                    ↑
                  </button>
                  <button disabled={i === defs.length - 1} onClick={() => move(i, 1)} title="Move down">
                    ↓
                  </button>
                  {confirmRemoveKey === def.key ? (
                    <>
                      <button className="jt-stagemgr-danger" onClick={() => removeStage(def.key)}>
                        Confirm remove
                      </button>
                      <button onClick={() => setConfirmRemoveKey(null)}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmRemoveKey(def.key)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="jt-stagemgr-add">
          <h3>Add stage</h3>
          <div className="form-row">
            <label className="field">
              <span>Name</span>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Site Fencing" />
            </label>
            <label className="field">
              <span>Insert after</span>
              <select value={newAfterKey} onChange={(e) => setNewAfterKey(e.target.value)}>
                <option value="">— End of list —</option>
                {defs.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field jt-stagemgr-checkbox">
              <span>
                <input type="checkbox" checked={newAllowNA} onChange={(e) => setNewAllowNA(e.target.checked)} />
                Allow "Not applicable"
              </span>
            </label>
            <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={addStage} disabled={!newLabel.trim() || adding}>
              {adding ? "Adding…" : "Add stage"}
            </button>
          </div>
          {addError && <p className="error">{addError}</p>}
        </div>
      </div>
    </>
  );
}
