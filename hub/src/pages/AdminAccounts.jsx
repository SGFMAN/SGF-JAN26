import { useEffect, useState } from "react";
import { getApiHeaders } from "../auth";

const emptyForm = { name: "", username: "", password: "", role: "", state: "" };

// Keep in sync with GRANTABLE_PAGES in App.jsx and PAGE_KEYS in
// backend/sgfhubPageAccess.js — a page has to exist in all three places to
// actually show up and be reachable.
const GRANTABLE_PAGES = [
  { key: "vic_job_tracking", label: "VIC Job Tracking" },
  { key: "qld_job_tracking", label: "QLD Job Tracking" },
  { key: "vic_defects", label: "VIC Defects" },
  { key: "qld_defects", label: "QLD Defects" },
  { key: "bushfire_variations", label: "Bushfire Variations" },
  { key: "bushfire_organizer", label: "Bushfire Organizer" },
];

function SitingSettings() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/sgfhub/settings/siting-email", { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setEmail(data.email || ""))
      .catch(() => setError("Could not load setting"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/sgfhub/settings/siting-email", {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setEmail(data.email);
      setSaved(true);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2>Siting settings</h2>
      <p className="muted">Who gets emailed a copy when a Siting (pre-construction site check) is marked complete, for both VIC and QLD.</p>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="form-row">
          <label className="field">
            <span>Siting completion email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
            />
          </label>
          <button className="btn-primary" style={{ width: "auto", padding: "9px 18px" }} onClick={save} disabled={saving || !email}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {saved && !error && <p className="muted">Saved.</p>}
    </>
  );
}

function PageAccessTable({ title, description, kind }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    setLoading(true);
    setError("");
    fetch(`/api/sgfhub/page-access?kind=${kind}`, { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setRows)
      .catch(() => setError("Could not load page access"))
      .finally(() => setLoading(false));
  }

  async function setLevel(accountId, pageKey, level) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== accountId) return r;
        const pages = { ...r.pages };
        if (level === "none") delete pages[pageKey];
        else pages[pageKey] = level;
        return { ...r, pages };
      })
    );
    try {
      const res = await fetch("/api/sgfhub/page-access", {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ accountKind: kind, accountId, pageKey, level }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  return (
    <>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              {GRANTABLE_PAGES.map((p) => (
                <th key={p.key}>{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                {GRANTABLE_PAGES.map((p) => (
                  <td key={p.key}>
                    <select
                      className="page-access-select"
                      value={r.pages[p.key] || "none"}
                      onChange={(e) => setLevel(r.id, p.key, e.target.value)}
                    >
                      <option value="none">No access</option>
                      <option value="read">Read only</option>
                      <option value="write">Read &amp; write</option>
                    </select>
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={1 + GRANTABLE_PAGES.length} className="muted">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function AdminAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError("");
    fetch("/api/sgfhub/accounts", { headers: getApiHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load accounts");
        return r.json();
      })
      .then(setAccounts)
      .catch(() => setError("Could not load trade accounts"))
      .finally(() => setLoading(false));
  }

  async function createAccount() {
    if (!form.name || !form.username || !form.password) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/sgfhub/accounts", {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || "Failed to create account");
        return;
      }
      setForm(emptyForm);
      load();
    } catch {
      setCreateError("Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(account) {
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, active: !a.active } : a)));
    try {
      const res = await fetch(`/api/sgfhub/accounts/${account.id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ active: !account.active }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  async function setAccountState(accountId, state) {
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, state: state || null } : a)));
    try {
      const res = await fetch(`/api/sgfhub/accounts/${accountId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ state: state || null }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  return (
    <div className="content">
      <h1>Admin</h1>

      <SitingSettings />

      <h2>Add trade account</h2>
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Role (optional)</span>
          <input
            placeholder="e.g. Framing Contractor"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
        </label>
        <label className="field">
          <span>State</span>
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
            <option value="">Both VIC &amp; QLD</option>
            <option value="VIC">VIC only</option>
            <option value="QLD">QLD only</option>
          </select>
        </label>
        <button
          className="btn-primary"
          style={{ width: "auto", padding: "9px 18px" }}
          onClick={createAccount}
          disabled={!form.name || !form.username || !form.password || creating}
        >
          {creating ? "Adding…" : "Add account"}
        </button>
      </div>
      {createError && <p className="error">{createError}</p>}

      <h2>Trade accounts</h2>
      <p className="muted">
        Contractor and subcontractor logins for SGFHUB. These accounts can never sign in to SGF Central, and in Job
        Tracking they can only edit a stage they're assigned to. A State restricts which state's jobs/defects they can
        be assigned to at all — leave it on "Both" unless they only ever work in one state.
      </p>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>State</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.username}</td>
                <td>{a.role || "—"}</td>
                <td>
                  <select className="page-access-select" value={a.state || ""} onChange={(e) => setAccountState(a.id, e.target.value)}>
                    <option value="">Both</option>
                    <option value="VIC">VIC only</option>
                    <option value="QLD">QLD only</option>
                  </select>
                </td>
                <td>
                  <span className={"badge " + (a.active ? "active" : "inactive")}>
                    {a.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td>
                  <button className="btn-link" onClick={() => toggleActive(a)}>
                    {a.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No trade accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <PageAccessTable
        title="Staff page access"
        description="Which SGFHUB pages show up for each SGF Central login."
        kind="central"
      />
      <PageAccessTable
        title="Trade page access"
        description="Which SGFHUB pages show up for each trade account."
        kind="trade"
      />
    </div>
  );
}
