import { useEffect, useState } from "react";
import ModalBackdrop from "./ModalBackdrop";
import { checkedQuoteItems, fetchQuoteItems } from "../utils/mapsQuoteItems";

const MONUMENT = "#323233";
const WHITE = "#fff";

export default function MapsQuoteModal({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await fetchQuoteItems();
        if (!cancelled) setItems(checkedQuoteItems(loaded));
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

  return (
    <ModalBackdrop zIndex={2100}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maps-quote-title"
        style={{
          background: WHITE,
          borderRadius: "16px",
          padding: "24px",
          width: "min(480px, 92vw)",
          maxHeight: "min(80vh, 640px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="maps-quote-title" style={{ margin: "0 0 12px", color: MONUMENT, fontSize: "1.25rem" }}>
          Quote
        </h2>

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
            minHeight: "120px",
            maxHeight: "400px",
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: "10px",
            background: "#fafafa",
            marginBottom: "16px",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px", color: "#666" }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: "16px", color: "#666", lineHeight: 1.5 }}>
              No quote items are enabled. Check items in Settings → Maps → Quote.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #eee",
                    color: MONUMENT,
                    fontSize: "0.95rem",
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "10px 16px",
            fontSize: "0.9rem",
            fontWeight: 600,
            borderRadius: "10px",
            border: "none",
            background: MONUMENT,
            color: WHITE,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Close
        </button>
      </div>
    </ModalBackdrop>
  );
}
