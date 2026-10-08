import { useEffect, useMemo, useState } from "react";
import { getApiHeaders } from "../auth";
import { jobStages, stagePercent, currentStageIndex, STAGE_NAMES, BushfireStagePopover } from "./bushfireShared";
import "./JobTracking.css";
import "./BushfireVariations.css";
import "./BushfireOrganizer.css";

const ELEC_OPTS = ["", "Power TBC", "Solar"];
const SEPTIC_OPTS = ["", "Permit TBC", "Ready"];

function suburbOf(address) {
  const parts = (address || "").split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : address || "";
}

function currentStageLabel(job) {
  const idx = currentStageIndex(job);
  return idx >= STAGE_NAMES.length ? "All stages complete" : `Stage ${idx + 1}: ${STAGE_NAMES[idx]}`;
}

function matchesStatusFilter(job, filter) {
  if (filter === "archived") return job.status === "archived";
  if (job.status === "archived") return false; // complete units sit in their own filter, out of every other view
  if (filter === "active") return job.status === "active";
  if (filter === "hold") return job.status === "hold";
  return true;
}

const SORTERS = {
  stageDesc: (a, b) => stagePercent(b) - stagePercent(a) || a.address.localeCompare(b.address),
  stageAsc: (a, b) => stagePercent(a) - stagePercent(b) || a.address.localeCompare(b.address),
  addr: (a, b) => a.address.localeCompare(b.address),
  suburb: (a, b) => suburbOf(a.address).localeCompare(suburbOf(b.address)) || a.address.localeCompare(b.address),
};

export default function BushfireOrganizer({ canWrite = true, onOpenUnit }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("stageDesc");
  const [popover, setPopover] = useState(null); // { jobId, stageIdx, rect }
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ address: "", contractCost: "", electricalService: "", septicStatus: "", notes: "" });

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError("");
    fetch("/api/bushfire/jobs", { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setJobs(Array.isArray(data) ? data : []);
      })
      .catch(() => setError("Could not load bushfire units"))
      .finally(() => setLoading(false));
  }

  const baseList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => matchesStatusFilter(j, statusFilter) && (!q || j.address.toLowerCase().includes(q)));
  }, [jobs, query, statusFilter]);

  const visibleList = useMemo(() => baseList.slice().sort(SORTERS[sortMode]), [baseList, sortMode]);

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== "archived"), [jobs]);
  const totals = {
    all: activeJobs.length,
    active: activeJobs.filter((j) => j.status === "active").length,
    hold: activeJobs.filter((j) => j.status === "hold").length,
    archived: jobs.filter((j) => j.status === "archived").length,
  };

  async function saveStage(jobId, stageIdx, patch) {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const stages = jobStages(j).map((s, i) => (i === stageIdx ? { ...s, ...patch } : s));
        return { ...j, stages };
      })
    );
    try {
      const res = await fetch(`/api/bushfire/jobs/${jobId}/stages/${stageIdx}`, {
        method: "PATCH",
        headers: getApiHeaders(),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  function closePopover() {
    setPopover(null);
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

  async function createUnit() {
    if (!newUnit.address.trim()) return;
    const res = await fetch("/api/bushfire/jobs", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ ...newUnit, contractCost: Number(newUnit.contractCost || 0) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setJobs((prev) => [...prev, data]);
      setAddingUnit(false);
      setNewUnit({ address: "", contractCost: "", electricalService: "", septicStatus: "", notes: "" });
    }
  }

  if (loading) return <div className="jt">Loading bushfire units…</div>;
  if (error)
    return (
      <div className="jt">
        <div className="jt-empty">{error}</div>
      </div>
    );

  const popJob = popover && jobs.find((j) => j.id === popover.jobId);

  return (
    <div className="jt">
      <header className="jt-top">
        <div>
          <h1>Bushfire Organizer</h1>
          <div className="sub">
            {STAGE_NAMES.length} stages · showing {visibleList.length} of {statusFilter === "archived" ? totals.archived : totals.all} units
          </div>
        </div>
        <div className="jt-counts">
          <span>
            <b>{totals.all}</b>units
          </span>
          <span className="c-prog">
            <b>{totals.active}</b>active
          </span>
          <span className="c-late">
            <b>{totals.hold}</b>on hold
          </span>
          {totals.archived > 0 && (
            <span className="jt-archived-count" onClick={() => setStatusFilter(statusFilter === "archived" ? "all" : "archived")}>
              <b>{totals.archived}</b>complete
            </span>
          )}
        </div>
      </header>

      <div className="jt-toolbar">
        <input type="search" placeholder="Search address" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search units" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All units</option>
          <option value="active">Active</option>
          <option value="hold">On hold</option>
          <option value="archived">Complete</option>
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} aria-label="Sort units">
          <option value="stageDesc">Furthest along first</option>
          <option value="stageAsc">Earliest stage first</option>
          <option value="addr">Address A–Z</option>
          <option value="suburb">Suburb A–Z</option>
        </select>
        {canWrite && (
          <button className="jt-managestages-btn" onClick={() => setAddingUnit(true)} style={{ marginLeft: "auto" }}>
            + Unit
          </button>
        )}
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

      <div className="jt-wrap">
        <table className="jt-table">
          <thead>
            <tr>
              <th className="jobh">
                Unit
                <span className="hint">Click any square to set its date and mark it complete.</span>
              </th>
              {STAGE_NAMES.map((name, idx) => (
                <th key={idx} className="st">
                  <span className="jt-st-num">{idx + 1}</span>
                  <div className="jt-st-name">{name}</div>
                </th>
              ))}
              <th className="pc">Progress</th>
            </tr>
          </thead>
          <tbody>
            {visibleList.map((job) => {
              const stages = jobStages(job);
              return (
                <tr key={job.id} className={job.status === "archived" ? "complete archived" : ""}>
                  <td className="job">
                    <div className="jt-jr">
                      <span className="jt-addr jt-addr--link" title={job.address} onClick={() => onOpenUnit(job.id)}>
                        {job.address}
                      </span>
                      {job.status === "hold" && <span className="jt-tag">HOLD</span>}
                      {job.status === "archived" && <span className="jt-tag jt-tag--archived">COMPLETE</span>}
                    </div>
                  </td>
                  {stages.map((s, idx) => (
                    <td
                      key={idx}
                      className={"cell" + (s.complete ? " done" : "") + (canWrite ? "" : " locked")}
                      title={`${idx + 1}. ${STAGE_NAMES[idx]} — ${s.complete ? "Done" : "Not done"}${s.estimatedDate ? `, estimated ${s.estimatedDate}` : ""}${canWrite ? "" : " (read only)"}`}
                      onClick={(e) => canWrite && setPopover({ jobId: job.id, stageIdx: idx, rect: e.currentTarget.getBoundingClientRect() })}
                    />
                  ))}
                  <td className="pct">
                    {stagePercent(job)}%<small>{currentStageLabel(job)}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleList.length && (
          <div className="jt-empty">
            <b>No units match</b>Clear the search or filters to see more.
          </div>
        )}
      </div>

      {popover && popJob && (
        <>
          <div className="jt-scrim" onMouseDown={closePopover} />
          <BushfireStagePopover
            job={popJob}
            stageIdx={popover.stageIdx}
            anchorRect={popover.rect}
            onClose={closePopover}
            onSave={(patch) => saveStage(popJob.id, popover.stageIdx, patch)}
          />
        </>
      )}

      {addingUnit && (
        <>
          <div className="jt-scrim" onMouseDown={() => setAddingUnit(false)} />
          <div className="jt-stagemgr" style={{ width: 480 }}>
            <div className="jt-stagemgr-head">
              <h2>Add unit</h2>
              <button className="jt-stagemgr-close" onClick={() => setAddingUnit(false)}>
                ✕
              </button>
            </div>
            <div className="bo-addunit">
              <input placeholder="Address" value={newUnit.address} onChange={(e) => setNewUnit((s) => ({ ...s, address: e.target.value }))} autoFocus />
              <input
                type="number"
                placeholder="Initial contract cost"
                value={newUnit.contractCost}
                onChange={(e) => setNewUnit((s) => ({ ...s, contractCost: e.target.value }))}
              />
              <select value={newUnit.electricalService} onChange={(e) => setNewUnit((s) => ({ ...s, electricalService: e.target.value }))}>
                {ELEC_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o || "Electrical service…"}
                  </option>
                ))}
              </select>
              <select value={newUnit.septicStatus} onChange={(e) => setNewUnit((s) => ({ ...s, septicStatus: e.target.value }))}>
                {SEPTIC_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o || "Septic status…"}
                  </option>
                ))}
              </select>
              <textarea placeholder="Notes" value={newUnit.notes} onChange={(e) => setNewUnit((s) => ({ ...s, notes: e.target.value }))} />
              <div className="bo-addunit-actions">
                <button className="jt-managestages-btn" onClick={createUnit}>
                  Save
                </button>
                <button className="jt-managestages-btn" onClick={() => setAddingUnit(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
