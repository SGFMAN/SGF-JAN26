import html2canvas from "html2canvas";
import { getApiHeaders } from "./auth";
import { captureSiteBoundary3DSnapshot } from "./siteBoundary3DRender";

async function captureMapScreenshot(mapElement) {
  if (!mapElement) {
    throw new Error("Map is not available for capture.");
  }

  const leafletContainer = mapElement.querySelector(".leaflet-container") || mapElement;
  const canvas = await html2canvas(leafletContainer, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#1a1a1a",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Map capture failed"))),
      "image/png"
    );
  });
}

export async function generateMapsProposal({
  mapElement,
  siteGeometry,
  lookupState = "VIC",
  placedUnit = null,
  buildingsGeoJson = null,
  verandahsGeoJson = null,
  quoteItems = [],
  addressLabel = "",
}) {
  if (!siteGeometry) {
    throw new Error("Search for a site with a title boundary before generating a proposal.");
  }

  const [visual3d, mapScreenshot] = await Promise.all([
    captureSiteBoundary3DSnapshot({
      siteGeometry,
      lookupState,
      placedUnit,
      buildingsGeoJson,
      verandahsGeoJson,
    }),
    captureMapScreenshot(mapElement),
  ]);

  const formData = new FormData();
  formData.append("visual3d", visual3d, "visual3d.png");
  formData.append("mapScreenshot", mapScreenshot, "map.png");
  formData.append("quoteItems", JSON.stringify(quoteItems || []));
  if (addressLabel) {
    formData.append("addressLabel", addressLabel);
  }

  const headers = getApiHeaders();
  const res = await fetch("/api/maps/generate-proposal", {
    method: "POST",
    headers: {
      "X-User-Id": headers["X-User-Id"] || "",
      "X-Password-Type": headers["X-Password-Type"] || "global",
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to generate proposal PDF");
  }
  return data;
}
