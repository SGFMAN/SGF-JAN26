import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AuthedImg from "./AuthedImg";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import {
  COLORBOND_RANGE_KEY,
  normalizeColourSectionRanges,
} from "../constants/colourSectionRanges";
import { getApiHeaders } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";
const NOTHING_SELECTED = "";
const COLUMN_GAP = 8;

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

function swatchBackground(sample) {
  if (!sample) return UI.inputBg;
  if (sample.r != null && sample.g != null && sample.b != null) {
    return `rgb(${sample.r}, ${sample.g}, ${sample.b})`;
  }
  return UI.inputBg;
}

function KitchenColourColumn({
  field,
  catalogue,
  value,
  selected,
  loading,
  loadError,
  saveError,
  saving,
  onChange,
}) {
  const columnRef = useRef(null);
  const chromeRef = useRef(null);
  const [squareSize, setSquareSize] = useState(0);
  const subgroups = catalogue?.subgroups || [];
  const disabled = loading || !!loadError || saving;

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return undefined;

    const measure = () => {
      const colW = column.clientWidth;
      const colH = column.clientHeight;
      const chromeH = chromeRef.current?.offsetHeight || 0;
      const next = Math.max(0, Math.floor(Math.min(colW, colH - chromeH - COLUMN_GAP)));
      setSquareSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(column);
    if (chromeRef.current) ro.observe(chromeRef.current);
    return () => ro.disconnect();
  }, [loadError, saveError, loading]);

  const stackWidth = squareSize > 0 ? squareSize : "100%";

  return (
    <div
      ref={columnRef}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: `${COLUMN_GAP}px`,
      }}
    >
      <div
        ref={chromeRef}
        style={{
          width: stackWidth,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
          <span
            style={{
              fontSize: "0.9rem",
              color: UI.textMuted,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {field.label}
          </span>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: FIELD_OUTLINE,
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              minHeight: "42px",
            }}
          >
            <option value={NOTHING_SELECTED}>{loading ? "Loading..." : "Nothing selected"}</option>
            {value && !findSampleByName(catalogue, value) ? (
              <option value={value}>{value}</option>
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
        </label>

        {loadError ? (
          <div style={{ color: "#842029", fontSize: "0.85rem" }}>{loadError}</div>
        ) : null}
        {saveError ? (
          <div style={{ color: "#842029", fontSize: "0.85rem" }}>{saveError}</div>
        ) : null}
      </div>

      <div
        style={{
          width: squareSize,
          height: squareSize,
          flexShrink: 0,
          borderRadius: "8px",
          border: FIELD_OUTLINE,
          background: swatchBackground(selected),
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {(() => {
          const placeholder = (
            <span
              style={{
                color: MONUMENT,
                fontSize: "0.85rem",
                fontWeight: 500,
                textAlign: "center",
                padding: "8px",
                lineHeight: 1.3,
              }}
            >
              {selected ? "No image" : "—"}
            </span>
          );
          if (!selected?.image_url) return placeholder;
          return (
            <AuthedImg
              src={selected.image_url}
              alt={selected.name || field.label}
              fallback={placeholder}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Kitchen finishes: Cabinets + Benchtops Laminate/Stone.
 * Options come from Colour Settings section → range mappings.
 */
export default function PolytecKitchenCube({ project }) {
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
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    setValues({
      cabinets: colourOrBlank(project?.cabinet1_colour),
      benchtopLaminate: colourOrBlank(project?.cabinet2_colour),
      benchtopStone: colourOrBlank(project?.benchtop_colour),
    });
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

        await Promise.all(
          KITCHEN_FIELDS.map(async (field) => {
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
              const res = await fetch(
                `${API_URL}/api/colour-groups/${encodeURIComponent(rangeKey)}/catalogue`,
                { headers: getApiHeaders() }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
              next[field.key] = data;
            } catch (e) {
              next[field.key] = null;
              nextErrors[field.key] = e.message || "Failed to load options";
            }
          })
        );

        if (!cancelled) {
          setCatalogues(next);
          setErrors(nextErrors);
        }
      } catch (e) {
        if (!cancelled) {
          setErrors({
            cabinets: e.message || "Failed to load kitchen colour options",
          });
          setCatalogues({ cabinets: null, benchtopLaminate: null, benchtopStone: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
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

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: "16px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {KITCHEN_FIELDS.map((field) => (
          <KitchenColourColumn
            key={field.key}
            field={field}
            catalogue={catalogues[field.key]}
            value={values[field.key]}
            selected={selectedSamples[field.key]}
            loading={loading}
            loadError={errors[field.key]}
            saveError={errors[`${field.key}Save`]}
            saving={savingKey === field.key}
            onChange={(next) => void handleChange(field, next)}
          />
        ))}
      </div>
    </div>
  );
}
