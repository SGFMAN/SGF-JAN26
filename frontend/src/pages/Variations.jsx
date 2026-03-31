import React, { useState, useEffect, useCallback, useMemo } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const PRICE_BOX_WIDTH = 118;

function formatVariationPrice(price) {
  if (price == null || price === "") return null;
  const s = String(price).trim();
  if (s === "—" || s === "-") return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return s;
  return Number(cleaned).toLocaleString("en-AU");
}

/** Returns a finite number, or NaN if not parseable as currency */
function parsePriceToNumber(price) {
  if (price == null || price === "") return NaN;
  const s = String(price).trim();
  if (s === "—" || s === "-") return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function PricePill({ price }) {
  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: "center",
        width: PRICE_BOX_WIDTH,
        minWidth: PRICE_BOX_WIDTH,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#e8f5e9",
        color: "#1b5e20",
        border: "2px solid #2e7d32",
        borderRadius: "6px",
        padding: "4px 8px",
        fontWeight: 600,
        lineHeight: 1.15,
        textAlign: "center",
      }}
    >
      {formatVariationPrice(price) != null ? (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "center",
              gap: "1px",
              fontSize: "0.82rem",
            }}
          >
            <span style={{ fontWeight: 700 }}>$</span>
            <span>{formatVariationPrice(price)}</span>
          </div>
          <span
            style={{
              fontSize: "0.55rem",
              fontWeight: 500,
              color: "#2e7d32",
              marginTop: "1px",
              lineHeight: 1,
              letterSpacing: "0.02em",
            }}
          >
            inc GST
          </span>
        </>
      ) : (
        <span style={{ fontSize: "0.82rem", lineHeight: 1.2 }}>—</span>
      )}
    </div>
  );
}

function newListItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export default function Variations({ project }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [hoverSearchKey, setHoverSearchKey] = useState(null);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [consultantModalOpen, setConsultantModalOpen] = useState(false);
  const [usersForModal, setUsersForModal] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loadingUsersModal, setLoadingUsersModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setMatches([]);
      setCatalogError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API_URL}/api/pricing-catalog/search?q=${encodeURIComponent(q)}`
        );
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setCatalogError(data.error || "Search failed");
          setMatches([]);
          return;
        }
        setCatalogError(null);
        setMatches(Array.isArray(data.matches) ? data.matches : []);
      } catch (e) {
        if (!cancelled) {
          setCatalogError(e.message || "Network error");
          setMatches([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const addItemFromMatch = useCallback((m) => {
    setSelectedItems((prev) => [
      ...prev,
      {
        id: newListItemId(),
        product: m.product || "—",
        price: m.price,
        quantity: 1,
      },
    ]);
  }, []);

  const removeSelectedItem = useCallback((id) => {
    setSelectedItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const setItemQuantity = useCallback((id, rawValue) => {
    const n = parseInt(String(rawValue).trim(), 10);
    const q = Number.isFinite(n) && n >= 1 ? n : 1;
    setSelectedItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: q } : it))
    );
  }, []);

  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const unit = parsePriceToNumber(item.price);
      const qty =
        Number.isFinite(item.quantity) && item.quantity >= 1 ? item.quantity : 1;
      return sum + (Number.isFinite(unit) ? unit * qty : 0);
    }, 0);
  }, [selectedItems]);

  const performCreateVariationPdf = useCallback(
    async (consultantName) => {
      if (!project?.id || selectedItems.length === 0) return;
      setCreatingPdf(true);
      try {
        const items = selectedItems.map((it) => ({
          product: it.product,
          price: it.price,
          quantity: Number.isFinite(it.quantity) && it.quantity >= 1 ? it.quantity : 1,
        }));
        const r = await fetch(`${API_URL}/api/projects/${project.id}/variations/create-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, consultantName }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.error || `Failed (${r.status})`);
        }
        alert(`PDF saved in project folder:\n${data.path || data.filename || "variaiton TEST.pdf"}`);
      } catch (e) {
        alert(e.message || "Failed to create PDF");
      } finally {
        setCreatingPdf(false);
      }
    },
    [project?.id, selectedItems]
  );

  const openConsultantModal = useCallback(async () => {
    if (!project?.id || selectedItems.length === 0) return;
    setConsultantModalOpen(true);
    setSelectedUserId(null);
    setLoadingUsersModal(true);
    setUsersForModal([]);
    try {
      const r = await fetch(`${API_URL}/api/users`);
      const data = await r.json().catch(() => []);
      if (!r.ok) {
        throw new Error(data.error || "Failed to load users");
      }
      setUsersForModal(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e.message || "Could not load users");
      setConsultantModalOpen(false);
    } finally {
      setLoadingUsersModal(false);
    }
  }, [project?.id, selectedItems.length]);

  const closeConsultantModal = useCallback(() => {
    setConsultantModalOpen(false);
    setUsersForModal([]);
    setSelectedUserId(null);
  }, []);

  const handleConsultantModalOk = useCallback(() => {
    if (selectedUserId == null) {
      alert("Please select a consultant.");
      return;
    }
    const user = usersForModal.find((u) => u.id === selectedUserId);
    const name = user?.name?.trim();
    if (!name) {
      alert("Selected user has no name.");
      return;
    }
    closeConsultantModal();
    performCreateVariationPdf(name);
  }, [selectedUserId, usersForModal, closeConsultantModal, performCreateVariationPdf]);

  const colStyle = {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    background: WHITE,
    borderRadius: "12px",
    padding: "16px",
    boxSizing: "border-box",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  const rowShell = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "12px",
    padding: "10px 0",
    borderBottom: `1px solid ${SECTION_GREY}`,
    fontSize: "0.95rem",
    color: MONUMENT,
  };

  const selectedRowShell = {
    ...rowShell,
    alignItems: "flex-start",
  };

  /** Row 1: Qty label. Row 2: input, price pill, × — tops of input + pill + button align. */
  const qtyGridStyle = {
    display: "grid",
    gridTemplateColumns: "64px auto 28px",
    gridTemplateRows: "auto auto",
    columnGap: "12px",
    rowGap: "4px",
    alignItems: "start",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, flexShrink: 0 }}>
        Variations
      </h2>

      <div
        style={{
          marginTop: "12px",
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "16px",
          alignItems: "stretch",
        }}
      >
        <div style={colStyle}>
          <h3
            style={{
              fontSize: "1rem",
              marginTop: 0,
              marginBottom: "8px",
              color: MONUMENT,
              fontWeight: 600,
            }}
          >
            Search
          </h3>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder=""
            autoComplete="off"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.95rem",
              color: MONUMENT,
              background: "#f4f4f5",
              boxSizing: "border-box",
              marginBottom: "12px",
            }}
          />
          {catalogError && (
            <div style={{ fontSize: "0.9rem", color: "#b00020", marginBottom: "8px" }}>
              {catalogError}
            </div>
          )}
          <div
            style={{
              flex: 1,
              minHeight: "200px",
              overflowY: "auto",
            }}
          >
            {!loading &&
              matches.map((m, idx) => {
                const rowKey = `${m.rowIndex}-${idx}`;
                const isHover = hoverSearchKey === rowKey;
                return (
                  <button
                    key={rowKey}
                    type="button"
                    onClick={() => addItemFromMatch(m)}
                    onMouseEnter={() => setHoverSearchKey(rowKey)}
                    onMouseLeave={() => setHoverSearchKey(null)}
                    style={{
                      ...rowShell,
                      width: "100%",
                      margin: 0,
                      background: isHover ? "#f4f4f6" : "transparent",
                      borderTop: "none",
                      borderLeft: "none",
                      borderRight: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                        textDecoration: isHover ? "underline" : "none",
                        textDecorationColor: `${MONUMENT}55`,
                      }}
                    >
                      {m.product || "—"}
                    </div>
                    <PricePill price={m.price} />
                  </button>
                );
              })}
          </div>
        </div>

        <div style={{ ...colStyle, gridColumn: "span 2" }}>
          <h3
            style={{
              fontSize: "1rem",
              marginTop: 0,
              marginBottom: "8px",
              color: MONUMENT,
              fontWeight: 600,
            }}
          >
            Selected
          </h3>
          <p
            style={{
              fontSize: "0.82rem",
              color: "#32323399",
              marginTop: 0,
              marginBottom: "10px",
              lineHeight: 1.4,
            }}
          >
            Click a product or price in Search to add a line. Set quantity for each row. Total includes line price × quantity.
          </p>
          <button
            type="button"
            onClick={openConsultantModal}
            disabled={
              !project?.id ||
              selectedItems.length === 0 ||
              creatingPdf ||
              consultantModalOpen ||
              loadingUsersModal
            }
            style={{
              alignSelf: "flex-start",
              marginBottom: "12px",
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor:
                !project?.id ||
                selectedItems.length === 0 ||
                creatingPdf ||
                consultantModalOpen ||
                loadingUsersModal
                  ? "not-allowed"
                  : "pointer",
              background:
                !project?.id ||
                selectedItems.length === 0 ||
                creatingPdf ||
                consultantModalOpen ||
                loadingUsersModal
                  ? "#c5c5c7"
                  : MONUMENT,
              color: WHITE,
              opacity: creatingPdf ? 0.85 : 1,
            }}
          >
            {creatingPdf ? "Creating PDF…" : "Create variation"}
          </button>
          <div
            style={{
              flex: 1,
              minHeight: "200px",
              overflowY: "auto",
            }}
          >
            {selectedItems.length === 0 ? (
              <div style={{ fontSize: "0.9rem", color: "#32323388" }}>No items yet.</div>
            ) : (
              selectedItems.map((item) => {
                const qty = Number.isFinite(item.quantity) && item.quantity >= 1 ? item.quantity : 1;
                return (
                  <div key={item.id} style={selectedRowShell}>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                      }}
                    >
                      {item.product}
                    </div>
                    <div style={qtyGridStyle}>
                      <span
                        style={{
                          gridColumn: 1,
                          gridRow: 1,
                          justifySelf: "center",
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          color: "#32323399",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          lineHeight: 1.2,
                        }}
                      >
                        Qty
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={qty}
                        onChange={(e) => setItemQuantity(item.id, e.target.value)}
                        aria-label={`Quantity for ${item.product}`}
                        style={{
                          gridColumn: 1,
                          gridRow: 2,
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: `1px solid ${SECTION_GREY}`,
                          fontSize: "0.9rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                          textAlign: "center",
                        }}
                      />
                      <div style={{ gridColumn: 2, gridRow: 2, alignSelf: "start" }}>
                        <PricePill price={item.price} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedItem(item.id)}
                        aria-label="Remove line"
                        title="Remove"
                        style={{
                          gridColumn: 3,
                          gridRow: 2,
                          alignSelf: "start",
                          width: "28px",
                          height: "28px",
                          padding: 0,
                          border: `1px solid ${SECTION_GREY}`,
                          borderRadius: "6px",
                          background: WHITE,
                          color: MONUMENT,
                          fontSize: "1.1rem",
                          lineHeight: 1,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {selectedItems.length > 0 && (
            <div
              style={{
                flexShrink: 0,
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: `2px solid ${SECTION_GREY}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <span style={{ fontSize: "1rem", fontWeight: 700, color: MONUMENT }}>Total</span>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "baseline",
                      justifyContent: "flex-end",
                      gap: "2px",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: "#1b5e20",
                    }}
                  >
                    <span>$</span>
                    <span>
                      {selectedTotal.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 500,
                      color: "#2e7d32",
                      marginTop: "2px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    inc GST
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {consultantModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consultant-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConsultantModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "440px",
              width: "100%",
              maxHeight: "min(70vh, 520px)",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              id="consultant-modal-title"
              style={{ marginTop: 0, marginBottom: "12px", fontSize: "1.05rem", color: MONUMENT }}
            >
              Select consultant
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#32323399", marginTop: 0, marginBottom: "12px" }}>
              Choose who will appear on the variation PDF as Consultant.
            </p>
            <div
              style={{
                flex: 1,
                minHeight: "120px",
                overflowY: "auto",
                border: `1px solid ${SECTION_GREY}`,
                borderRadius: "8px",
                padding: "8px 0",
              }}
            >
              {loadingUsersModal ? (
                <div style={{ padding: "16px", color: MONUMENT }}>Loading users…</div>
              ) : usersForModal.length === 0 ? (
                <div style={{ padding: "16px", color: "#32323399" }}>No users found.</div>
              ) : (
                usersForModal.map((u) => (
                  <label
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                      color: MONUMENT,
                      background: selectedUserId === u.id ? "#e8f4fc" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="variationConsultant"
                      checked={selectedUserId === u.id}
                      onChange={() => setSelectedUserId(u.id)}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span>{u.name || `User #${u.id}`}</span>
                  </label>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "18px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeConsultantModal}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  background: WHITE,
                  color: MONUMENT,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConsultantModalOk}
                disabled={loadingUsersModal || usersForModal.length === 0}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: loadingUsersModal || usersForModal.length === 0 ? "#c5c5c7" : MONUMENT,
                  color: WHITE,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: loadingUsersModal || usersForModal.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
