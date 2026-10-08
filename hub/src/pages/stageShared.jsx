// Shared between JobTracking.jsx (the grid) and JobDetail.jsx (one job's
// page) — the status vocabulary, date helpers, and the stage-editing
// popover itself, so both pages edit a stage exactly the same way.
import { useLayoutEffect, useRef, useState } from "react";

export const STATUS_LABEL = {
  not_started: "Not started",
  sched: "Start date set",
  prog: "In progress",
  done: "Done",
  na: "Not applicable",
};

export const SEG_OPTIONS = [
  { s: "not_started", swatch: "var(--empty)" },
  { s: "sched", swatch: "var(--sched)" },
  { s: "prog", swatch: "var(--prog)" },
  { s: "done", swatch: "var(--done)" },
];

const pad = (n) => String(n).padStart(2, "0");

export function shortDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${+d}/${+m}`;
}

export function longDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${+d}/${+m}/${y}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function StagePopover({ job, stage, anchorRect, accounts, canReassign, onClose, onSave }) {
  const ref = useRef(null);
  const [status, setStatus] = useState(stage.status);
  const [startDate, setStartDate] = useState(stage.startDate || "");
  const [dueDate, setDueDate] = useState(stage.dueDate || "");
  const [doneDate, setDoneDate] = useState(stage.doneDate || "");
  const [assigneeAccountId, setAssigneeAccountId] = useState(stage.assigneeAccountId ?? "");
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

  function choose(s) {
    setStatus(s);
    if (s === "prog" && !startDate) setStartDate(todayISO());
    if (s === "done" && !doneDate) setDoneDate(todayISO());
    onSave(
      s,
      {
        startDate: s === "prog" && !startDate ? todayISO() : startDate,
        dueDate,
        doneDate: s === "done" && !doneDate ? todayISO() : doneDate,
      },
      canReassign ? assigneeAccountId : undefined
    );
  }

  const options = stage.allowNA ? [...SEG_OPTIONS, { s: "na", swatch: "var(--na)" }] : SEG_OPTIONS;
  const isLate = status === "prog" && dueDate && dueDate < todayISO();

  return (
    <div
      className="jt-pop"
      ref={ref}
      style={pos}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Stage status"
    >
      <h3>
        {stage.order}. {stage.label}
      </h3>
      <div className="pj">{job.address}</div>
      <label>
        Assigned to
        {canReassign ? (
          <select
            value={assigneeAccountId}
            onChange={(e) => {
              setAssigneeAccountId(e.target.value);
              onSave(status, { startDate, dueDate, doneDate }, e.target.value);
            }}
          >
            <option value="">— Unassigned —</option>
            {accounts
              // A trade account set to one state only shows up for that
              // state's jobs — except the one already assigned, so it never
              // silently vanishes from the dropdown it's currently sitting in.
              .filter((a) => !a.state || a.state === job.state || String(a.id) === String(assigneeAccountId))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.role ? ` (${a.role})` : ""}
                </option>
              ))}
          </select>
        ) : (
          <div className="pj">{stage.assigneeName || "Unassigned"}</div>
        )}
      </label>
      <div className="jt-seg">
        {options.map((opt) => (
          <button key={opt.s} className={status === opt.s ? "on" : ""} onClick={() => choose(opt.s)}>
            <i style={{ background: opt.swatch }} />
            {STATUS_LABEL[opt.s]}
          </button>
        ))}
      </div>
      {(status === "sched" || status === "prog") && (
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              onSave(status, { startDate: e.target.value, dueDate, doneDate }, canReassign ? assigneeAccountId : undefined);
            }}
          />
        </label>
      )}
      {status === "prog" && (
        <label>
          Expected completion
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              onSave(status, { startDate, dueDate: e.target.value, doneDate }, canReassign ? assigneeAccountId : undefined);
            }}
          />
        </label>
      )}
      {status === "done" && (
        <label>
          Completed on
          <input
            type="date"
            value={doneDate}
            onChange={(e) => {
              setDoneDate(e.target.value);
              onSave(status, { startDate, dueDate, doneDate: e.target.value }, canReassign ? assigneeAccountId : undefined);
            }}
          />
        </label>
      )}
      <div className={"note" + (isLate ? " late" : "")}>
        {isLate
          ? "Past the expected completion date."
          : status === "prog" && !dueDate
          ? "Add an expected completion date to track this stage."
          : status === "sched"
          ? "Shows yellow until you set it to In progress."
          : ""}
      </div>
      <div className="pbtns">
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
