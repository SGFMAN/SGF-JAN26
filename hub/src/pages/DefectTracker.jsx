import { useEffect, useMemo, useState } from "react";
import { getApiHeaders, getLoggedInUserId, isTradeAccount } from "../auth";
import "./JobTracking.css";
import "./JobDetail.css";
import "./DefectTracker.css";

const pad = (n) => String(n).padStart(2, "0");
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function longDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${+d}/${+m}/${y}`;
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 500;
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
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
function readVideoFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_BYTES) {
      reject(new Error(`Video too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — keep videos under 25 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function processMediaFile(file) {
  return file.type.startsWith("video/") ? readVideoFile(file) : resizeImage(file);
}
function mediaTag(src, key) {
  const isVideo = /^data:video\//i.test(src);
  return isVideo ? (
    <video key={key} src={src} muted playsInline preload="metadata" />
  ) : (
    <img key={key} src={src} alt="Defect" loading="lazy" />
  );
}

function defectStatus(d) {
  const missing = [];
  if (!d.bookInDate || d.bookInDate !== d.date) missing.push("Awaiting contractor confirmation");
  if (d.confirmed !== "yes") missing.push("Awaiting customer confirmation");
  return missing.length ? { ok: false, text: missing.join(" · ") } : { ok: true, text: "Good to go" };
}

function matchesFilter(d, filter) {
  switch (filter) {
    case "unconfirmed":
      return !d.completed && defectStatus(d).ok === false;
    case "confirmed":
      return !d.completed && defectStatus(d).ok === true;
    case "flagged":
      return !d.completed && d.needsAttention;
    case "completed":
      return d.completed;
    default:
      return !d.completed;
  }
}

function DefectModal({ defect, accounts, trade, myAccountId, canWrite, onClose, onChanged }) {
  const [d, setD] = useState(defect);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(defect);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeReport, setCompleteReport] = useState("");
  const [completePhotos, setCompletePhotos] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const mine = !trade || d.assigneeAccountId === myAccountId;

  useEffect(() => {
    fetch(`/api/defects/${defect.id}/notes`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]));
  }, [defect.id]);

  async function refresh() {
    const res = await fetch(`/api/defects/${defect.id}`, { headers: getApiHeaders() });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      setForm(fresh);
      onChanged(fresh);
    }
  }

  async function saveEdit() {
    const res = await fetch(`/api/defects/${defect.id}`, {
      method: "PUT",
      headers: getApiHeaders(),
      body: JSON.stringify({
        address: form.address,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        assigneeAccountId: form.assigneeAccountId || null,
        date: form.date || null,
        timeStart: form.timeStart,
        timeEnd: form.timeEnd,
        notes: form.notes,
      }),
    });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
      setEditing(false);
    }
  }

  async function toggleConfirmed() {
    const res = await fetch(`/api/defects/${defect.id}/confirm`, {
      method: "PUT",
      headers: getApiHeaders(),
      body: JSON.stringify({ confirmed: d.confirmed === "yes" ? "no" : "yes" }),
    });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
    }
  }

  async function toggleFlag() {
    const res = await fetch(`/api/defects/${defect.id}/flag`, { method: "POST", headers: getApiHeaders() });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
    }
  }

  async function confirmBookin() {
    const res = await fetch(`/api/defects/${defect.id}/bookin`, {
      method: "PATCH",
      headers: getApiHeaders(),
      body: JSON.stringify({ date: d.date }),
    });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    const res = await fetch(`/api/defects/${defect.id}/notes`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ body: newNote.trim() }),
    });
    if (res.ok) {
      const note = await res.json();
      setNotes((prev) => [...prev, note]);
      setNewNote("");
    }
  }

  async function handlePhotoInput(e, target) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoMsg("");
    const urls = [];
    const errors = [];
    for (const file of files) {
      try {
        urls.push(await processMediaFile(file));
      } catch (err) {
        errors.push(err.message || `Could not add ${file.name}`);
      }
    }
    try {
      if (urls.length) {
        if (target === "completion-draft") {
          setCompletePhotos((prev) => [...prev, ...urls]);
        } else {
          const res = await fetch(`/api/defects/${defect.id}/photos`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({ photos: urls, target }),
          });
          if (res.ok) {
            const fresh = await res.json();
            setD(fresh);
            onChanged(fresh);
          }
        }
      }
      if (errors.length) setPhotoMsg(errors.join(" "));
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  async function submitComplete() {
    const res = await fetch(`/api/defects/${defect.id}/complete`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ completionReport: completeReport, completionPhotos: completePhotos }),
    });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
      setCompleteOpen(false);
      setCompleteReport("");
      setCompletePhotos([]);
    }
  }

  async function reopen() {
    const res = await fetch(`/api/defects/${defect.id}/reopen`, { method: "POST", headers: getApiHeaders() });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
    }
  }

  async function regenerateLink() {
    const res = await fetch(`/api/defects/${defect.id}/regenerate-code`, { method: "POST", headers: getApiHeaders() });
    if (res.ok) {
      const fresh = await res.json();
      setD(fresh);
      onChanged(fresh);
    }
  }

  async function copyToDefectsBoard() {
    const res = await fetch(`/api/defects/${defect.id}/copy-to-defects`, { method: "POST", headers: getApiHeaders() });
    if (res.ok) {
      await res.json();
      onChanged(null, true);
      onClose();
    }
  }

  async function removeDefect() {
    const res = await fetch(`/api/defects/${defect.id}`, { method: "DELETE", headers: getApiHeaders() });
    if (res.ok) {
      onChanged(null, true);
      onClose();
    }
  }

  const st = defectStatus(d);
  const link = `${window.location.origin}/defect-job?id=${d.id}&code=${encodeURIComponent(d.accessCode || "")}`;

  return (
    <>
      <div className="jt-scrim" onMouseDown={onClose} />
      <div className="dt-modal" role="dialog" aria-label="Defect detail">
        <div className="dt-modal-head">
          <div>
            <span className={"statusDot " + (st.ok ? "ok" : "bad")} />
            <h2>{d.address}</h2>
            <p className={"statusText " + (st.ok ? "ok" : "bad")}>{st.text}</p>
          </div>
          <button className="jt-stagemgr-close" onClick={onClose}>
            Close
          </button>
        </div>

        {!mine && <p className="muted">You can view this job, but only the assigned crew can edit it.</p>}

        {!trade && canWrite && (
          <div className="dt-actionrow">
            <button className="jt-archive-btn" onClick={toggleFlag}>
              {d.needsAttention ? "Unflag" : "🚩 Flag"}
            </button>
            <button className="jt-archive-btn" onClick={toggleConfirmed}>
              {d.confirmed === "yes" ? "Mark not confirmed" : "Mark confirmed"}
            </button>
            {!d.completed ? (
              <button className="jt-archive-btn" onClick={() => setCompleteOpen(true)}>
                Mark completed
              </button>
            ) : (
              <button className="jt-archive-btn" onClick={reopen}>
                Reopen
              </button>
            )}
            {d.kind === "inspection" && (
              <button className="jt-archive-btn" onClick={copyToDefectsBoard}>
                Copy to Defects
              </button>
            )}
            <button className="jt-archive-btn" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel edit" : "Edit"}
            </button>
            <button className="jt-archive-btn jt-stagemgr-danger" onClick={removeDefect}>
              Delete
            </button>
          </div>
        )}

        {editing ? (
          <div className="dt-editgrid">
            <label className="field">
              <span>Address</span>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label className="field">
              <span>Customer name</span>
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </label>
            <label className="field">
              <span>Customer phone</span>
              <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </label>
            <label className="field">
              <span>Customer email</span>
              <input value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
            </label>
            <label className="field">
              <span>Assigned to</span>
              <select value={form.assigneeAccountId || ""} onChange={(e) => setForm({ ...form, assigneeAccountId: e.target.value })}>
                <option value="">— Unassigned —</option>
                {accounts
                  .filter((a) => !a.state || a.state === d.state || String(a.id) === String(form.assigneeAccountId))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.role ? ` (${a.role})` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              <span>Start time</span>
              <input value={form.timeStart || ""} onChange={(e) => setForm({ ...form, timeStart: e.target.value })} placeholder="e.g. 9:00am" />
            </label>
            <label className="field">
              <span>End time</span>
              <input value={form.timeEnd || ""} onChange={(e) => setForm({ ...form, timeEnd: e.target.value })} placeholder="e.g. 11:00am" />
            </label>
            <label className="field dt-full">
              <span>Brief / instructions</span>
              <textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={saveEdit}>
              Save changes
            </button>
          </div>
        ) : (
          <div className="dt-infogrid">
            <div>
              <div className="jd-info-label">Customer</div>
              <div>{d.customerName || "—"}</div>
            </div>
            <div>
              <div className="jd-info-label">Phone</div>
              <div>{d.customerPhone || "—"}</div>
            </div>
            <div>
              <div className="jd-info-label">Email</div>
              <div>{d.customerEmail || "—"}</div>
            </div>
            <div>
              <div className="jd-info-label">Assigned to</div>
              <div>{d.assigneeName || "Unassigned"}</div>
            </div>
            <div>
              <div className="jd-info-label">Scheduled</div>
              <div>{[d.date ? longDate(d.date) : null, d.timeStart].filter(Boolean).join(" ") || "Not yet scheduled"}</div>
            </div>
            <div>
              <div className="jd-info-label">Contractor confirmation</div>
              <div>
                {!d.date ? (
                  "—"
                ) : d.bookInDate === d.date ? (
                  <span style={{ color: "#2e8b4f", fontWeight: 700 }}>✓ Confirmed</span>
                ) : canWrite && (!trade || mine) ? (
                  <button className="jt-archive-btn" onClick={confirmBookin}>
                    Confirm this date
                  </button>
                ) : (
                  "Not yet confirmed"
                )}
              </div>
            </div>
            {d.notes && (
              <div className="dt-full">
                <div className="jd-info-label">Brief / instructions</div>
                <div className="dt-notesbox">{d.notes}</div>
              </div>
            )}
          </div>
        )}

        {!trade && canWrite && (
          <div className="dt-linkrow">
            <div className="jd-info-label">Contractor link</div>
            <div className="dt-linkbox">
              <input readOnly value={link} onClick={(e) => e.target.select()} />
              <button
                className="jt-archive-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(link).catch(() => {});
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }}
              >
                {linkCopied ? "Copied!" : "Copy link"}
              </button>
              <button className="jt-archive-btn" onClick={regenerateLink}>
                Regenerate
              </button>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              Anyone with this link can view and update this job without logging in. Regenerating breaks the old link.
            </p>
          </div>
        )}

        <div className="dt-photosection">
          <h3>Photos — on site</h3>
          <div className="dt-photogrid">{d.photos.map((src, i) => mediaTag(src, i))}</div>
          {canWrite && (!trade || mine) && (
            <label className="photo-input" style={{ display: "block" }}>
              {photoBusy ? "Uploading…" : "Click to add photos or videos"}
              <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={(e) => handlePhotoInput(e, "photos")} />
            </label>
          )}
          {photoMsg && <p className="error">{photoMsg}</p>}

          {(d.completionPhotos.length > 0 || !trade) && (
            <>
              <h3 style={{ marginTop: 14 }}>Photos — completion</h3>
              <div className="dt-photogrid">{d.completionPhotos.map((src, i) => mediaTag(src, i))}</div>
              {!d.completionPhotos.length && <p className="muted">No completion photos yet.</p>}
            </>
          )}
        </div>

        <div className="dt-notessection">
          <h3>Notes</h3>
          <div className="dt-notes-list">
            {notes.map((n) => (
              <div key={n.id} className="jd-note">
                <div className="jd-note-meta">
                  {n.authorName} · {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                </div>
                <div className="jd-note-body">{n.body}</div>
              </div>
            ))}
            {!notes.length && <p className="muted">No notes yet.</p>}
          </div>
          {canWrite && (!trade || mine) && (
            <div className="jd-note-add" style={{ marginTop: 10 }}>
              <textarea rows={2} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Progress update, access issue, question…" />
              <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={addNote} disabled={!newNote.trim()}>
                Add note
              </button>
            </div>
          )}
        </div>

        {completeOpen && (
          <>
            <div className="jt-scrim" onMouseDown={() => setCompleteOpen(false)} />
            <div className="jt-stagemgr" style={{ width: 480 }}>
              <div className="jt-stagemgr-head">
                <h2>Mark completed</h2>
                <button className="jt-stagemgr-close" onClick={() => setCompleteOpen(false)}>
                  Close
                </button>
              </div>
              <label className="field dt-full">
                <span>Completion report</span>
                <textarea rows={4} value={completeReport} onChange={(e) => setCompleteReport(e.target.value)} />
              </label>
              <div className="dt-photogrid">{completePhotos.map((src, i) => mediaTag(src, i))}</div>
              <label className="photo-input" style={{ display: "block", marginTop: 8 }}>
                {photoBusy ? "Uploading…" : "Add completion photos or videos"}
                <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={(e) => handlePhotoInput(e, "completion-draft")} />
              </label>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={submitComplete}>
                Save &amp; mark completed
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function DefectTracker({ state, canWrite = true }) {
  const trade = isTradeAccount();
  const myAccountId = Number(getLoggedInUserId());
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [kind, setKind] = useState("defects");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newDefect, setNewDefect] = useState({
    address: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    assigneeAccountId: "",
    date: "",
    timeStart: "",
    timeEnd: "",
    notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    load();
    if (!trade) {
      fetch("/api/sgfhub/accounts", { headers: getApiHeaders() })
        .then((r) => r.json())
        .then((data) => setAccounts(Array.isArray(data) ? data.filter((a) => a.active) : []))
        .catch(() => setAccounts([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function load() {
    setLoading(true);
    setError("");
    fetch(`/api/defects?state=${state}`, { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setDefects)
      .catch(() => setError("Could not load defects"))
      .finally(() => setLoading(false));
  }

  const kindDefects = useMemo(() => defects.filter((d) => d.kind === kind), [defects, kind]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kindDefects
      .filter((d) => matchesFilter(d, filter))
      .filter((d) => !q || `${d.address} ${d.customerName}`.toLowerCase().includes(q));
  }, [kindDefects, filter, query]);

  const counts = {
    all: kindDefects.filter((d) => !d.completed).length,
    unconfirmed: kindDefects.filter((d) => !d.completed && !defectStatus(d).ok).length,
    flagged: kindDefects.filter((d) => !d.completed && d.needsAttention).length,
    completed: kindDefects.filter((d) => d.completed).length,
  };

  async function createDefect() {
    if (!newDefect.address.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/defects", {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ ...newDefect, state, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || "Failed to create defect");
        return;
      }
      setDefects((prev) => [data, ...prev]);
      setShowCreate(false);
      setNewDefect({ address: "", customerName: "", customerPhone: "", customerEmail: "", assigneeAccountId: "", date: "", timeStart: "", timeEnd: "", notes: "" });
    } finally {
      setCreating(false);
    }
  }

  function onModalChanged(fresh, removed) {
    if (removed) {
      setDefects((prev) => prev.filter((d) => d.id !== selectedId));
      load();
      return;
    }
    if (fresh) setDefects((prev) => prev.map((d) => (d.id === fresh.id ? fresh : d)));
  }

  const selected = defects.find((d) => d.id === selectedId);

  if (loading) return <div className="jt dt">Loading defects…</div>;
  if (error)
    return (
      <div className="jt dt">
        <div className="jt-empty">{error}</div>
      </div>
    );

  return (
    <div className="jt dt">
      <header className="jt-top">
        <div>
          <h1>{state} Defects</h1>
          <div className="sub">
            {kind === "defects" ? "Warranty & repair callbacks" : "Handover walkthrough findings"} · showing {visible.length} of {kindDefects.length}
          </div>
        </div>
        <div className="jt-counts">
          <span>
            <b>{counts.all}</b>active
          </span>
          <span className="c-late">
            <b>{counts.unconfirmed}</b>unconfirmed
          </span>
          <span className="c-late">
            <b>{counts.flagged}</b>flagged
          </span>
          <span className="c-done">
            <b>{counts.completed}</b>completed
          </span>
        </div>
      </header>

      <div className="jt-toolbar">
        <div className="dt-kindtabs">
          <button className={kind === "defects" ? "on" : ""} onClick={() => setKind("defects")}>
            Defects
          </button>
          <button className={kind === "inspection" ? "on" : ""} onClick={() => setKind("inspection")}>
            Inspection (Handover)
          </button>
        </div>
        <input type="search" placeholder="Search address or customer" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search defects" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="unconfirmed">Not confirmed</option>
          <option value="confirmed">Confirmed</option>
          <option value="flagged">Flagged</option>
          <option value="completed">Completed</option>
        </select>
        {!trade && canWrite && (
          <button className="jt-managestages-btn" onClick={() => setShowCreate(true)}>
            Add defect
          </button>
        )}
      </div>

      <div className="dt-list">
        {visible.map((d) => {
          const st = defectStatus(d);
          const mine = !trade || d.assigneeAccountId === myAccountId;
          return (
            <div
              key={d.id}
              className={"dt-card" + (d.needsAttention ? " flagged" : "") + (!mine ? " locked" : "")}
              onClick={() => mine && setSelectedId(d.id)}
            >
              <span className={"statusDot " + (st.ok ? "ok" : "bad")} />
              <div className="dt-card-main">
                <div className="dt-card-addr">
                  {d.address}
                  {d.needsAttention && <span className="jt-tag" style={{ background: "var(--late)" }}>FLAGGED</span>}
                  {d.completed && <span className="badge active">Completed</span>}
                </div>
                <div className="dt-card-sub">
                  {d.customerName || "No customer name"} · {d.assigneeName || "Unassigned"}
                  {d.date ? ` · ${longDate(d.date)}` : " · Not yet scheduled"}
                </div>
              </div>
              <div className={"dt-card-status " + (st.ok ? "ok" : "bad")}>{st.text}</div>
            </div>
          );
        })}
        {!visible.length && (
          <div className="jt-empty">
            <b>No defects match</b>Clear the search or filters to see more.
          </div>
        )}
      </div>

      {showCreate && (
        <>
          <div className="jt-scrim" onMouseDown={() => setShowCreate(false)} />
          <div className="jt-stagemgr" style={{ width: 560 }}>
            <div className="jt-stagemgr-head">
              <h2>Add {kind === "inspection" ? "inspection" : "defect"}</h2>
              <button className="jt-stagemgr-close" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
            <div className="dt-editgrid">
              <label className="field dt-full">
                <span>Address</span>
                <input value={newDefect.address} onChange={(e) => setNewDefect({ ...newDefect, address: e.target.value })} />
              </label>
              <label className="field">
                <span>Customer name</span>
                <input value={newDefect.customerName} onChange={(e) => setNewDefect({ ...newDefect, customerName: e.target.value })} />
              </label>
              <label className="field">
                <span>Customer phone</span>
                <input value={newDefect.customerPhone} onChange={(e) => setNewDefect({ ...newDefect, customerPhone: e.target.value })} />
              </label>
              <label className="field">
                <span>Customer email</span>
                <input value={newDefect.customerEmail} onChange={(e) => setNewDefect({ ...newDefect, customerEmail: e.target.value })} />
              </label>
              <label className="field">
                <span>Assign to</span>
                <select value={newDefect.assigneeAccountId} onChange={(e) => setNewDefect({ ...newDefect, assigneeAccountId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {accounts
                    .filter((a) => !a.state || a.state === state)
                    .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.role ? ` (${a.role})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={newDefect.date} onChange={(e) => setNewDefect({ ...newDefect, date: e.target.value })} />
              </label>
              <label className="field">
                <span>Start time</span>
                <input value={newDefect.timeStart} onChange={(e) => setNewDefect({ ...newDefect, timeStart: e.target.value })} placeholder="e.g. 9:00am" />
              </label>
              <label className="field dt-full">
                <span>Brief / instructions</span>
                <textarea rows={3} value={newDefect.notes} onChange={(e) => setNewDefect({ ...newDefect, notes: e.target.value })} />
              </label>
            </div>
            {createError && <p className="error">{createError}</p>}
            <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={createDefect} disabled={!newDefect.address.trim() || creating}>
              {creating ? "Adding…" : "Add"}
            </button>
          </div>
        </>
      )}

      {selected && (
        <DefectModal
          defect={selected}
          accounts={accounts}
          trade={trade}
          myAccountId={myAccountId}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
          onChanged={onModalChanged}
        />
      )}
    </div>
  );
}
