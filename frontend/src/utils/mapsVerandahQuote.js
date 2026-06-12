import { searchPricingCatalog } from "./pricingCatalogSearch";
import { totalVerandahAreaSquareMetres } from "./geoJsonArea";

let verandahCatalogCache = null;

export async function fetchVerandahCatalogProduct() {
  if (verandahCatalogCache) return verandahCatalogCache;

  const { matches, error } = await searchPricingCatalog("Verandah");
  if (error) throw new Error(error);

  const exact =
    matches.find((row) => String(row.product || "").trim().toLowerCase() === "verandah") ||
    matches[0] ||
    null;

  if (!exact) {
    throw new Error('Pricing catalog item "Verandah" was not found.');
  }

  verandahCatalogCache = exact;
  return exact;
}

function parseUnitPrice(priceRaw) {
  const cleaned = String(priceRaw ?? "").replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

export async function buildVerandahQuoteLineItem(verandahsGeoJson) {
  const areaSqM = totalVerandahAreaSquareMetres(verandahsGeoJson);
  if (areaSqM <= 0) return null;

  const catalog = await fetchVerandahCatalogProduct();
  const unitPrice = parseUnitPrice(catalog.price);
  if (unitPrice == null) {
    throw new Error('Could not read unit price for catalog item "Verandah".');
  }

  const total = areaSqM * unitPrice;
  const areaLabel = areaSqM.toFixed(2);

  return {
    id: "verandah-calculated",
    label: `${catalog.product} (${areaLabel} m² @ $${unitPrice.toLocaleString("en-AU")}/m²)`,
    price: String(Math.round(total)),
    meta: {
      areaSqM,
      unitPrice,
      catalogProduct: catalog.product,
    },
  };
}
