export async function searchPricingCatalog(query) {
  const q = String(query || "").trim();
  if (!q) return { matches: [], error: null };
  const res = await fetch(`/api/pricing-catalog/search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { matches: [], error: data.error || "Search failed" };
  }
  return {
    matches: Array.isArray(data.matches) ? data.matches : [],
    error: null,
  };
}

export function formatCatalogPrice(price) {
  if (price == null || price === "") return null;
  const s = String(price).trim();
  if (s === "—" || s === "-") return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return s;
  return Number(cleaned).toLocaleString("en-AU");
}
