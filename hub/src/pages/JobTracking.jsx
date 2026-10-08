import { useEffect, useMemo, useState } from "react";
import { getApiHeaders, getLoggedInUserId, isTradeAccount } from "../auth";
import { loadCentralProjectJobs, missingField, roofTypeLabel, specsFromRoofType } from "../centralProjectJobs";
import StageManager from "./StageManager";
import { StagePopover, STATUS_LABEL, shortDate, longDate, todayISO } from "./stageShared";
import "./JobTracking.css";

const PM_COLOURS = ["#7FB069", "#E8C547", "#6FA8DC", "#C98BB9", "#E39B5A", "#8C9FA8", "#4FB3A9", "#B57F5E"];

/** Stable colour per PM name, independent of filtering — based on the full roster, not the visible list. */
function makePmColourMap(allJobs) {
  const names = [...new Set(allJobs.map((j) => j.pmName).filter(Boolean))].sort();
  const map = new Map(names.map((n, i) => [n, PM_COLOURS[i % PM_COLOURS.length]]));
  return (name) => (name ? map.get(name) || "transparent" : "transparent");
}

function furthestOrder(job) {
  let f = 0;
  for (const s of job.stages) {
    if (s.status === "done" || s.status === "prog") f = s.order;
  }
  return f;
}
function progStages(job) {
  return job.stages.filter((s) => s.status === "prog");
}
function nextDue(job) {
  const dates = progStages(job)
    .map((s) => s.dueDate)
    .filter(Boolean)
    .sort();
  return dates[0] || "9999-99-99";
}
function jobSummary(job) {
  if (job.complete) return "Complete";
  const prog = progStages(job);
  if (prog.length) return prog.map((s) => s.label).join(", ");
  const sched = job.stages.find((s) => s.status === "sched");
  if (sched) return `${sched.label} starts ${shortDate(sched.startDate)}`;
  return "Not started";
}

function matchesStatusFilter(job, filter) {
  if (filter === "archived") return job.archived;
  if (job.archived) return false; // archived jobs sit in their own tab, out of every other view
  switch (filter) {
    case "active":
      return !job.complete;
    case "late":
      return job.late;
    case "hold":
      return job.onHold;
    case "notstarted":
      return job.notStarted;
    case "complete":
      return job.complete;
    default:
      return true;
  }
}

const SORTERS = {
  stageDesc: (a, b) => b.stagePercent - a.stagePercent || furthestOrder(b) - furthestOrder(a) || a.address.localeCompare(b.address),
  stageAsc: (a, b) => a.stagePercent - b.stagePercent || furthestOrder(a) - furthestOrder(b) || a.address.localeCompare(b.address),
  due: (a, b) => nextDue(a).localeCompare(nextDue(b)) || a.address.localeCompare(b.address),
  addr: (a, b) => a.address.localeCompare(b.address),
  updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
};

export default function JobTracking({ region, canManageStages, canWrite = true, onOpenJob, onOpenSiting }) {
  const trade = isTradeAccount();
  const myAccountId = Number(getLoggedInUserId());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [pmFilter, setPmFilter] = useState("");
  const [sortMode, setSortMode] = useState("stageDesc");
  const [stageFilter, setStageFilter] = useState(null);
  const [popover, setPopover] = useState(null); // { jobId, stageKey, rect }
  const [showStageManager, setShowStageManager] = useState(false);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!trade) {
      fetch("/api/users/names")
        .then((r) => r.json())
        .then(setUsers)
        .catch(() => setUsers([]));
      fetch("/api/sgfhub/accounts", { headers: getApiHeaders() })
        .then((r) => r.json())
        .then((data) => setAccounts(Array.isArray(data) ? data.filter((a) => a.active) : []))
        .catch(() => setAccounts([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Both the VIC and QLD pages render this same component at the same
    // spot in the tree, so React reuses the instance instead of remounting
    // it — this has to re-run whenever `region` changes or it'll keep
    // showing the previous page's jobs under the new page's heading.
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const url = region ? `/api/construction-tracking?state=${encodeURIComponent(region)}` : "/api/construction-tracking";
      const res = await fetch(url, { headers: getApiHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (!Array.isArray(data.jobs)) throw new Error("Failed to load");
      setJobs(data.jobs);
    } catch {
      try {
        setJobs(await loadCentralProjectJobs(region));
      } catch {
        setError("Could not load job tracking data");
      }
    } finally {
      setLoading(false);
    }
  }

  const stageDefs = jobs[0]?.stages.map(({ key, label, order, allowNA }) => ({ key, label, order, allowNA })) || [];
  const pmColour = useMemo(() => makePmColourMap(jobs), [jobs]);
  const pmNames = useMemo(() => [...new Set(jobs.map((j) => j.pmName).filter(Boolean))].sort(), [jobs]);

  const baseList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        matchesStatusFilter(j, statusFilter) &&
        (!pmFilter || j.pmName === pmFilter) &&
        (!q || `${j.address} ${j.clientName} ${j.jobType}`.toLowerCase().includes(q))
    );
  }, [jobs, query, statusFilter, pmFilter]);

  const visibleList = useMemo(() => {
    let list = stageFilter
      ? baseList.filter((j) => {
          const s = j.stages.find((x) => x.key === stageFilter);
          return s && (s.status === "prog" || s.status === "sched");
        })
      : baseList;
    return list.slice().sort(SORTERS[sortMode]);
  }, [baseList, stageFilter, sortMode]);

  const stageCounts = useMemo(() => {
    const counts = {};
    for (const def of stageDefs) counts[def.key] = { prog: 0, sched: 0 };
    for (const j of baseList) {
      for (const s of j.stages) {
        if (s.status === "prog") counts[s.key].prog++;
        else if (s.status === "sched") counts[s.key].sched++;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseList, jobs]);
  const maxStageCount = Math.max(1, ...Object.values(stageCounts).map((c) => c.prog + c.sched));

  const activeJobs = useMemo(() => jobs.filter((j) => !j.archived), [jobs]);
  const totals = {
    all: activeJobs.length,
    prog: activeJobs.filter((j) => progStages(j).length && !j.onHold).length,
    late: activeJobs.filter((j) => j.late).length,
    hold: activeJobs.filter((j) => j.onHold).length,
    notStarted: activeJobs.filter((j) => j.notStarted).length,
    complete: activeJobs.filter((j) => j.complete).length,
    archived: jobs.filter((j) => j.archived).length,
  };

  async function savePm(jobId, pmUserId) {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const u = users.find((u) => u.id === Number(pmUserId));
        return { ...j, pmUserId: pmUserId ? Number(pmUserId) : null, pmName: u ? u.name : "" };
      })
    );
    try {
      await fetch(`/api/projects/${jobId}/pm`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ pmUserId: pmUserId || null }),
      });
    } catch {
      load();
    }
  }

  async function archiveJob(jobId, archived) {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, archived } : j)));
    try {
      await fetch(`/api/projects/${jobId}/archive`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ archived }),
      });
    } catch {
      load();
    }
  }

  async function saveRoofType(jobId, roofType) {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, roofType } : j)));
    try {
      const res = await fetch(`/api/projects/${jobId}/specs`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ specs: specsFromRoofType(roofType) }),
      });
      if (!res.ok) throw new Error("Failed to save specs");
    } catch {
      load();
    }
  }

  async function saveStage(jobId, stageKey, status, dates, assigneeAccountId) {
    const newAccountId =
      assigneeAccountId === undefined ? undefined : assigneeAccountId === "" ? null : Number(assigneeAccountId);
    const newAccountName =
      newAccountId == null ? null : accounts.find((a) => a.id === newAccountId)?.name || null;
    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const stages = j.stages.map((s) =>
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
        );
        return { ...j, stages };
      })
    );
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

  useEffect(() => {
    if (!popover) return undefined;
    function onKey(e) {
      if (e.key === "Escape") closePopover();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  if (loading) return <div className="jt">Loading job tracking…</div>;
  if (error)
    return (
      <div className="jt">
        <div className="jt-empty">{error}</div>
      </div>
    );

  const popJob = popover && jobs.find((j) => j.id === popover.jobId);
  const popStage = popJob && popJob.stages.find((s) => s.key === popover.stageKey);

  return (
    <div className="jt">
      <header className="jt-top">
        <div>
          <h1>{region ? `${region} Job Tracking` : "Job Tracking"}</h1>
          <div className="sub">
            {jobs[0]?.gaps ? missingField("Stage") : `${stageDefs.length} stages`} · showing {visibleList.length} of{" "}
            {statusFilter === "archived" ? totals.archived : totals.all} jobs
          </div>
        </div>
        <div className="jt-counts">
          <span>
            <b>{totals.all}</b>jobs
          </span>
          <span className="c-prog">
            <b>{jobs[0]?.gaps ? missingField("Stage status") : totals.prog}</b>in progress
          </span>
          <span className="c-late">
            <b>{jobs[0]?.gaps ? missingField("Stage status") : totals.late}</b>running late
          </span>
          <span className="c-late">
            <b>{totals.hold}</b>on hold
          </span>
          <span>
            <b>{jobs[0]?.gaps ? missingField("Stage status") : totals.notStarted}</b>not started
          </span>
          <span className="c-done">
            <b>{jobs[0]?.gaps ? missingField("Stage status") : totals.complete}</b>complete
          </span>
          {!trade && totals.archived > 0 && (
            <span
              className="jt-archived-count"
              onClick={() => setStatusFilter(statusFilter === "archived" ? "active" : "archived")}
            >
              <b>{totals.archived}</b>archived
            </span>
          )}
        </div>
      </header>

      <div className="jt-toolbar">
        <input
          type="search"
          placeholder="Search address, client or type"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search jobs"
        />
        {!trade && (
          <select value={pmFilter} onChange={(e) => setPmFilter(e.target.value)} aria-label="Filter by project manager">
            <option value="">All PMs</option>
            {pmNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="active">Active jobs</option>
          <option value="all">All jobs</option>
          <option value="late">Running late</option>
          <option value="hold">On hold</option>
          <option value="notstarted">Not started</option>
          <option value="complete">Complete</option>
          {!trade && <option value="archived">Archived</option>}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} aria-label="Sort jobs">
          <option value="stageDesc">Furthest along first</option>
          <option value="stageAsc">Earliest stage first</option>
          <option value="due">Next expected completion</option>
          <option value="addr">Address A–Z</option>
          <option value="updated">Recently updated</option>
        </select>
        {canManageStages && (
          <button className="jt-managestages-btn" onClick={() => setShowStageManager(true)}>
            Manage stages
          </button>
        )}
        {stageFilter && (
          <span className="jt-tag" style={{ background: "#1e2a32", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Stage: {stageDefs.find((s) => s.key === stageFilter)?.label}
            <button
              onClick={() => setStageFilter(null)}
              style={{ background: "none", border: 0, color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              ×
            </button>
          </span>
        )}
        <span className="jt-spacer" />
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
            <i style={{ background: "var(--na)" }} />
            Not applicable
          </span>
          <span>
            <i style={{ background: "var(--late)", height: 4, verticalAlign: 1 }} />
            Past expected completion
          </span>
        </div>
      </div>

      <div className="jt-wrap">
        <table className="jt-table">
          <thead>
            <tr>
              <th className="jobh">
                Job
                <span className="hint">
                  Click any square to set its status and dates. Squares show: orange = expected completion, yellow =
                  start date.
                </span>
              </th>
              {stageDefs.map((s) => {
                const c = stageCounts[s.key] || { prog: 0, sched: 0 };
                return (
                  <th
                    key={s.key}
                    className={"st" + (stageFilter === s.key ? " sel" : "")}
                    onClick={() => setStageFilter(stageFilter === s.key ? null : s.key)}
                    title={`${s.label} — ${c.prog} in progress, ${c.sched} with a start date. Click to filter.`}
                  >
                    <span className="jt-st-cnt">{c.prog + c.sched || ""}</span>
                    <div className="jt-bartrack">
                      <div className="jt-bar s" style={{ height: Math.round((c.sched / maxStageCount) * 44) + "px" }} />
                      <div className="jt-bar p" style={{ height: Math.round((c.prog / maxStageCount) * 44) + "px" }} />
                    </div>
                    <span className="jt-st-num">{s.order}</span>
                    <div className="jt-st-name">{s.label}</div>
                  </th>
                );
              })}
              <th className="pc">Progress</th>
            </tr>
          </thead>
          <tbody>
            {visibleList.map((job) => (
              <tr key={job.id} className={[job.complete && "complete", job.archived && "archived"].filter(Boolean).join(" ")}>
                <td className="job" style={{ "--jtc": pmColour(job.pmName) }}>
                  <div className="jt-jr">
                    <span
                      className="jt-addr jt-addr--link"
                      title={`${job.address}${job.clientName ? " — " + job.clientName : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenJob(job.id);
                      }}
                    >
                      {job.address}
                    </span>
                    <button
                      className={"jt-siting-btn" + (job.sitingCompleted ? " jt-siting-btn--done" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSiting(job.id);
                      }}
                      title="Siting"
                    >
                      {job.gaps ? missingField("Siting") : `Siting${job.sitingCompleted ? " ✓" : ""}`}
                    </button>
                    {trade ? (
                      <span
                        className={
                          "jt-roof-tag" +
                          (job.roofType === "panel" || job.roofType === "truss" ? " jt-roof-tag--" + job.roofType : "")
                        }
                      >
                        {roofTypeLabel(job.roofType)}
                      </span>
                    ) : (
                      <select
                        className={
                          "jt-roof-select jt-roof-select--" +
                          (job.roofType === "panel" || job.roofType === "truss" ? job.roofType : "undefined")
                        }
                        value={job.roofType === "panel" || job.roofType === "truss" ? job.roofType : "undefined"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          saveRoofType(job.id, e.target.value);
                        }}
                        title="Roof type"
                      >
                        <option value="truss">Truss</option>
                        <option value="panel">Panel</option>
                        <option value="undefined">undefined</option>
                      </select>
                    )}
                    {job.onHold && <span className="jt-tag">HOLD</span>}
                    {job.late && (
                      <span className="jt-tag" style={{ background: "var(--late)" }} title="Past expected completion">
                        LATE
                      </span>
                    )}
                    {job.archived && <span className="jt-tag jt-tag--archived">ARCHIVED</span>}
                    {!trade && (
                      <select
                        className="jt-pm-select"
                        value={job.pmUserId || ""}
                        disabled={!canWrite}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => savePm(job.id, e.target.value)}
                        title="Project manager"
                      >
                        <option value="">{job.gaps ? missingField("Project manager") : "— PM —"}</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {!trade && job.archived && (
                      <button
                        className="jt-archive-btn"
                        disabled={!canWrite}
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveJob(job.id, false);
                        }}
                        title={canWrite ? "Move this job back into the active lists" : "Read-only access"}
                      >
                        Restore
                      </button>
                    )}
                    {!trade && !job.archived && job.complete && (
                      <button
                        className="jt-archive-btn"
                        disabled={!canWrite}
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveJob(job.id, true);
                        }}
                        title={canWrite ? "Archive this completed job" : "Read-only access"}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
                {job.stages.map((s) => {
                  let cls = "cell";
                  let txt = "";
                  if (s.status === "done") cls += " done";
                  else if (s.status === "prog") {
                    cls += " prog";
                    if (s.late) cls += " late";
                    txt = shortDate(s.dueDate);
                  } else if (s.status === "sched") {
                    cls += " sched";
                    txt = shortDate(s.startDate);
                  } else if (s.status === "na") cls += " na";
                  const editable = canWrite && (!trade || s.assigneeAccountId === myAccountId);
                  if (!editable) cls += " locked";
                  const tip =
                    s.label +
                    " — " +
                    STATUS_LABEL[s.status] +
                    (s.status === "prog" ? (s.dueDate ? `, expected ${longDate(s.dueDate)}` : ", no expected date yet") : "") +
                    (s.status === "sched" ? `, starts ${longDate(s.startDate)}` : "") +
                    (s.status === "done" && s.doneDate ? `, done ${longDate(s.doneDate)}` : "") +
                    (s.assigneeName ? ` — ${s.assigneeName}` : "") +
                    (editable ? "" : " (read only)");
                  return (
                    <td
                      key={s.key}
                      className={cls}
                      title={tip}
                      onClick={(e) =>
                        editable &&
                        setPopover({ jobId: job.id, stageKey: s.key, rect: e.currentTarget.getBoundingClientRect() })
                      }
                    >
                      {txt}
                    </td>
                  );
                })}
                <td className="pct">
                  {job.gaps ? (
                    missingField("Progress")
                  ) : (
                    <>
                      {job.stagePercent}%<small>{jobSummary(job)}</small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleList.length && (
          <div className="jt-empty">
            <b>No jobs match</b>Clear the search or filters to see more.
          </div>
        )}
      </div>

      {popover && popJob && popStage && (
        <>
          <div className="jt-scrim" onMouseDown={closePopover} />
          <StagePopover
            job={popJob}
            stage={popStage}
            anchorRect={popover.rect}
            accounts={accounts}
            canReassign={!trade}
            onClose={closePopover}
            onSave={(status, dates, assigneeAccountId) =>
              saveStage(popJob.id, popStage.key, status, dates, assigneeAccountId)
            }
          />
        </>
      )}

      {showStageManager && (
        <StageManager
          onClose={() => {
            setShowStageManager(false);
            load();
          }}
        />
      )}
    </div>
  );
}
