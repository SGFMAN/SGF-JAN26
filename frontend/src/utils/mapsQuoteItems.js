import { getApiHeaders } from "./auth";

export function catalogQuoteItemId(rowIndex) {
  return `catalog-${rowIndex}`;
}

export function quoteItemFromCatalogMatch(match) {
  return {
    id: catalogQuoteItemId(match.rowIndex),
    label: String(match.product || "—").trim(),
    price: String(match.price ?? "").trim(),
  };
}

export function normalizeQuoteItem(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    label: String(raw.label ?? "").trim(),
    price: String(raw.price ?? "").trim(),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
  };
}

export async function fetchQuoteItems() {
  const res = await fetch("/api/maps/quote-items", { headers: getApiHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to load quote items");
  }
  return (data.items || [])
    .map((item, index) => normalizeQuoteItem(item, index))
    .filter(Boolean);
}

export async function saveQuoteItems(items) {
  const payload = (items || [])
    .map((item, index) => normalizeQuoteItem(item, index))
    .filter(Boolean);
  const res = await fetch("/api/maps/quote-items", {
    method: "PUT",
    headers: {
      ...getApiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to save quote items");
  }
  return (data.items || [])
    .map((item, index) => normalizeQuoteItem(item, index))
    .filter(Boolean);
}
