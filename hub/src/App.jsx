import { useEffect, useState } from "react";
import {
  getLoggedInUserId,
  getLoggedInUserName,
  getAccountRole,
  isTradeAccount,
  setCentralAuthSession,
  setTradeAuthSession,
  clearAuthSession,
  getApiHeaders,
} from "./auth";
import { EMBEDDED, subscribeStaffAuth, takePendingStaffAuth } from "./centralEmbed";
import JobTracking from "./pages/JobTracking";
import JobDetail from "./pages/JobDetail";
import Siting from "./pages/Siting";
import DefectTracker from "./pages/DefectTracker";
import BushfireVariations from "./pages/BushfireVariations";
import BushfireOrganizer from "./pages/BushfireOrganizer";
import BushfireUnitDetail from "./pages/BushfireUnitDetail";
import AdminAccounts from "./pages/AdminAccounts";

function CentralLoginForm({ onLoggedIn }) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/users/names")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => setError("Could not load users"))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin() {
    if (!selectedUserId || !password) return;
    setLoggingIn(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(selectedUserId, 10), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Incorrect password");
        return;
      }
      const data = await res.json();
      setCentralAuthSession(data.userId, data.passwordType, data.user?.name);
      onLoggedIn();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <>
      <label className="field">
        <span>User</span>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          disabled={loading || loggingIn}
        >
          <option value="">
            {loading ? "Loading..." : users.length === 0 ? "No users" : "Select user..."}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          disabled={loggingIn}
          autoComplete="off"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button
        className="btn-primary"
        onClick={handleLogin}
        disabled={!selectedUserId || !password || loggingIn}
      >
        {loggingIn ? "Signing in…" : "Enter"}
      </button>
    </>
  );
}

function TradeLoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!username || !password) return;
    setLoggingIn(true);
    setError("");
    try {
      const res = await fetch("/api/sgfhub/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Incorrect username or password");
        return;
      }
      const data = await res.json();
      setTradeAuthSession(data.accountId, data.name, data.role);
      onLoggedIn();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <>
      <label className="field">
        <span>Username</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          disabled={loggingIn}
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          disabled={loggingIn}
          autoComplete="off"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button
        className="btn-primary"
        onClick={handleLogin}
        disabled={!username || !password || loggingIn}
      >
        {loggingIn ? "Signing in…" : "Enter"}
      </button>
    </>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState("central"); // "central" | "trade"

  return (
    <div className="screen screen--center">
      <div className="card">
        <h1 className="brand">SGFHUB</h1>
        <div className="login-tabs">
          <button className={mode === "central" ? "on" : ""} onClick={() => setMode("central")}>
            Staff login
          </button>
          <button className={mode === "trade" ? "on" : ""} onClick={() => setMode("trade")}>
            Contractor login
          </button>
        </div>
        {mode === "central" ? (
          <CentralLoginForm onLoggedIn={onLoggedIn} />
        ) : (
          <TradeLoginForm onLoggedIn={onLoggedIn} />
        )}
      </div>
    </div>
  );
}

function Home({ grantedPages, trade, onNavigate }) {
  const [counts, setCounts] = useState({
    sitingsPendingQld: null,
    sitingsPendingVic: null,
    activeDefectsQld: null,
    activeDefectsVic: null,
  });
  const [loading, setLoading] = useState(true);
  const wantsQldDefects = grantedPages.includes("qld_defects");
  const wantsVicDefects = grantedPages.includes("vic_defects");
  // No dedicated "site visits" grant exists — an account's state allocation is
  // inferred from whatever QLD/VIC page access it already has (job tracking
  // and/or defects), same signal Admin already uses to assign people to a state.
  const allocatedToQld = !trade && grantedPages.some((p) => p.startsWith("qld_"));
  const allocatedToVic = !trade && grantedPages.some((p) => p.startsWith("vic_"));

  useEffect(() => {
    let cancelled = false;

    async function countActiveDefects(state) {
      const res = await fetch(`/api/defects?state=${state}`, { headers: getApiHeaders() });
      if (!res.ok) throw new Error("Failed to load defects");
      const defects = await res.json();
      return Array.isArray(defects) ? defects.filter((d) => d.kind === "defects" && !d.completed).length : null;
    }

    async function countPendingSiteVisitsByState() {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      const projects = await res.json();
      if (!Array.isArray(projects)) return { QLD: null, VIC: null };
      const pending = projects.filter(
        (p) =>
          (p.site_visit_status || "Not Complete") === "Not Complete" &&
          p.status !== "Hotlist" &&
          p.status !== "Cancelled"
      );
      return {
        QLD: pending.filter((p) => (p.state || "").toUpperCase() === "QLD").length,
        VIC: pending.filter((p) => (p.state || "").toUpperCase() === "VIC").length,
      };
    }

    setLoading(true);
    Promise.allSettled([
      allocatedToQld || allocatedToVic ? countPendingSiteVisitsByState() : Promise.resolve({ QLD: null, VIC: null }),
      wantsQldDefects ? countActiveDefects("QLD") : Promise.resolve(null),
      wantsVicDefects ? countActiveDefects("VIC") : Promise.resolve(null),
    ]).then(([sitings, qld, vic]) => {
      if (cancelled) return;
      const sitingsByState = sitings.status === "fulfilled" ? sitings.value : { QLD: null, VIC: null };
      setCounts({
        sitingsPendingQld: sitingsByState.QLD,
        sitingsPendingVic: sitingsByState.VIC,
        activeDefectsQld: qld.status === "fulfilled" ? qld.value : null,
        activeDefectsVic: vic.status === "fulfilled" ? vic.value : null,
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [allocatedToQld, allocatedToVic, wantsQldDefects, wantsVicDefects]);

  const boxes = [];
  if (allocatedToQld) {
    boxes.push({ key: "sitings_qld", label: "Site Visits Pending — QLD", value: counts.sitingsPendingQld });
  }
  if (allocatedToVic) {
    boxes.push({ key: "sitings_vic", label: "Site Visits Pending — VIC", value: counts.sitingsPendingVic });
  }
  if (wantsQldDefects) {
    boxes.push({
      key: "qld_defects",
      label: "Active Defects — QLD",
      value: counts.activeDefectsQld,
      onClick: () => onNavigate("qld_defects"),
    });
  }
  if (wantsVicDefects) {
    boxes.push({
      key: "vic_defects",
      label: "Active Defects — VIC",
      value: counts.activeDefectsVic,
      onClick: () => onNavigate("vic_defects"),
    });
  }

  return (
    <div className="home">
      <h1>Welcome to SGFHUB</h1>
      {boxes.length === 0 ? (
        <p className="muted">Pick a page from the menu on the left to get started.</p>
      ) : (
        <div className="home-stats">
          {boxes.map((b) => (
            <div
              key={b.key}
              className={"home-stat-box" + (b.onClick ? " clickable" : "")}
              onClick={b.onClick}
              role={b.onClick ? "button" : undefined}
              tabIndex={b.onClick ? 0 : undefined}
            >
              <div className="home-stat-value">{loading ? "…" : b.value ?? "—"}</div>
              <div className="home-stat-label">{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pages an account can be granted access to, beyond Home (always visible)
// and Admin (always visible to central accounts, never to trade).
const GRANTABLE_PAGES = [
  { key: "vic_job_tracking", label: "VIC Job Tracking" },
  { key: "qld_job_tracking", label: "QLD Job Tracking" },
  { key: "vic_defects", label: "VIC Defects" },
  { key: "qld_defects", label: "QLD Defects" },
  { key: "bushfire_variations", label: "Bushfire Variations" },
  { key: "bushfire_organizer", label: "Bushfire Organizer" },
];

function Sidebar({ page, onNavigate, grantedPages, isCentral, accountLabel, onLogout }) {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <img src="/sgfhub-logo.png" alt="SGFHUB" />
      </div>
      <div className="sidebar__links">
        <button className={"sidebar__link" + (page === "home" ? " on" : "")} onClick={() => onNavigate("home")}>
          Home
        </button>
        {GRANTABLE_PAGES.filter((p) => grantedPages.includes(p.key)).map((p) => (
          <button
            key={p.key}
            className={"sidebar__link" + (page === p.key ? " on" : "")}
            onClick={() => onNavigate(p.key)}
          >
            {p.label}
          </button>
        ))}
        {isCentral && (
          <button className={"sidebar__link" + (page === "admin" ? " on" : "")} onClick={() => onNavigate("admin")}>
            Admin
          </button>
        )}
      </div>
      <div className="sidebar__footer">
        <div className="sidebar__account">{accountLabel}</div>
        {onLogout ? (
          <button className="sidebar__logout" onClick={onLogout}>
            Log out
          </button>
        ) : null}
      </div>
    </nav>
  );
}

function applyStaffAuth(auth) {
  if (!auth?.userId) return false;
  setCentralAuthSession(auth.userId, auth.passwordType, auth.userName);
  return true;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => {
    if (!EMBEDDED) return Boolean(getLoggedInUserId());
    return applyStaffAuth(takePendingStaffAuth());
  });
  const [page, setPage] = useState("home");
  const [grantedPages, setGrantedPages] = useState([]);
  const [writablePages, setWritablePages] = useState([]);
  const [canManageStages, setCanManageStages] = useState(false);
  const [jobDetailId, setJobDetailId] = useState(null);
  const [jobDetailBackTo, setJobDetailBackTo] = useState("home");
  const [sitingJobId, setSitingJobId] = useState(null);
  const [sitingBackTo, setSitingBackTo] = useState("home");
  const [bushfireUnitId, setBushfireUnitId] = useState(null);
  const [bushfireUnitBackTo, setBushfireUnitBackTo] = useState("bushfire_organizer");
  const trade = isTradeAccount();

  useEffect(() => {
    if (!EMBEDDED) return undefined;
    try {
      window.parent.postMessage({ type: "sgfhub-ready" }, "*");
    } catch {
      // Parent sends the staff session on iframe load as well.
    }
    return subscribeStaffAuth((auth) => {
      applyStaffAuth(auth);
      setLoggedIn(true);
    });
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/sgfhub/my-pages", { headers: getApiHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        setGrantedPages(Array.isArray(data.pages) ? data.pages : []);
        setWritablePages(Array.isArray(data.writablePages) ? data.writablePages : []);
        setCanManageStages(!!data.canManageStages);
      })
      .catch(() => {
        if (EMBEDDED) {
          setGrantedPages(GRANTABLE_PAGES.map((p) => p.key));
          setWritablePages([]);
          setCanManageStages(false);
          return;
        }
        setGrantedPages([]);
        setWritablePages([]);
        setCanManageStages(false);
      });
  }, [loggedIn]);

  function handleLogout() {
    clearAuthSession();
    setLoggedIn(false);
    setPage("home");
    setGrantedPages([]);
    setWritablePages([]);
    setCanManageStages(false);
  }

  if (!loggedIn) {
    if (EMBEDDED) {
      return (
        <div className="screen screen--center">
          <p className="muted">Opening from SGF Central…</p>
        </div>
      );
    }
    return (
      <LoginScreen
        onLoggedIn={() => {
          setLoggedIn(true);
          setPage("home");
        }}
      />
    );
  }

  const accountLabel = trade
    ? `${getLoggedInUserName() || "Contractor"}${getAccountRole() ? " · " + getAccountRole() : ""}`
    : getLoggedInUserName() || "User";

  function openJob(jobId) {
    setJobDetailId(jobId);
    setJobDetailBackTo(page);
    setPage("job_detail");
  }

  function openSiting(jobId) {
    setSitingJobId(jobId);
    setSitingBackTo(page);
    setPage("siting");
  }

  function openBushfireUnit(unitId) {
    setBushfireUnitId(unitId);
    setBushfireUnitBackTo(page);
    setPage("bushfire_unit_detail");
  }

  const bushfireCanWrite = writablePages.includes("bushfire_variations") || writablePages.includes("bushfire_organizer");

  let content;
  if (page === "job_detail" && jobDetailId) {
    content = <JobDetail jobId={jobDetailId} writablePages={writablePages} onBack={() => setPage(jobDetailBackTo)} onOpenSiting={openSiting} />;
  } else if (page === "siting" && sitingJobId) {
    content = <Siting jobId={sitingJobId} writablePages={writablePages} onBack={() => setPage(sitingBackTo)} />;
  } else if (page === "bushfire_unit_detail" && bushfireUnitId) {
    content = (
      <BushfireUnitDetail jobId={bushfireUnitId} canApprove={canManageStages} canWrite={bushfireCanWrite} onBack={() => setPage(bushfireUnitBackTo)} />
    );
  } else if (page === "vic_job_tracking" && grantedPages.includes("vic_job_tracking")) {
    content = <JobTracking region="VIC" canManageStages={canManageStages} canWrite={writablePages.includes("vic_job_tracking")} onOpenJob={openJob} onOpenSiting={openSiting} />;
  } else if (page === "qld_job_tracking" && grantedPages.includes("qld_job_tracking")) {
    content = <JobTracking region="QLD" canManageStages={canManageStages} canWrite={writablePages.includes("qld_job_tracking")} onOpenJob={openJob} onOpenSiting={openSiting} />;
  } else if (page === "vic_defects" && grantedPages.includes("vic_defects")) {
    content = <DefectTracker state="VIC" canWrite={writablePages.includes("vic_defects")} />;
  } else if (page === "qld_defects" && grantedPages.includes("qld_defects")) {
    content = <DefectTracker state="QLD" canWrite={writablePages.includes("qld_defects")} />;
  } else if (page === "bushfire_variations" && grantedPages.includes("bushfire_variations")) {
    content = <BushfireVariations canApprove={canManageStages} canWrite={bushfireCanWrite} />;
  } else if (page === "bushfire_organizer" && grantedPages.includes("bushfire_organizer")) {
    content = <BushfireOrganizer canWrite={bushfireCanWrite} onOpenUnit={openBushfireUnit} />;
  } else if (page === "admin" && !trade) {
    content = <AdminAccounts />;
  } else {
    content = <Home grantedPages={grantedPages} trade={trade} onNavigate={setPage} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        onNavigate={setPage}
        grantedPages={grantedPages}
        isCentral={!trade}
        accountLabel={accountLabel}
        onLogout={EMBEDDED ? null : handleLogout}
      />
      <main className="app-main">{content}</main>
    </div>
  );
}
