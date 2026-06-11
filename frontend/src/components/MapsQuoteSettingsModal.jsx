import { useCallback, useEffect, useRef, useState } from "react";
import ModalBackdrop from "./ModalBackdrop";
import {
  fetchQuoteItems,
  newQuoteItemId,
  saveQuoteItems,
} from "../utils/mapsQuoteItems";

const MONUMENT = "#323233";
const WHITE = "#fff";

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
};

export default function MapsQuoteSettingsModal({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const saveTimerRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await fetchQuoteItems();
        if (!cancelled) setItems(loaded);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load quote items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistItems = useCallback(async (nextItems) => {
    setSaveStatus("Saving…");
    try {
      const saved = await saveQuoteItems(nextItems);
      setItems(saved);
      setSaveStatus("Saved");
      setError("");
    } catch (err) {
      setSaveStatus("");
      setError(err.message || "Failed to save quote items");
    }
  }, []);

  const scheduleSave = useCallback(
    (nextItems) => {
      setItems(nextItems);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void persistItems(nextItems);
      }, 350);
    },
    [persistItems]
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const handleAdd = () => {
    const next = [
      ...itemsRef.current,
      { id: newQuoteItemId(), label: "New item", checked: false },
    ];
    scheduleSave(next);
  };

  const handleLabelChange = (id, label) => {
    const next = itemsRef.current.map((item) =>
      item.id === id ? { ...item, label } : item
    );
    scheduleSave(next);
  };

  const handleCheckedChange = (id, checked) => {
    const next = itemsRef.current.map((item) =>
      item.id === id ? { ...item, checked } : item
    );
    scheduleSave(next);
  };

  const handleDelete = (id) => {
    const next = itemsRef.current.filter((item) => item.id !== id);
    scheduleSave(next);
  };

  return (
    <ModalBackdrop zIndex={2100}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maps-quote-settings-title"
        style={{
          background: WHITE,
          borderRadius: "16px",
          padding: "24px",
          width: "min(560px, 94vw)",
          maxHeight: "min(80vh, 720px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <h2
            id="maps-quote-settings-title"
            style={{ margin: 0, color: MONUMENT, fontSize: "1.25rem" }}
          >
            Quote Settings
          </h2>
          {saveStatus && (
            <span style={{ fontSize: "0.82rem", color: "#666" }}>{saveStatus}</span>
          )}
        </div>

        <p style={{ margin: "0 0 12px", color: "#666", fontSize: "0.9rem", lineHeight: 1.45 }}>
          Add quote checklist items here. Checked items appear on the Maps Quote modal.
        </p>

        {error && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#fdecea",
              color: "#842029",
              fontSize: "0.88rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: "200px",
            maxHeight: "420px",
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: "10px",
            background: "#fafafa",
            marginBottom: "14px",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px", color: "#666" }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: "16px", color: "#666" }}>No quote items yet.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => (
                <li key={item.id} style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => handleCheckedChange(item.id, e.target.checked)}
                    aria-label={`Include ${item.label || "item"} on Maps quote`}
                    style={{ flexShrink: 0 }}
                  />
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => handleLabelChange(item.id, e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "8px 10px",
                      fontSize: "0.92rem",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    style={{
                      flexShrink: 0,
                      padding: "8px 10px",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      background: WHITE,
                      color: "#842029",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading}
            style={{
              padding: "10px 16px",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "10px",
              border: "none",
              background: MONUMENT,
              color: WHITE,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Add item
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "10px",
              border: "1px solid #ccc",
              background: WHITE,
              color: MONUMENT,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
