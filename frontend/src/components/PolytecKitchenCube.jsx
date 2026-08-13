import React, { useEffect, useMemo, useState } from "react";
import AuthedImg from "./AuthedImg";
import KitchenDisplay3D from "./KitchenDisplay3D.jsx";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import {
  COLORBOND_RANGE_KEY,
  normalizeColourSectionRanges,
} from "../constants/colourSectionRanges";
import { getApiHeaders } from "../utils/auth";
import { fetchColourGroupCatalogue } from "../utils/colourCatalogueCache";
import { prefetchAuthedImageBlobUrls } from "../utils/authedImageCache";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";
const NOTHING_SELECTED = "";
const LEFT_SELECT_WIDTH = "200px";
const BENCHTOP_TYPE_LAMINATE = "laminate";
const BENCHTOP_TYPE_STONE = "stone";

const KITCHEN_FIELDS = [
  {
    key: "cabinets",
    label: "Cabinets",
    rangeKey: "kitchen_cabinets",
    projectField: "cabinet1_colour",
  },
  {
    key: "benchtopLaminate",
    label: "Benchtops - Laminate",
    rangeKey: "kitchen_benchtops_laminate",
    projectField: "cabinet2_colour",
  },
  {
    key: "benchtopStone",
    label: "Benchtops - Stone",
    rangeKey: "kitchen_benchtops_stone",
    projectField: "benchtop_colour",
  },
];

const SELECT_STYLE = {
  width: LEFT_SELECT_WIDTH,
  flex: "0 0 auto",
  padding: "10px 12px",
  borderRadius: "8px",
  border: FIELD_OUTLINE,
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
  minHeight: "42px",
};

function colorbondCatalogue() {
  const samples = COLORBOND_COLOURS.map((c, index) => ({
    id: `colorbond-${index}`,
    name: c.name,
    subgroup_id: "colorbond",
    subgroup: "Colorbond",
    image_url: null,
    image_filename: null,
    r: c.r,
    g: c.g,
    b: c.b,
  }));
  return {
    key: COLORBOND_RANGE_KEY,
    name: "Colorbond",
    subgroups: [{ id: "colorbond", name: "Colorbond", samples }],
    samples,
  };
}

function colourOrBlank(value) {
  const s = value == null ? "" : String(value).trim();
  return s;
}

function findSampleByName(catalogue, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target || !catalogue) return null;
  for (const sg of catalogue.subgroups || []) {
    for (const sample of sg.samples || []) {
      if (String(sample.name || "").trim().toLowerCase() === target) return sample;
    }
  }
  return null;
}

function sampleColorHex(sample) {
  if (!sample || sample.r == null || sample.g == null || sample.b == null) return null;
  const toByte = (v) => Math.max(0, Math.min(255, Math.round(Number(v))));
  return (toByte(sample.r) << 16) | (toByte(sample.g) << 8) | toByte(sample.b);
}

function inferBenchtopType(laminate, stone) {
  const hasLam = Boolean(colourOrBlank(laminate));
  const hasStone = Boolean(colourOrBlank(stone));
  if (hasStone && !hasLam) return BENCHTOP_TYPE_STONE;
  return BENCHTOP_TYPE_LAMINATE;
}

function ColourFieldRow({ field, errors, savingKey, onChange }) {
  const subgroups = field.catalogue?.subgroups || [];
  const disabled = !!errors[field.key] || savingKey === field.key;
  const loadError = errors[field.key];
  const saveError = errors[`${field.key}Save`];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <span style={{ fontSize: "0.9rem", color: UI.textMuted, flexShrink: 0 }}>
        {field.label}
      </span>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <select
          value={field.value}
          onChange={(e) => void onChange(field, e.target.value)}
          disabled={disabled}
          style={SELECT_STYLE}
        >
          <option value={NOTHING_SELECTED}>Nothing selected</option>
          {field.value && !findSampleByName(field.catalogue, field.value) ? (
            <option value={field.value}>{field.value}</option>
          ) : null}
          {subgroups.map((sg) => (
            <optgroup key={sg.id} label={sg.name}>
              {(sg.samples || []).map((sample) => (
                <option key={sample.id} value={sample.name}>
                  {sample.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div
          style={{
            alignSelf: "center",
            height: "100%",
            maxHeight: "160px",
            aspectRatio: "1 / 1",
            width: "auto",
            maxWidth: "160px",
            flexShrink: 0,
            borderRadius: "8px",
            border: FIELD_OUTLINE,
            background: WHITE,
            overflow: "hidden",
            boxSizing: "border-box",
            visibility: field.showThumbnail ? "visible" : "hidden",
          }}
          aria-hidden={!field.showThumbnail}
        >
          {field.showThumbnail && field.thumbnailUrl ? (
            <AuthedImg
              src={field.thumbnailUrl}
              alt={field.value || field.label}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
        </div>
        <div
          style={{
            flex: "0 0 auto",
            width: "88px",
            alignSelf: "center",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
          title="Temporary plan pattern scale"
        >
          <span
            style={{
              fontSize: "0.7rem",
              color: UI.textMuted,
              lineHeight: 1.1,
            }}
          >
            Scale
          </span>
          <input
            type="range"
            min={0.05}
            max={5}
            step={0.05}
            value={field.planScale}
            onChange={(e) => field.onPlanScaleChange(Number(e.target.value))}
            style={{ width: "100%", margin: 0, cursor: "pointer" }}
            aria-label={`${field.label} plan pattern scale`}
          />
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: MONUMENT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Number(field.planScale).toFixed(2)}
          </span>
        </div>
      </div>
      {loadError ? (
        <div style={{ color: "#842029", fontSize: "0.8rem" }}>{loadError}</div>
      ) : null}
      {saveError ? (
        <div style={{ color: "#842029", fontSize: "0.8rem" }}>{saveError}</div>
      ) : null}
    </div>
  );
}

/**
 * Kitchen finishes: Cabinets + Laminate/Stone toggle + one benchtop colour.
 */
export default function PolytecKitchenCube({
  project,
  hybridImageUrl = null,
  hybridScale = 1,
  kitchenBenches = [],
  kitchenZonePoints = [],
  footprintPoints = [],
  internalWallSegments = [],
  calibration = null,
  claddingColorHex = null,
  onKitchenFinishesChange = null,
}) {
  const [catalogues, setCatalogues] = useState({
    cabinets: null,
    benchtopLaminate: null,
    benchtopStone: null,
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [values, setValues] = useState({
    cabinets: "",
    benchtopLaminate: "",
    benchtopStone: "",
  });
  const [benchtopType, setBenchtopType] = useState(BENCHTOP_TYPE_LAMINATE);
  const [savingKey, setSavingKey] = useState("");
  const [cabinetsPlanScale, setCabinetsPlanScale] = useState(1);
  const [laminatePlanScale, setLaminatePlanScale] = useState(1);
  const [stonePlanScale, setStonePlanScale] = useState(1);

  useEffect(() => {
    const laminate = colourOrBlank(project?.cabinet2_colour);
    const stone = colourOrBlank(project?.benchtop_colour);
    setValues({
      cabinets: colourOrBlank(project?.cabinet1_colour),
      benchtopLaminate: laminate,
      benchtopStone: stone,
    });
    setBenchtopType(inferBenchtopType(laminate, stone));
  }, [project?.id, project?.cabinet1_colour, project?.cabinet2_colour, project?.benchtop_colour]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErrors({});
        const rangesRes = await fetch(`${API_URL}/api/colour-section-ranges`, {
          headers: getApiHeaders(),
        });
        const rangesData = await rangesRes.json().catch(() => ({}));
        if (!rangesRes.ok) throw new Error(rangesData.error || `Failed (${rangesRes.status})`);
        const ranges = normalizeColourSectionRanges(rangesData.ranges);

        const next = {
          cabinets: null,
          benchtopLaminate: null,
          benchtopStone: null,
        };
        const nextErrors = {};

        async function loadField(field) {
          const rangeKey = String(ranges[field.rangeKey] || "").trim();
          if (!rangeKey) {
            next[field.key] = null;
            return;
          }
          try {
            if (rangeKey === COLORBOND_RANGE_KEY) {
              next[field.key] = colorbondCatalogue();
              return;
            }
            next[field.key] = await fetchColourGroupCatalogue(rangeKey);
          } catch (e) {
            next[field.key] = null;
            nextErrors[field.key] = e.message || "Failed to load options";
          }
        }

        const laminate = colourOrBlank(project?.cabinet2_colour);
        const stone = colourOrBlank(project?.benchtop_colour);
        const preferStone = inferBenchtopType(laminate, stone) === BENCHTOP_TYPE_STONE;
        const primaryBenchtop = preferStone
          ? KITCHEN_FIELDS.find((f) => f.key === "benchtopStone")
          : KITCHEN_FIELDS.find((f) => f.key === "benchtopLaminate");
        const secondaryBenchtop = preferStone
          ? KITCHEN_FIELDS.find((f) => f.key === "benchtopLaminate")
          : KITCHEN_FIELDS.find((f) => f.key === "benchtopStone");
        const cabinetsField = KITCHEN_FIELDS.find((f) => f.key === "cabinets");

        // Unblock UI as soon as cabinets + the active benchtop range are ready.
        await Promise.all([loadField(cabinetsField), loadField(primaryBenchtop)]);
        if (cancelled) return;
        setCatalogues({ ...next });
        setErrors({ ...nextErrors });
        setLoading(false);

        // Finish the other benchtop range in the background.
        await loadField(secondaryBenchtop);
        if (cancelled) return;
        setCatalogues({ ...next });
        setErrors({ ...nextErrors });
      } catch (e) {
        if (!cancelled) {
          setErrors({
            cabinets: e.message || "Failed to load kitchen colour options",
          });
          setCatalogues({ cabinets: null, benchtopLaminate: null, benchtopStone: null });
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSamples = useMemo(() => {
    const out = {};
    for (const field of KITCHEN_FIELDS) {
      out[field.key] = findSampleByName(catalogues[field.key], values[field.key]);
    }
    return out;
  }, [catalogues, values]);

  const activeBenchtopKey =
    benchtopType === BENCHTOP_TYPE_STONE ? "benchtopStone" : "benchtopLaminate";
  const activeBenchtopSample = selectedSamples[activeBenchtopKey];
  const cabinetSample = selectedSamples.cabinets;

  useEffect(() => {
    if (loading) return undefined;
    const urls = [
      selectedSamples.cabinets?.image_url,
      activeBenchtopSample?.image_url,
    ].filter(Boolean);
    void prefetchAuthedImageBlobUrls(urls);
    return undefined;
  }, [loading, selectedSamples.cabinets?.image_url, activeBenchtopSample?.image_url]);

  const kitchenReady = !loading;

  useEffect(() => {
    if (!onKitchenFinishesChange) return undefined;
    onKitchenFinishesChange({
      cabinetImageUrl: cabinetSample?.image_url || null,
      cabinetColorHex: sampleColorHex(cabinetSample),
      benchtopImageUrl: activeBenchtopSample?.image_url || null,
      benchtopColorHex: sampleColorHex(activeBenchtopSample),
    });
    return undefined;
  }, [
    onKitchenFinishesChange,
    cabinetSample,
    activeBenchtopSample,
  ]);

  const cabinetsField = useMemo(
    () => ({
      key: "cabinets",
      label: "Cabinets",
      value: values.cabinets,
      catalogue: catalogues.cabinets,
      thumbnailUrl: selectedSamples.cabinets?.image_url || null,
      showThumbnail: true,
      planScale: cabinetsPlanScale,
      onPlanScaleChange: setCabinetsPlanScale,
      projectField: "cabinet1_colour",
    }),
    [values.cabinets, catalogues.cabinets, selectedSamples.cabinets, cabinetsPlanScale]
  );

  const activeBenchtopField = useMemo(() => {
    if (benchtopType === BENCHTOP_TYPE_STONE) {
      return {
        key: "benchtopStone",
        label: "Benchtops - Stone",
        value: values.benchtopStone,
        catalogue: catalogues.benchtopStone,
        thumbnailUrl: selectedSamples.benchtopStone?.image_url || null,
        showThumbnail: true,
        planScale: stonePlanScale,
        onPlanScaleChange: setStonePlanScale,
        projectField: "benchtop_colour",
      };
    }
    return {
      key: "benchtopLaminate",
      label: "Benchtops - Laminate",
      value: values.benchtopLaminate,
      catalogue: catalogues.benchtopLaminate,
      thumbnailUrl: selectedSamples.benchtopLaminate?.image_url || null,
      showThumbnail: true,
      planScale: laminatePlanScale,
      onPlanScaleChange: setLaminatePlanScale,
      projectField: "cabinet2_colour",
    };
  }, [
    benchtopType,
    values.benchtopStone,
    values.benchtopLaminate,
    catalogues.benchtopStone,
    catalogues.benchtopLaminate,
    selectedSamples.benchtopStone,
    selectedSamples.benchtopLaminate,
    stonePlanScale,
    laminatePlanScale,
  ]);

  async function saveField(projectField, value) {
    const projectKey = project?.access_token || project?.id;
    if (!projectKey) return;
    const res = await fetch(`${API_URL}/api/projects/${projectKey}/update-colours`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getApiHeaders() },
      body: JSON.stringify({ [projectField]: value || null }),
      keepalive: true,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed (${res.status})`);
    }
  }

  async function handleChange(field, nextName) {
    setValues((prev) => ({ ...prev, [field.key]: nextName }));
    try {
      setSavingKey(field.key);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${field.key}Save`];
        return next;
      });
      await saveField(field.projectField, nextName);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [`${field.key}Save`]: e.message || "Failed to save",
      }));
    } finally {
      setSavingKey("");
    }
  }

  if (!kitchenReady) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: UI.inputBg || "#f5f5f5",
          borderRadius: "8px",
          color: UI.textMuted,
          fontSize: "1rem",
        }}
      >
        Loading kitchen…
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "row",
        gap: "16px",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "10px",
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ColourFieldRow
              field={cabinetsField}
              errors={errors}
              savingKey={savingKey}
              onChange={handleChange}
            />
          </div>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              flexShrink: 0,
              width: LEFT_SELECT_WIDTH,
            }}
          >
            <span style={{ fontSize: "0.9rem", color: UI.textMuted }}>Benchtop type</span>
            <select
              value={benchtopType}
              onChange={(e) => setBenchtopType(e.target.value)}
              style={{ ...SELECT_STYLE, width: "100%" }}
            >
              <option value={BENCHTOP_TYPE_LAMINATE}>Laminate</option>
              <option value={BENCHTOP_TYPE_STONE}>Stone</option>
            </select>
          </label>
        </div>

        <ColourFieldRow
          field={activeBenchtopField}
          errors={errors}
          savingKey={savingKey}
          onChange={handleChange}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        <KitchenDisplay3D
          kitchenBenches={kitchenBenches}
          kitchenZonePoints={kitchenZonePoints}
          footprintPoints={footprintPoints}
          internalWallSegments={internalWallSegments}
          calibration={calibration}
          claddingColorHex={claddingColorHex}
          hybridImageUrl={hybridImageUrl}
          hybridScale={hybridScale}
          cabinetImageUrl={cabinetSample?.image_url || null}
          cabinetColorHex={sampleColorHex(cabinetSample)}
          benchtopImageUrl={activeBenchtopSample?.image_url || null}
          benchtopColorHex={sampleColorHex(activeBenchtopSample)}
        />
      </div>
    </div>
  );
}
