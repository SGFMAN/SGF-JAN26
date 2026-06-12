import { useEffect, useMemo, useState } from "react";
import ModalBackdrop from "./ModalBackdrop";
import PricingCatalogPricePill from "./PricingCatalogPricePill";
import { getApiHeaders } from "../utils/auth";
import { generateMapsProposal } from "../utils/mapsProposalGenerate";
import { buildVerandahQuoteLineItem } from "../utils/mapsVerandahQuote";
import { fetchQuoteItems } from "../utils/mapsQuoteItems";

const MONUMENT = "#323233";
const WHITE = "#fff";

function unitQuoteLineItem(plan) {
  if (!plan?.id) return null;
  return {
    id: `floor-plan-${plan.id}`,
    label: String(plan.name || "Floor plan").trim(),
    price:
      plan.dollarValue != null && Number.isFinite(Number(plan.dollarValue))
        ? String(plan.dollarValue)
        : "",
  };
}

async function resolveUnitPlan(unitPlan) {
  if (!unitPlan?.id) return null;
  try {
    const res = await fetch("/api/maps/floor-plans", { headers: getApiHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      const fresh = (data.floorPlans || []).find((p) => p.id === unitPlan.id);
      if (fresh) return unitQuoteLineItem(fresh);
    }
  } catch {
    // fall back to snapshot from map placement
  }
  return unitQuoteLineItem(unitPlan);
}

export default function MapsQuoteModal({
  onClose,
  unitPlan = null,
  verandahsGeoJson = null,
  proposalContext = null,
}) {
  const [items, setItems] = useState([]);
  const [unitItem, setUnitItem] = useState(null);
  const [verandahItem, setVerandahItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [loaded, resolvedUnit, resolvedVerandah] = await Promise.all([
          fetchQuoteItems(),
          resolveUnitPlan(unitPlan),
          buildVerandahQuoteLineItem(verandahsGeoJson).catch(() => null),
        ]);
        if (cancelled) return;
        setItems(loaded);
        setUnitItem(resolvedUnit);
        setVerandahItem(resolvedVerandah);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load quote items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unitPlan?.id, verandahsGeoJson]);

  const displayItems = useMemo(() => {
    const list = [];
    if (unitItem) list.push(unitItem);
    if (verandahItem) list.push(verandahItem);
    return [...list, ...items];
  }, [unitItem, verandahItem, items]);

  async function handleGenerate() {
    if (!proposalContext?.siteGeometry) {
      setError("Search for a site with a title boundary before generating a proposal.");
      return;
    }
    if (!proposalContext?.mapElement) {
      setError("Map is not ready for capture.");
      return;
    }

    setGenerating(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await generateMapsProposal({
        mapElement: proposalContext.mapElement,
        siteGeometry: proposalContext.siteGeometry,
        lookupState: proposalContext.lookupState || "VIC",
        placedUnit: proposalContext.placedUnit ?? null,
        buildingsGeoJson: proposalContext.buildingsGeoJson ?? null,
        verandahsGeoJson: proposalContext.verandahsGeoJson ?? null,
        quoteItems: displayItems,
        addressLabel: proposalContext.addressLabel || "",
      });
      setSuccessMessage(`Saved ${result.filename || "TEST PROPOSAL.pdf"}`);
    } catch (err) {
      setError(err.message || "Failed to generate proposal PDF");
    } finally {
      setGenerating(false);
    }
  }

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
          width: "min(560px, 92vw)",
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

        {successMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#e8f5e9",
              color: "#1b5e20",
              fontSize: "0.88rem",
            }}
          >
            {successMessage}
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
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "16px", color: "#666", lineHeight: 1.5 }}>
              No quote items yet. Add a unit on the map or add items in Settings → Maps → Quote.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {displayItems.map((item) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderBottom: "1px solid #eee",
                    color: MONUMENT,
                    fontSize: "0.95rem",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {item.label || "—"}
                  </div>
                  <PricingCatalogPricePill price={item.price} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || loading}
            style={{
              padding: "10px 16px",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "10px",
              border: "none",
              background: generating ? "#666" : "#2e7d32",
              color: WHITE,
              cursor: generating || loading ? "not-allowed" : "pointer",
            }}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            style={{
              padding: "10px 16px",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "10px",
              border: "none",
              background: MONUMENT,
              color: WHITE,
              cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
