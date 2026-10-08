import { useEffect, useState } from "react";
import { getApiHeaders, getLoggedInUserId, isTradeAccount } from "../auth";
import { loadCentralProjectJob, missingField } from "../centralProjectJobs";
import { StagePopover, STATUS_LABEL, shortDate, longDate, todayISO } from "./stageShared";
import "./JobTracking.css";
import "./JobDetail.css";

const DOC_CATEGORIES = [
  { key: "plans", label: "Plans" },
  { key: "permits", label: "Permits" },
  { key: "contracts", label: "Contracts" },
  { key: "inspections", label: "Inspections" },
  { key: "invoices", label: "Invoices" },
  { key: "other", label: "Other" },
];

const JOB_INFO_FIELDS = [
  { key: "contractValue", label: "Contract value", placeholder: "$ amount" },
  { key: "targetHandover", label: "Target handover", placeholder: "date" },
  { key: "permitNumber", label: "Permit no.", placeholder: "permit number" },
  { key: "buildingSurveyor", label: "Building surveyor", placeholder: "surveyor" },
  { key: "council", label: "Council", placeholder: "council" },
];

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

/** Commencement + building period (days) — matches the printed Commencement Notice's "Basis" line. */
function practicalCompletionDisplay(c) {
  if (!c?.dateOfCommencement) return "";
  const days = Number(c.buildingPeriodDays) || 140;
  const d = new Date(c.dateOfCommencement + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function buildHighlights(stages) {
  const cards = [];
  const inProg = stages.filter((s) => s.status === "prog");
  for (const s of inProg.slice(0, 2)) {
    let sub = "";
    if (s.dueDate) {
      const diff = daysBetween(todayISO(), s.dueDate);
      sub = diff < 0 ? `${-diff} day${-diff === 1 ? "" : "s"} past expected completion` : diff === 0 ? "Due today" : `${diff} day${diff === 1 ? "" : "s"} to go`;
    }
    cards.push({
      key: s.key,
      kind: s.late ? "late" : "prog",
      eyebrow: `IN PROGRESS · STAGE ${s.order}`,
      title: s.label,
      meta: `Started ${s.startDate ? longDate(s.startDate) : "—"}${s.dueDate ? " · Expected " + longDate(s.dueDate) : ""}`,
      sub,
    });
  }
  if (cards.length < 3) {
    const sched = stages.filter((s) => s.status === "sched");
    const take = sched.slice(0, Math.min(2, 3 - cards.length));
    if (take.length) {
      cards.push({
        key: "upnext-" + take.map((s) => s.key).join("-"),
        kind: "upnext",
        eyebrow: `UP NEXT · STAGE${take.length > 1 ? "S" : ""} ${take.map((s) => s.order).join("–")}`,
        title: take.map((s) => s.label).join(", "),
        meta: take.length > 1 ? `Starts ${take.map((s) => longDate(s.startDate)).join(" and ")}` : `Starts ${longDate(take[0].startDate)}`,
        sub: "Start date set, not started",
      });
    } else {
      const next = stages.find((s) => s.status === "not_started");
      if (next) {
        cards.push({
          key: "upnext-" + next.key,
          kind: "upnext",
          eyebrow: `UP NEXT · STAGE ${next.order}`,
          title: next.label,
          meta: "",
          sub: "Not started yet",
        });
      }
    }
  }
  return cards;
}

export default function JobDetail({ jobId, writablePages = [], onBack, onOpenSiting }) {
  const trade = isTradeAccount();
  const myAccountId = Number(getLoggedInUserId());
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [popover, setPopover] = useState(null); // { stageKey, rect }
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [commencementForm, setCommencementForm] = useState({});
  const [emailingCommencement, setEmailingCommencement] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docFilter, setDocFilter] = useState("all");
  const [newDoc, setNewDoc] = useState({ title: "", url: "", category: "plans", stageKey: "" });
  const [addingDoc, setAddingDoc] = useState(false);
  const [docError, setDocError] = useState("");

  useEffect(() => {
    load();
    fetch("/api/sgfhub/accounts", { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setAccounts(Array.isArray(data) ? data.filter((a) => a.active) : []))
      .catch(() => setAccounts([]));
    fetch(`/api/projects/${jobId}/notes`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]));
    fetch(`/api/projects/${jobId}/documents`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => setDocuments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function load() {
    setLoading(true);
    setError("");
    fetch(`/api/construction-tracking/${jobId}`, { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        setJob(data);
        setInfoForm(data.jobInfo || {});
        setCommencementForm(data.commencement || {});
      })
      .catch(() =>
        loadCentralProjectJob(jobId)
          .then((data) => {
            setJob(data);
            setInfoForm(data.jobInfo || {});
            setCommencementForm(data.commencement || {});
            setError("");
          })
          .catch(() => setError("Could not load this job"))
      )
      .finally(() => setLoading(false));
  }

  async function saveStage(stageKey, status, dates, assigneeAccountId) {
    setJob((prev) => {
      if (!prev) return prev;
      const newAccountId = assigneeAccountId === undefined ? undefined : assigneeAccountId === "" ? null : Number(assigneeAccountId);
      const newAccountName = newAccountId == null ? null : accounts.find((a) => a.id === newAccountId)?.name || null;
      return {
        ...prev,
        stages: prev.stages.map((s) =>
          s.key === stageKey
            ? {
                ...s,
                status,
                startDate: dates.startDate || null,
                dueDate: dates.dueDate || null,
                doneDate: dates.doneDate || null,
                assigneeAccountId: newAccountId === undefined ? s.assigneeAccountId : newAccountId,
                assigneeName: newAccountId === undefined ? s.assigneeName : newAccountName,
                late: status === "prog" && !!dates.dueDate && dates.dueDate < todayISO(),
              }
            : s
        ),
      };
    });
    try {
      await fetch(`/api/projects/${jobId}/construction-stages/${stageKey}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ status, ...dates, assigneeAccountId }),
      });
    } catch {
      load();
    }
  }

  function closePopover() {
    setPopover(null);
    load();
  }

  async function toggleHold() {
    const onHold = !job.onHold;
    setJob((prev) => ({ ...prev, onHold }));
    try {
      await fetch(`/api/projects/${jobId}/hold`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ onHold }),
      });
    } catch {
      load();
    }
  }

  async function saveJobInfo() {
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/projects/${jobId}/job-info`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify(infoForm),
      });
      if (res.ok) {
        const jobInfo = await res.json();
        setJob((prev) => ({ ...prev, jobInfo }));
        setEditingInfo(false);
      }
    } finally {
      setSavingInfo(false);
    }
  }

  async function saveCommencementField(field, value) {
    const patch = { [field]: value };
    setJob((prev) => ({ ...prev, commencement: { ...prev.commencement, ...patch } }));
    try {
      const res = await fetch(`/api/projects/${jobId}/commencement`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const commencement = await res.json();
        setJob((prev) => ({ ...prev, commencement }));
        setCommencementForm(commencement);
      }
    } catch {
      load();
    }
  }

  async function downloadCommencementNotice() {
    try {
      const res = await fetch(`/api/projects/${jobId}/commencement-notice.pdf`, { headers: getApiHeaders() });
      if (!res.ok) throw new Error(`Couldn't generate the Commencement Notice (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Commencement-Notice-${(job.address || "job").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      alert(e.message);
    }
  }

  async function emailCommencementToClient() {
    if (!window.confirm(`Email the Commencement Notice to ${job.clientEmail || "the client"}?`)) return;
    setEmailingCommencement(true);
    try {
      const res = await fetch(`/api/projects/${jobId}/commencement/email-client`, {
        method: "POST",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to email the client");
      setJob((prev) => ({ ...prev, commencement: data.commencement }));
      setCommencementForm(data.commencement);
      alert(`Emailed to ${data.emailedTo.join(", ")}.`);
    } catch (e) {
      alert(e.message);
    } finally {
      setEmailingCommencement(false);
    }
  }

  async function saveNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/projects/${jobId}/notes`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ body: newNote.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes((prev) => [note, ...prev]);
        setNewNote("");
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function addDocument() {
    if (!newDoc.title.trim() || !newDoc.url.trim()) return;
    setAddingDoc(true);
    setDocError("");
    try {
      const res = await fetch(`/api/projects/${jobId}/documents`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ ...newDoc, stageKey: newDoc.stageKey || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDocError(data.error || "Failed to add link");
        return;
      }
      setDocuments((prev) => [data, ...prev]);
      setNewDoc({ title: "", url: "", category: "plans", stageKey: "" });
    } catch {
      setDocError("Failed to add link");
    } finally {
      setAddingDoc(false);
    }
  }

  async function removeDocument(docId) {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    try {
      await fetch(`/api/projects/${jobId}/documents/${docId}`, { method: "DELETE", headers: getApiHeaders() });
    } catch {
      /* list already updated optimistically; a stale entry will clear on next visit */
    }
  }

  if (loading) return <div className="jt jd">Loading job…</div>;
  if (error || !job)
    return (
      <div className="jt jd">
        <div className="jt-empty">{error || "Job not found"}</div>
      </div>
    );

  const canWrite = job.state ? writablePages.includes(`${job.state.toLowerCase()}_job_tracking`) : false;
  const commencementComplete =
    !!commencementForm.contractDate && !!commencementForm.dateOfCommencement && !!commencementForm.buildingPeriodDays && !!job.clientEmail;
  const lateCount = job.stages.filter((s) => s.late).length;
  const doneCount = job.stages.filter((s) => s.status === "done").length;
  const highlights = buildHighlights(job.stages);
  const popStage = popover && job.stages.find((s) => s.key === popover.stageKey);

  const docCounts = {};
  for (const d of documents) docCounts[d.category] = (docCounts[d.category] || 0) + 1;
  const visibleDocs = docFilter === "all" ? documents : documents.filter((d) => d.category === docFilter);
  const docsByStage = {};
  for (const d of documents) {
    if (d.stageKey) docsByStage[d.stageKey] = (docsByStage[d.stageKey] || 0) + 1;
  }

  return (
    <div className="jt jd">
      <div className="jd-breadcrumb">
        <button onClick={onBack}>← All jobs</button>
        <span>/ Job Stage Chart</span>
      </div>

      <header className="jd-header">
        <div>
          <h1>{job.address}</h1>
          <div className="jd-badges">
            {(job.pmName || job.gaps) && (
              <span className="jt-tag jd-badge-pm">PM: {job.gaps ? missingField("Project manager") : job.pmName}</span>
            )}
            {lateCount > 0 && (
              <span className="jt-tag" style={{ background: "var(--late)" }}>
                {lateCount} stage{lateCount === 1 ? "" : "s"} past expected completion
              </span>
            )}
            {job.onHold && <span className="jt-tag">ON HOLD</span>}
            <span className="jd-updated">Updated {job.updatedAt ? longDate(String(job.updatedAt).slice(0, 10)) : "—"}</span>
          </div>
        </div>
        <div className="jd-header-right">
          <div className="jd-percent">
            <div className="jd-percent-num">{job.gaps ? missingField("Progress") : `${job.stagePercent}%`}</div>
            <div className="jd-percent-sub">
              {job.gaps ? missingField("Stage") : `${doneCount} of ${job.stages.length} stages done`}
            </div>
          </div>
          {!trade && (
            <div className="jd-actions">
              <button className="jt-managestages-btn" disabled={!canWrite} onClick={toggleHold}>
                {job.onHold ? "Resume job" : "Put on hold"}
              </button>
              <button className="jt-managestages-btn" onClick={() => onOpenSiting(jobId)}>
                {job.gaps ? missingField("Siting") : `Siting${job.sitingCompleted ? " ✓" : ""}`}
              </button>
              <button className="btn-primary jd-edit-btn" disabled={!canWrite} onClick={() => setEditingInfo((v) => !v)}>
                Edit job
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="jd-stagebar-panel">
        <div className="jd-stagebar-head">
          <h2>{job.gaps ? missingField("Stage") : "Build stages"}</h2>
          <div className="jt-legend">
            <span>
              <i style={{ background: "var(--done)" }} />
              Done
            </span>
            <span>
              <i style={{ background: "var(--prog)" }} />
              In progress
            </span>
            <span>
              <i style={{ background: "var(--sched)" }} />
              Start date set
            </span>
            <span>
              <i style={{ background: "var(--empty)", border: "1px solid var(--line)" }} />
              Not started
            </span>
          </div>
        </div>
        <div className="jd-stagebar">
          {job.stages.map((s) => {
            const editable = canWrite && (!trade || s.assigneeAccountId === myAccountId);
            return (
              <div
                key={s.key}
                className={"jd-stagebar-cell " + s.status + (!editable ? " locked" : "")}
                title={`${s.order}. ${s.label} — ${STATUS_LABEL[s.status]}${editable ? "" : " (read only)"}`}
                onClick={(e) => editable && setPopover({ stageKey: s.key, rect: e.currentTarget.getBoundingClientRect() })}
              />
            );
          })}
        </div>
        <div className="jd-stagebar-nums">
          {job.stages.map((s) => (
            <span key={s.key}>{s.order}</span>
          ))}
        </div>
      </div>

      {highlights.length > 0 && (
        <div className="jd-highlights">
          {highlights.map((c) => (
            <div key={c.key} className={"jd-card jd-card--" + c.kind}>
              <div className="jd-card-eyebrow">{c.eyebrow}</div>
              <div className="jd-card-title">{c.title}</div>
              <div className="jd-card-meta">{c.meta}</div>
              {c.sub && <div className={"jd-card-sub" + (c.kind === "late" ? " late" : "")}>{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="jd-body">
        <div className="jd-main">
          <div className="jd-panel">
            <div className="jd-panel-head">
              <h2>Stage detail</h2>
              <span className="muted">Click a row to change its status, dates or crew</span>
            </div>
            <div className="jd-table-wrap">
              <table className="jd-stage-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stage</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>Due / Done</th>
                    <th>Crew</th>
                    <th>Docs</th>
                  </tr>
                </thead>
                <tbody>
                  {job.stages.map((s) => {
                    const editable = canWrite && (!trade || s.assigneeAccountId === myAccountId);
                    return (
                      <tr
                        key={s.key}
                        className={s.status + (s.late ? " late" : "") + (!editable ? " locked" : "")}
                        onClick={(e) => editable && setPopover({ stageKey: s.key, rect: e.currentTarget.getBoundingClientRect() })}
                      >
                        <td>{s.order}</td>
                        <td>{s.label}</td>
                        <td>
                          <span className={"badge-status badge-status--" + s.status}>
                            {STATUS_LABEL[s.status]}
                            {s.late ? " · late" : ""}
                          </span>
                        </td>
                        <td>{s.startDate ? longDate(s.startDate) : "—"}</td>
                        <td>{s.doneDate ? longDate(s.doneDate) : s.dueDate ? longDate(s.dueDate) : "—"}</td>
                        <td>{s.assigneeName || "—"}</td>
                        <td>{docsByStage[s.key] ? `📄 ${docsByStage[s.key]}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="jd-panel">
            <div className="jd-panel-head">
              <h2>Documents</h2>
              <span className="muted">{documents.length} files and links</span>
            </div>
            {!trade && canWrite && (
              <div className="jd-doc-add">
                <label className="field">
                  <span>Title</span>
                  <input value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="e.g. Signed building contract.pdf" />
                </label>
                <label className="field">
                  <span>Link (PDF or folder)</span>
                  <input value={newDoc.url} onChange={(e) => setNewDoc({ ...newDoc, url: e.target.value })} placeholder="https://" />
                </label>
                <label className="field">
                  <span>Category</span>
                  <select value={newDoc.category} onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}>
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Link to stage</span>
                  <select value={newDoc.stageKey} onChange={(e) => setNewDoc({ ...newDoc, stageKey: e.target.value })}>
                    <option value="">Whole job</option>
                    {job.stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.order}. {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={addDocument} disabled={!newDoc.title.trim() || !newDoc.url.trim() || addingDoc}>
                  {addingDoc ? "Adding…" : "Add link"}
                </button>
              </div>
            )}
            {docError && <p className="error">{docError}</p>}

            <div className="jd-doc-pills">
              <button className={docFilter === "all" ? "on" : ""} onClick={() => setDocFilter("all")}>
                All {documents.length}
              </button>
              {DOC_CATEGORIES.filter((c) => docCounts[c.key]).map((c) => (
                <button key={c.key} className={docFilter === c.key ? "on" : ""} onClick={() => setDocFilter(c.key)}>
                  {c.label} {docCounts[c.key]}
                </button>
              ))}
            </div>

            <table className="jd-doc-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Stage</th>
                  <th>Added</th>
                  {!trade && canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                      <div className="muted jd-doc-sub">added by {d.addedByName || "Office"}</div>
                    </td>
                    <td>{DOC_CATEGORIES.find((c) => c.key === d.category)?.label || d.category}</td>
                    <td>{d.stageLabel ? `${d.stageLabel}` : "Whole job"}</td>
                    <td>{d.createdAt ? longDate(String(d.createdAt).slice(0, 10)) : "—"}</td>
                    {!trade && canWrite && (
                      <td>
                        <button className="btn-link" onClick={() => removeDocument(d.id)}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!visibleDocs.length && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No documents yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="jd-side">
          <div className="jd-panel">
            <div className="jd-panel-head">
              <h2>Job information</h2>
              {!trade && canWrite && (
                <button className="btn-link" onClick={() => setEditingInfo((v) => !v)}>
                  {editingInfo ? "Cancel" : "Edit"}
                </button>
              )}
            </div>
            <div className="jd-info-grid">
              <div>
                <div className="jd-info-label">Client</div>
                <div>{job.clientName || "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Phone</div>
                <div>{job.clientPhone || "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Email</div>
                <div>{job.clientEmail || "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Site address</div>
                <div>
                  {job.address}
                  {job.state ? ` ${job.state}` : ""}
                </div>
              </div>
              <div>
                <div className="jd-info-label">Build type</div>
                <div>{job.jobType || "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Contract signed</div>
                <div>{job.contractSignedDate ? longDate(job.contractSignedDate) : "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Project manager</div>
                <div>{job.gaps ? missingField("Project manager") : job.pmName || "—"}</div>
              </div>
              {JOB_INFO_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="jd-info-label">{f.label}</div>
                  {editingInfo ? (
                    <input
                      value={infoForm[f.key] || ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setInfoForm({ ...infoForm, [f.key]: e.target.value })}
                    />
                  ) : (
                    <div>{job.jobInfo?.[f.key] || "—"}</div>
                  )}
                </div>
              ))}
            </div>
            {editingInfo && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={saveJobInfo} disabled={savingInfo}>
                {savingInfo ? "Saving…" : "Save job information"}
              </button>
            )}
          </div>

          <div className="jd-panel">
            <h2>Commencement details</h2>
            <p className="muted" style={{ margin: "4px 0 12px", fontSize: 12 }}>
              Fills the Commencement Notice (Clause 17.2). Site address and owner name(s) are taken from the job automatically.
            </p>
            <div className="jd-info-grid">
              <div>
                <div className="jd-info-label">Contract date</div>
                {!trade && canWrite ? (
                  <input
                    type="date"
                    value={commencementForm.contractDate || ""}
                    onChange={(e) => setCommencementForm((p) => ({ ...p, contractDate: e.target.value }))}
                    onBlur={(e) => saveCommencementField("contractDate", e.target.value)}
                  />
                ) : (
                  <div>
                    {job.gaps ? missingField("Contract date") : commencementForm.contractDate ? longDate(commencementForm.contractDate) : "—"}
                  </div>
                )}
              </div>
              <div>
                <div className="jd-info-label">Owner name(s)</div>
                <div>{job.clientName || "—"}</div>
              </div>
              <div>
                <div className="jd-info-label">Date of commencement</div>
                {!trade && canWrite ? (
                  <input
                    type="date"
                    value={commencementForm.dateOfCommencement || ""}
                    onChange={(e) => setCommencementForm((p) => ({ ...p, dateOfCommencement: e.target.value }))}
                    onBlur={(e) => saveCommencementField("dateOfCommencement", e.target.value)}
                  />
                ) : (
                  <div>
                    {job.gaps
                      ? missingField("Date of commencement")
                      : commencementForm.dateOfCommencement
                        ? longDate(commencementForm.dateOfCommencement)
                        : "—"}
                  </div>
                )}
              </div>
              <div>
                <div className="jd-info-label">Building period (days)</div>
                {!trade && canWrite ? (
                  <input
                    type="number"
                    min="1"
                    value={commencementForm.buildingPeriodDays || 140}
                    onChange={(e) => setCommencementForm((p) => ({ ...p, buildingPeriodDays: e.target.value }))}
                    onBlur={(e) => saveCommencementField("buildingPeriodDays", Number(e.target.value) || 140)}
                  />
                ) : (
                  <div>{job.gaps ? missingField("Building period") : commencementForm.buildingPeriodDays || 140}</div>
                )}
              </div>
              <div>
                <div className="jd-info-label">Date for Practical Completion</div>
                <div>{job.gaps ? missingField("Practical completion") : practicalCompletionDisplay(commencementForm) || "—"}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn-link" onClick={downloadCommencementNotice}>
                Download Commencement Notice (PDF)
              </button>
              {!trade && canWrite && (
                <button
                  className="btn-primary"
                  style={{ width: "auto", padding: "8px 16px" }}
                  onClick={emailCommencementToClient}
                  disabled={!commencementComplete || emailingCommencement}
                  title={
                    commencementComplete
                      ? undefined
                      : "Fill in the contract date, date of commencement and building period, and make sure the client has an email on file."
                  }
                >
                  {emailingCommencement ? "Sending…" : "Email to client"}
                </button>
              )}
            </div>
            {commencementForm.emailedAt && (
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Last emailed to {commencementForm.emailedTo} on {new Date(commencementForm.emailedAt).toLocaleString()}.
              </p>
            )}
          </div>

          <div className="jd-panel">
            <h2>Notes</h2>
            {!trade && canWrite && (
              <div className="jd-note-add">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Site access, client requests, delays…"
                  rows={3}
                />
                <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={saveNote} disabled={!newNote.trim() || savingNote}>
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </div>
            )}
            <div className="jd-notes-list">
              {notes.map((n) => (
                <div key={n.id} className="jd-note">
                  <div className="jd-note-meta">
                    {n.createdAt ? longDate(String(n.createdAt).slice(0, 10)) : ""} · {n.authorName}
                  </div>
                  <div className="jd-note-body">{n.body}</div>
                </div>
              ))}
              {!notes.length && <p className="muted">No notes yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {popover && popStage && (
        <>
          <div className="jt-scrim" onMouseDown={closePopover} />
          <StagePopover
            job={job}
            stage={popStage}
            anchorRect={popover.rect}
            accounts={accounts}
            canReassign={!trade}
            onClose={closePopover}
            onSave={(status, dates, assigneeAccountId) => saveStage(popStage.key, status, dates, assigneeAccountId)}
          />
        </>
      )}
    </div>
  );
}
