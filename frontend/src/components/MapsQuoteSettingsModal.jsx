import { useCallback, useEffect, useRef, useState } from "react";
import ModalBackdrop from "./ModalBackdrop";
import PricingCatalogPricePill from "./PricingCatalogPricePill";
import {
  fetchQuoteItems,
  quoteItemFromCatalogMatch,
  saveQuoteItems,
} from "../utils/mapsQuoteItems";
import { searchPricingCatalog } from "../utils/pricingCatalogSearch";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
};

const searchRowStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "12px",
  padding: "10px 0",
  borderBottom: `1px solid ${SECTION_GREY}`,
  fontSize: "0.95rem",
  color: MONUMENT,
};

export default function MapsQuoteSettingsModal({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [hoverSearchKey, setHoverSearchKey] = useState(null);
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

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setMatches([]);
      setCatalogError(null);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const { matches: nextMatches, error: searchError } = await searchPricingCatalog(q);
        if (cancelled) return;
        if (searchError) {
          setCatalogError(searchError);
          setMatches([]);
          return;
        }
        setCatalogError(null);
        setMatches(nextMatches);
      } catch (err) {
        if (!cancelled) {
          setCatalogError(err.message || "Search failed");
          setMatches([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

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

  const handleAddFromMatch = (match) => {
    const nextItem = quoteItemFromCatalogMatch(match);
    if (itemsRef.current.some((item) => item.id === nextItem.id)) return;
    scheduleSave([...itemsRef.current, nextItem]);
  };

  const handleRemove = (id) => {
    scheduleSave(itemsRef.current.filter((item) => item.id !== id));
  };

  const itemIds = new Set(items.map((item) => item.id));

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
          width: "min(640px, 94vw)",
          maxHeight: "min(85vh, 760px)",
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
          Search the pricing catalog and add items to the Maps quote list.
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

        <label
          htmlFor="maps-quote-catalog-search"
          style={{
            display: "block",
            marginBottom: "6px",
            color: MONUMENT,
            fontSize: "0.92rem",
            fontWeight: 600,
          }}
        >
          Search catalog
        </label>
        <input
          id="maps-quote-catalog-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          autoComplete="off"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "0.95rem",
            color: MONUMENT,
            background: "#f4f4f5",
            boxSizing: "border-box",
            marginBottom: "8px",
          }}
        />

        {catalogError && (
          <div style={{ fontSize: "0.88rem", color: "#b00020", marginBottom: "8px" }}>
            {catalogError}
          </div>
        )}

        <div
          style={{
            maxHeight: "200px",
            minHeight: query.trim() ? "80px" : 0,
            overflowY: "auto",
            marginBottom: "16px",
            border: query.trim() ? "1px solid #ddd" : "none",
            borderRadius: "10px",
            background: query.trim() ? "#fafafa" : "transparent",
            padding: query.trim() ? "4px 12px" : 0,
          }}
        >
          {searchLoading && query.trim() && (
            <div style={{ padding: "12px 0", color: "#666", fontSize: "0.9rem" }}>Searching…</div>
          )}
          {!searchLoading &&
            matches.map((match, idx) => {
              const rowKey = `${match.rowIndex}-${idx}`;
              const isHover = hoverSearchKey === rowKey;
              const alreadyAdded = itemIds.has(`catalog-${match.rowIndex}`);
              return (
                <button
                  key={rowKey}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => handleAddFromMatch(match)}
                  onMouseEnter={() => setHoverSearchKey(rowKey)}
                  onMouseLeave={() => setHoverSearchKey(null)}
                  style={{
                    ...searchRowStyle,
                    width: "100%",
                    margin: 0,
                    background: alreadyAdded ? "#f0f0f0" : isHover ? "#f4f4f6" : "transparent",
                    borderTop: "none",
                    borderLeft: "none",
                    borderRight: "none",
                    cursor: alreadyAdded ? "default" : "pointer",
                    textAlign: "left",
                    font: "inherit",
                    color: alreadyAdded ? "#888" : "inherit",
                    boxSizing: "border-box",
                    opacity: alreadyAdded ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                      textDecoration: isHover && !alreadyAdded ? "underline" : "none",
                      textDecorationColor: `${MONUMENT}55`,
                    }}
                  >
                    {match.product || "—"}
                    {alreadyAdded && (
                      <span style={{ fontSize: "0.82rem", color: "#666", marginLeft: "8px" }}>
                        (added)
                      </span>
                    )}
                  </div>
                  <PricingCatalogPricePill price={match.price} />
                </button>
              );
            })}
        </div>

        <h3
          style={{
            margin: "0 0 8px",
            color: MONUMENT,
            fontSize: "0.95rem",
            fontWeight: 600,
          }}
        >
          Quote list
        </h3>

        <div
          style={{
            flex: 1,
            minHeight: "160px",
            maxHeight: "320px",
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
            <div style={{ padding: "16px", color: "#666", lineHeight: 1.5 }}>
              No items yet. Search the catalog above and click a result to add it.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => (
                <li key={item.id} style={rowStyle}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                      color: MONUMENT,
                    }}
                  >
                    {item.label || "—"}
                  </div>
                  <PricingCatalogPricePill price={item.price} />
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
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
                    Remove
                  </button>
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
            border: "1px solid #ccc",
            background: WHITE,
            color: MONUMENT,
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
