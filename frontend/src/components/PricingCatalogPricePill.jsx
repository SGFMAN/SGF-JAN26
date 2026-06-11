import { formatCatalogPrice } from "../utils/pricingCatalogSearch";

const PRICE_BOX_WIDTH = 118;

export default function PricingCatalogPricePill({ price }) {
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
      {formatCatalogPrice(price) != null ? (
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
            <span>{formatCatalogPrice(price)}</span>
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
