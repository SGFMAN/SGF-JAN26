import React, { useState, useEffect, useRef } from "react";
import {
  formatMoneyInput,
  getDepositPaidValue,
  parseMoneyToInt,
} from "../utils/projectDeposit";
import {
  calculatePaymentAmounts,
  formatCalculatedAmount,
} from "../utils/paymentStageAmounts";
import { FALLBACK_STREAMS, fetchStreams, projectStreamOptions } from "../utils/streamsCatalog";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

/** Stored editable money fields (paid + pre-engagement amount). */
const PAYMENT_STORED_KEYS = [
  "pre_engagement_required",
  "pre_engagement_paid",
  "deposit_paid",
  "base_paid",
  "frame_paid",
  "lock_up_paid",
  "fix_paid",
  "final_paid",
];

const PAYMENT_ROWS = [
  { stage: "Pre-Engagement", amountKey: "pre_engagement", paidKey: "pre_engagement_paid", amountStored: true },
  { stage: "Deposit", amountKey: "deposit", paidKey: "deposit_paid", amountStored: false },
  { stage: "Base", amountKey: "base", paidKey: "base_paid", amountStored: false },
  { stage: "Frame", amountKey: "frame", paidKey: "frame_paid", amountStored: false },
  { stage: "Lock Up", amountKey: "lock_up", paidKey: "lock_up_paid", amountStored: false },
  { stage: "Fix", amountKey: "fix", paidKey: "fix_paid", amountStored: false },
  { stage: "Final", amountKey: "final", paidKey: "final_paid", amountStored: false },
];

function emptyPaymentFields() {
  return Object.fromEntries(PAYMENT_STORED_KEYS.map((k) => [k, ""]));
}

function paymentFieldsFromProject(project) {
  const next = emptyPaymentFields();
  if (!project) return next;
  for (const key of PAYMENT_STORED_KEYS) {
    next[key] = formatMoneyInput(project[key]);
  }
  if (!next.deposit_paid) {
    next.deposit_paid = formatMoneyInput(getDepositPaidValue(project));
  }
  return next;
}

const MONEY_INPUT_STYLE = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "none",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

const MONEY_READONLY_STYLE = {
  ...MONEY_INPUT_STYLE,
  cursor: "default",
};

/** Amount + Paid + Owed (amount − paid). Amount may be stored or calculated. */
function PaymentAmountPaidRow({
  stage,
  amountValue,
  amountEditable,
  paidKey,
  paymentFields,
  onChange,
  onBlur,
}) {
  const amountDisplay = amountEditable
    ? paymentFields.pre_engagement_required || ""
    : amountValue || "";
  const paidDisplay = paymentFields[paidKey] || "";
  const owedDollars = Math.max(0, parseMoneyToInt(amountDisplay) - parseMoneyToInt(paidDisplay));
  const owedDisplay = formatCalculatedAmount(owedDollars) || "$0";
  const colStyle = { flex: "1", minWidth: 0 };

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <div style={colStyle}>
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
            {stage} Amount
          </div>
          {amountEditable ? (
            <input
              type="text"
              name="pre_engagement_required"
              value={paymentFields.pre_engagement_required || ""}
              onChange={(e) => onChange("pre_engagement_required", e.target.value)}
              onBlur={() => onBlur("pre_engagement_required")}
              placeholder="$0"
              style={MONEY_INPUT_STYLE}
              autoComplete="off"
            />
          ) : (
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value={amountValue || ""}
              placeholder="$0"
              style={MONEY_READONLY_STYLE}
            />
          )}
        </div>
        <div style={colStyle}>
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
            {stage} Paid
          </div>
          <input
            type="text"
            name={paidKey}
            value={paidDisplay}
            onChange={(e) => onChange(paidKey, e.target.value)}
            onBlur={() => onBlur(paidKey)}
            placeholder="$0"
            style={MONEY_INPUT_STYLE}
            autoComplete="off"
          />
        </div>
        <div style={colStyle}>
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
            {stage} Owed
          </div>
          <input
            type="text"
            readOnly
            tabIndex={-1}
            value={owedDisplay}
            placeholder="$0"
            style={MONEY_READONLY_STYLE}
          />
        </div>
      </div>
    </div>
  );
}

export default function Admin({ project, onUpdate }) {
  const [stream, setStream] = useState(project?.stream || "");
  const [paymentFields, setPaymentFields] = useState(() => paymentFieldsFromProject(project));
  const [projectCost, setProjectCost] = useState(() => formatMoneyInput(project?.project_cost));
  const [projectDate, setProjectDate] = useState("");
  const [salesperson, setSalesperson] = useState(project?.salesperson || "");
  const [salesTeamUsers, setSalesTeamUsers] = useState([]);
  const [loadingSalesUsers, setLoadingSalesUsers] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [streamOptions, setStreamOptions] = useState(() => projectStreamOptions(FALLBACK_STREAMS));

  useEffect(() => {
    let cancelled = false;
    fetchStreams(API_URL).then((rows) => {
      if (!cancelled) setStreamOptions(projectStreamOptions(rows));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const saveFieldRef = useRef(() => Promise.resolve());
  const savePaymentFieldsRef = useRef(() => Promise.resolve());

  useEffect(() => {
    setPaymentFields(paymentFieldsFromProject(project));
    setProjectCost(formatMoneyInput(project?.project_cost));

    if (project?.year) {
      const yearValue = project.year;
      if (/^\d{4}-\d{2}-\d{2}$/.test(yearValue)) {
        setProjectDate(yearValue);
      } else if (/^\d{4}$/.test(yearValue)) {
        setProjectDate(`${yearValue}-01-01`);
      } else {
        setProjectDate("");
      }
    } else {
      setProjectDate("");
    }
  }, [project]);

  const valuesRef = useRef({ stream, projectCost, projectDate, salesperson, paymentFields });

  useEffect(() => {
    valuesRef.current = { stream, projectCost, projectDate, salesperson, paymentFields };
  }, [stream, projectCost, projectDate, salesperson, paymentFields]);

  useEffect(() => {
    fetchSalesTeamUsers();
    fetchPaymentSettings();
  }, []);

  async function fetchPaymentSettings() {
    try {
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) return;
      const data = await response.json();
      setPaymentSettings(data);
    } catch (error) {
      console.error("Error fetching payment settings:", error);
    }
  }

  async function fetchSalesTeamUsers() {
    setLoadingSalesUsers(true);
    try {
      const usersResponse = await fetch(`${API_URL}/api/users`);
      if (!usersResponse.ok) {
        throw new Error("Failed to fetch users");
      }
      const allUsers = await usersResponse.json();

      const salesUsers = allUsers.filter((user) => {
        if (!user.positions || !Array.isArray(user.positions)) return false;
        return user.positions.some(
          (position) => position.name && position.name.toLowerCase() === "sales team"
        );
      });

      setSalesTeamUsers(salesUsers);
    } catch (error) {
      console.error("Error fetching sales team users:", error);
      setSalesTeamUsers([]);
    } finally {
      setLoadingSalesUsers(false);
    }
  }

  useEffect(() => {
    setStream(project?.stream || "");
    setSalesperson(project?.salesperson || "");
  }, [project]);

  const calculatedAmounts = calculatePaymentAmounts(
    projectCost,
    paymentSettings,
    paymentFields.pre_engagement_required
  );

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    const currentValues = valuesRef.current;
    const projectName =
      project?.street && project?.suburb
        ? `${project.street}, ${project.suburb}`.trim()
        : project?.name || "";
    try {
      const updateData = {
        name: projectName,
        status: project?.status || null,
        stream: currentValues.stream,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: currentValues.paymentFields?.deposit_paid || null,
        project_cost: currentValues.projectCost,
        salesperson: currentValues.salesperson || null,
        [fieldName]: value === "" ? null : value,
      };

      if (fieldName === "project_cost" && typeof value === "string") {
        updateData.project_cost = value.replace(/[^0-9]/g, "") || null;
      }

      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        return;
      }

      await response.json().catch(() => null);

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  async function savePaymentFields(partial) {
    if (!project?.id) return;
    try {
      const payload = {};
      for (const [key, value] of Object.entries(partial || {})) {
        if (value === undefined) continue;
        if (key !== "project_cost" && !PAYMENT_STORED_KEYS.includes(key)) continue;
        if (typeof value === "string") {
          payload[key] = value.replace(/[^0-9]/g, "") || null;
        } else {
          payload[key] = value;
        }
      }
      if (Object.keys(payload).length === 0) return;

      const response = await fetch(`${API_URL}/api/projects/${project.id}/payment-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save payment fields:", errorData.error || response.statusText);
        return;
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving payment fields:", error);
    }
  }

  useEffect(() => {
    saveFieldRef.current = saveField;
    savePaymentFieldsRef.current = savePaymentFields;
  });

  useEffect(() => {
    return () => {
      const current = valuesRef.current;
      void savePaymentFieldsRef.current({
        project_cost: current.projectCost,
        ...current.paymentFields,
      });
    };
  }, []);

  async function handleStreamChange(e) {
    const newStream = e.target.value;
    setStream(newStream);
    valuesRef.current.stream = newStream;
    await saveField("stream", newStream);
  }

  async function handleSalespersonChange(e) {
    const newSalesperson = e.target.value;
    setSalesperson(newSalesperson);
    valuesRef.current.salesperson = newSalesperson;
    await saveField("salesperson", newSalesperson);
  }

  async function handleProjectDateChange(e) {
    const newDate = e.target.value;
    setProjectDate(newDate);
    valuesRef.current.projectDate = newDate;
    await saveField("year", newDate);
  }

  function handleProjectCostChange(e) {
    const formattedValue = formatMoneyInput(e.target.value);
    setProjectCost(formattedValue);
    valuesRef.current.projectCost = formattedValue;
  }

  async function handleProjectCostBlur() {
    await savePaymentFields({ project_cost: valuesRef.current.projectCost });
  }

  function handlePaymentFieldChange(fieldKey, rawValue) {
    if (!PAYMENT_STORED_KEYS.includes(fieldKey)) return;
    const formattedValue = formatMoneyInput(rawValue);
    setPaymentFields((prev) => {
      const next = { ...prev, [fieldKey]: formattedValue };
      valuesRef.current.paymentFields = next;
      return next;
    });
  }

  async function handlePaymentFieldBlur(fieldKey) {
    if (!PAYMENT_STORED_KEYS.includes(fieldKey)) return;
    const value = valuesRef.current.paymentFields?.[fieldKey] ?? "";
    await savePaymentFields({ [fieldKey]: value });
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Admin
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Stream
              </div>
              <select
                name="stream"
                value={stream}
                onChange={handleStreamChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                <option value="">Select Stream</option>
                {streamOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", display: "flex", gap: "12px", alignItems: "baseline" }}>
                <div style={{ flex: "1", minWidth: 0 }}>Start Date</div>
                <div style={{ flex: "0 0 auto", width: "5.5rem", textAlign: "center" }}>Project Days</div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <input
                  type="date"
                  value={projectDate}
                  onChange={handleProjectDateChange}
                  style={{
                    flex: "1",
                    minWidth: 0,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                />
                <input
                  type="text"
                  value={(() => {
                    if (!projectDate) return "";
                    const startDate = new Date(projectDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    startDate.setHours(0, 0, 0, 0);
                    const diffTime = today - startDate;
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 ? diffDays.toString() : "";
                  })()}
                  readOnly
                  style={{
                    flex: "0 0 auto",
                    width: "5.5rem",
                    minWidth: "5.5rem",
                    padding: "10px 8px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "default",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Salesperson
              </div>
              <select
                name="salesperson"
                value={salesperson}
                onChange={handleSalespersonChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                <option value="">Select Salesperson</option>
                {loadingSalesUsers ? (
                  <option value="">Loading...</option>
                ) : (
                  salesTeamUsers.map((user) => (
                    <option key={user.id} value={user.name}>
                      {user.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Column 2 — all payment fields */}
          <div style={{ flex: "1", minWidth: "220px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Project Cost
              </div>
              <input
                type="text"
                name="projectCost"
                value={projectCost}
                onChange={handleProjectCostChange}
                onBlur={handleProjectCostBlur}
                placeholder="$0"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
            {PAYMENT_ROWS.map((row) => (
              <PaymentAmountPaidRow
                key={row.stage}
                stage={row.stage}
                amountEditable={row.amountStored}
                amountValue={formatCalculatedAmount(calculatedAmounts[row.amountKey])}
                paidKey={row.paidKey}
                paymentFields={paymentFields}
                onChange={handlePaymentFieldChange}
                onBlur={handlePaymentFieldBlur}
              />
            ))}
          </div>

          {/* Column 3 — reserved */}
          <div style={{ flex: "1", minWidth: "200px" }} />

          {/* Column 4 — reserved */}
          <div style={{ flex: "1", minWidth: "200px" }} />
        </div>
      )}
    </div>
  );
}
