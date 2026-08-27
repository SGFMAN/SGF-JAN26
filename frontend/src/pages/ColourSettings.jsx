import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AuthedImg from "../components/AuthedImg";
import ModalBackdrop from "../components/ModalBackdrop";
import Building3DModal from "../components/Building3DModal.jsx";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import {
  COLORBOND_RANGE_KEY,
  COLOUR_SECTION_RANGE_KEYS,
  COLOUR_SECTION_RANGE_LABELS,
  emptyColourSectionRanges,
  normalizeColourSectionRanges,
} from "../constants/colourSectionRanges";
import {
  DEFAULT_BUILDING_3D,
  STUMP_STYLE_OPTIONS,
  SUBFLOOR_TYPE_OPTIONS,
  building3dDraftFromDefaults,
  normalizeBuilding3dDefaults,
  resolvedSubfloorDrawType,
} from "../constants/building3dDefaults";
import {
  BUILDING_ELEMENT_GROUPS,
  BUILDING_ELEMENT_VISIBILITY_GROUPS,
  emptyBuildingElementMaterials,
  normalizeBuildingElementMaterials,
  normalizeElementVisibility,
} from "../constants/buildingElements";
import { getApiHeaders } from "../utils/auth";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import { MENU, UI } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";
const DELETE_COLOUR_BUTTON_ID = 2;
/** DB colour groups copy chosen images into Colours and Finishes\{group}\{subgroup}\{name}{ext}. */

const SETTINGS_TABS = [
  { id: "colours", label: "Colours and Groups" },
  { id: "ranges", label: "Colour Ranges" },
  { id: "materials", label: "Materials" },
  { id: "elements", label: "Building Elements" },
  { id: "model", label: "3D Model" },
];
const SETTINGS_TAB_WIDTH = `calc(${Math.max(...SETTINGS_TABS.map((t) => t.label.length))}ch + 28px)`;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const MODEL_DEFAULT_FIELDS = [
  { key: "wallHeightM", label: "Wall Height", step: "0.05", min: "1.5", max: "6" },
  { key: "depthM", label: "Building Width", step: "0.1", min: "2", max: "20" },
  { key: "widthM", label: "Building Length", step: "0.1", min: "2", max: "40" },
];
const SUBFLOOR_HEIGHT_FIELD = {
  step: "0.05",
  min: "0.15",
  max: "3",
};
const MODEL_MENU_SECTIONS = [
  {
    id: "subfloor",
    label: "Subfloor",
    fields: [],
    includeSubfloorType: true,
  },
  {
    id: "wall",
    label: "Wall",
    fields: [MODEL_DEFAULT_FIELDS[0]],
  },
  {
    id: "general",
    label: "General",
    fields: [MODEL_DEFAULT_FIELDS[1], MODEL_DEFAULT_FIELDS[2]],
  },
];

const SECTION_TITLE_SIZE = "0.9rem";
const LIST_ROW_GAP = "6px";
const LIST_SWATCH_SIZE = 28;
/** Shared height for group + colour rows (padding + swatch). */
const LIST_ROW_HEIGHT = 48;
const listRowBaseStyle = {
  background: "transparent",
  border: "1px solid #ddd",
  borderRadius: "8px",
  padding: "0 8px",
  height: LIST_ROW_HEIGHT,
  minHeight: LIST_ROW_HEIGHT,
  maxHeight: LIST_ROW_HEIGHT,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const listSwatchStyle = {
  width: LIST_SWATCH_SIZE,
  height: LIST_SWATCH_SIZE,
  borderRadius: "4px",
  border: "1px solid #ccc",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: UI.inputBg,
  overflow: "hidden",
  boxSizing: "border-box",
};

function sortButtonStyle(active) {
  return {
    padding: "8px 14px",
    borderRadius: "8px",
    border: active ? `1px solid ${MONUMENT}` : "1px solid #ddd",
    background: active ? MONUMENT : WHITE,
    color: active ? WHITE : MONUMENT,
    fontSize: SECTION_TITLE_SIZE,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    textAlign: "center",
  };
}

/** Stack Sort / Sub Groups / Add so all share the longest label width. */
const colourActionButtonColumnStyle = {
  display: "inline-flex",
  flexDirection: "column",
  gap: "8px",
  width: "max-content",
  maxWidth: "100%",
  alignItems: "stretch",
};

function sectionHeadingStyle() {
  return {
    fontSize: SECTION_TITLE_SIZE,
    margin: 0,
    color: MONUMENT,
    fontWeight: 600,
    lineHeight: 1.3,
  };
}

function sectionHeaderBlockStyle() {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "8px",
    flexShrink: 0,
  };
}

function mergeButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved } : fallback;
}

const FLYOUT_EDGE_PAD_PX = 8;

function flyoutClipBounds(el) {
  let top = 0;
  let bottom = window.innerHeight;
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === "hidden" || overflowY === "auto" || overflowY === "scroll" || overflowY === "clip") {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    node = node.parentElement;
  }
  return { top: top + FLYOUT_EDGE_PAD_PX, bottom: bottom - FLYOUT_EDGE_PAD_PX };
}

function ViewportClampedFlyout({ open, width, zIndex, gap = "8px", children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return undefined;
    const clamp = () => {
      el.style.transform = "none";
      el.style.maxHeight = "";
      el.style.overflowY = "visible";
      const clip = flyoutClipBounds(el);
      const available = Math.max(96, clip.bottom - clip.top);
      let rect = el.getBoundingClientRect();
      if (rect.height > available) {
        el.style.maxHeight = `${available}px`;
        el.style.overflowY = "auto";
        rect = el.getBoundingClientRect();
      }
      let shift = 0;
      if (rect.bottom > clip.bottom) shift = clip.bottom - rect.bottom;
      if (rect.top + shift < clip.top) shift = clip.top - rect.top;
      el.style.transform = shift ? `translateY(${shift}px)` : "none";
    };
    clamp();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(clamp) : null;
    observer?.observe(el);
    window.addEventListener("resize", clamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", clamp);
    };
  }, [open, children]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        right: "100%",
        top: 0,
        marginRight: "8px",
        width,
        display: "flex",
        flexDirection: "column",
        gap,
        padding: "12px",
        boxSizing: "border-box",
        background: WHITE,
        borderRadius: "12px",
        border: "1px solid #ddd",
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        zIndex,
      }}
    >
      {children}
    </div>
  );
}

export default function ColourSettings() {
  const [groupCatalogue, setGroupCatalogue] = useState(null);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sortMode, setSortMode] = useState("group"); // "group" | "alpha"
  const [showModal, setShowModal] = useState(false);
  const [showSubgroupsModal, setShowSubgroupsModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [colourGroups, setColourGroups] = useState([]);
  const [groupDraftName, setGroupDraftName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [coloursAndFinishesPath, setColoursAndFinishesPath] = useState("");
  const [sectionRanges, setSectionRanges] = useState(() => emptyColourSectionRanges());
  const [sectionRangesSaving, setSectionRangesSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState("colours");
  const [materials, setMaterials] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [materialDraftName, setMaterialDraftName] = useState("");
  const [editingMaterial, setEditingMaterial] = useState(false);
  const [editingMaterialName, setEditingMaterialName] = useState("");
  const [materialSaving, setMaterialSaving] = useState(false);
  const [elementMaterials, setElementMaterials] = useState(() => emptyBuildingElementMaterials());
  const [elementMaterialsSaving, setElementMaterialsSaving] = useState(false);
  const [modelDefaults, setModelDefaults] = useState(() => DEFAULT_BUILDING_3D);
  const [modelDraft, setModelDraft] = useState(() => building3dDraftFromDefaults(DEFAULT_BUILDING_3D));
  const [modelDefaultsSaving, setModelDefaultsSaving] = useState(false);
  const [modelDefaultsSaveError, setModelDefaultsSaveError] = useState("");
  const [modelMenuOpenId, setModelMenuOpenId] = useState(null);
  const [modelSubfloorTypeMenuOpen, setModelSubfloorTypeMenuOpen] = useState(null);
  const [modelStumpStyleMenuOpen, setModelStumpStyleMenuOpen] = useState(false);
  const modelMenuLeaveTimerRef = useRef(null);
  const [subgroupDraftName, setSubgroupDraftName] = useState("");
  const [editingSubgroupId, setEditingSubgroupId] = useState(null);
  const [editingSubgroupName, setEditingSubgroupName] = useState("");
  const [subgroupSaving, setSubgroupSaving] = useState(false);
  const [editingSample, setEditingSample] = useState(null);
  const [isAddColourModal, setIsAddColourModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    subgroupId: "",
    imagePreview: "",
    imageFilename: "",
  });
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const listScrollRef = useRef(null);
  const restoreSampleIdRef = useRef(null);
  const restoreScrollTopRef = useRef(null);
  const pendingRestoreRef = useRef(false);

  const loadGroupCatalogue = useCallback(async (groupKey, { silent = false } = {}) => {
    const key = String(groupKey || "").trim();
    if (!key || key === "colorbond") {
      if (!silent) setGroupCatalogue(null);
      return;
    }
    try {
      if (!silent) setLoadingCatalogue(true);
      setLoadError("");
      const res = await fetch(`${API_URL}/api/colour-groups/${encodeURIComponent(key)}/catalogue`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setGroupCatalogue(data);
    } catch (e) {
      console.error(e);
      setLoadError(e.message || "Failed to load colours");
      if (!silent) setGroupCatalogue(null);
    } finally {
      if (!silent) setLoadingCatalogue(false);
    }
  }, []);

  const reloadActiveCatalogue = useCallback(
    async ({ silent = false } = {}) => {
      if (!selectedGroup || selectedGroup === "colorbond") return;
      await loadGroupCatalogue(selectedGroup, { silent });
    },
    [loadGroupCatalogue, selectedGroup]
  );

  const loadColourGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/colour-groups`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error((data && data.error) || `Failed (${res.status})`);
      setColourGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setColourGroups([]);
    }
  }, []);

  const loadColoursAndFinishesPath = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setColoursAndFinishesPath(String(data.colours_and_finishes_path || "").trim());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadSectionRanges = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/colour-section-ranges`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setSectionRanges(normalizeColourSectionRanges(data.ranges));
    } catch (e) {
      console.error(e);
      setSectionRanges(emptyColourSectionRanges());
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/materials`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data && data.error) || `Failed (${res.status})`);
      const list = Array.isArray(data) ? data : [];
      setMaterials(list);
      setSelectedMaterialId((prev) => {
        if (prev != null && list.some((m) => m.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      console.error(e);
      setMaterials([]);
      setSelectedMaterialId(null);
    }
  }, []);

  const loadBuildingElementMaterials = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/building-element-materials`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setElementMaterials(normalizeBuildingElementMaterials(data.assignments));
    } catch (e) {
      console.error(e);
      setElementMaterials(emptyBuildingElementMaterials());
    }
  }, []);

  const loadBuilding3dDefaults = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/building-3d-defaults`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const next = normalizeBuilding3dDefaults(data.defaults);
      setModelDefaults(next);
      setModelDraft(building3dDraftFromDefaults(next));
      setModelDefaultsSaveError("");
    } catch (e) {
      console.error(e);
      setModelDefaults(DEFAULT_BUILDING_3D);
      setModelDraft(building3dDraftFromDefaults(DEFAULT_BUILDING_3D));
    }
  }, []);

  useEffect(() => {
    void loadColourGroups();
    void loadColoursAndFinishesPath();
    void loadSectionRanges();
    void loadMaterials();
    void loadBuildingElementMaterials();
    void loadBuilding3dDefaults();
  }, [loadColourGroups, loadColoursAndFinishesPath, loadSectionRanges, loadMaterials, loadBuildingElementMaterials, loadBuilding3dDefaults]);

  useEffect(() => {
    if (!selectedGroup || selectedGroup === "colorbond") {
      setGroupCatalogue(null);
      setLoadError("");
      setLoadingCatalogue(false);
      return;
    }
    void loadGroupCatalogue(selectedGroup);
  }, [selectedGroup, loadGroupCatalogue]);

  const previewModel = useMemo(() => normalizeBuilding3dDefaults(modelDraft), [modelDraft]);

  useEffect(() => {
    const next = previewModel;
    const unchanged =
      next.megaAnchorsHeightM === modelDefaults.megaAnchorsHeightM &&
      next.concreteStumpsHeightM === modelDefaults.concreteStumpsHeightM &&
      next.bearerHeightM === modelDefaults.bearerHeightM &&
      next.joistHeightM === modelDefaults.joistHeightM &&
      next.bearerWidthM === modelDefaults.bearerWidthM &&
      next.joistWidthM === modelDefaults.joistWidthM &&
      next.bearerSpanMaxM === modelDefaults.bearerSpanMaxM &&
      next.joistSpanMaxM === modelDefaults.joistSpanMaxM &&
      next.slabHeightM === modelDefaults.slabHeightM &&
      next.wallHeightM === modelDefaults.wallHeightM &&
      next.widthM === modelDefaults.widthM &&
      next.depthM === modelDefaults.depthM &&
      next.subfloorType === modelDefaults.subfloorType &&
      next.stumpStyle === modelDefaults.stumpStyle &&
      JSON.stringify(next.elementVisibility) === JSON.stringify(modelDefaults.elementVisibility);
    if (unchanged) return undefined;
    const heightKeys = SUBFLOOR_TYPE_OPTIONS.map((option) => option.heightKey);
    const extraKeys = SUBFLOOR_TYPE_OPTIONS.flatMap((option) =>
      (option.extraFields || []).map((field) => field.key)
    );
    const allNumeric = [
      ...MODEL_DEFAULT_FIELDS.map((field) => field.key),
      ...heightKeys,
      ...extraKeys,
    ].every((key) => Number.isFinite(Number(String(modelDraft[key] ?? "").trim())));
    if (!allNumeric) return undefined;
    const timer = setTimeout(async () => {
      try {
        setModelDefaultsSaving(true);
        setModelDefaultsSaveError("");
        const res = await fetch(`${API_URL}/api/building-3d-defaults`, {
          method: "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({ defaults: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        const saved = normalizeBuilding3dDefaults(data.defaults);
        setModelDefaults(saved);
      } catch (err) {
        console.error(err);
        setModelDefaultsSaveError(err.message || "Failed to save 3D defaults");
      } finally {
        setModelDefaultsSaving(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [modelDraft, modelDefaults, previewModel]);

  const rangeSelectOptions = useMemo(() => {
    const options = [{ key: COLORBOND_RANGE_KEY, label: "Colorbond" }];
    for (const group of colourGroups) {
      const key = String(group.key || "").trim();
      if (!key || key === COLORBOND_RANGE_KEY) continue;
      options.push({ key, label: group.name || key });
    }
    return options;
  }, [colourGroups]);

  async function handleSectionRangeChange(sectionKey, rangeKey) {
    const next = normalizeColourSectionRanges({
      ...sectionRanges,
      [sectionKey]: rangeKey,
    });
    setSectionRanges(next);
    try {
      setSectionRangesSaving(true);
      const res = await fetch(`${API_URL}/api/colour-section-ranges`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ ranges: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setSectionRanges(normalizeColourSectionRanges(data.ranges));
    } catch (err) {
      alert(err.message || "Failed to save colour range");
      await loadSectionRanges();
    } finally {
      setSectionRangesSaving(false);
    }
  }

  async function handleBuildingElementMaterialChange(elementKey, materialId) {
    const next = normalizeBuildingElementMaterials({
      ...elementMaterials,
      [elementKey]: materialId,
    });
    setElementMaterials(next);
    try {
      setElementMaterialsSaving(true);
      const res = await fetch(`${API_URL}/api/building-element-materials`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ assignments: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setElementMaterials(normalizeBuildingElementMaterials(data.assignments));
    } catch (err) {
      alert(err.message || "Failed to save building element material");
      await loadBuildingElementMaterials();
    } finally {
      setElementMaterialsSaving(false);
    }
  }

  async function handleAddMaterial(e) {
    e?.preventDefault?.();
    const name = materialDraftName.trim();
    if (!name) {
      alert("Enter a material name.");
      return;
    }
    try {
      setMaterialSaving(true);
      const res = await fetch(`${API_URL}/api/materials`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setMaterialDraftName("");
      setEditingMaterial(false);
      setEditingMaterialName("");
      await loadMaterials();
      if (data?.id != null) setSelectedMaterialId(data.id);
    } catch (err) {
      alert(err.message || "Failed to add material");
    } finally {
      setMaterialSaving(false);
    }
  }

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId) || null,
    [materials, selectedMaterialId]
  );

  function startEditMaterial() {
    if (!selectedMaterial) return;
    setEditingMaterial(true);
    setEditingMaterialName(selectedMaterial.name || "");
  }

  function cancelEditMaterial() {
    setEditingMaterial(false);
    setEditingMaterialName("");
  }

  async function handleSaveMaterial(e) {
    e?.preventDefault?.();
    if (!selectedMaterialId) return;
    const name = editingMaterialName.trim();
    if (!name) {
      alert("Enter a material name.");
      return;
    }
    try {
      setMaterialSaving(true);
      const res = await fetch(`${API_URL}/api/materials/${selectedMaterialId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingMaterial(false);
      setEditingMaterialName("");
      await loadMaterials();
    } catch (err) {
      alert(err.message || "Failed to update material");
    } finally {
      setMaterialSaving(false);
    }
  }

  async function handleDeleteMaterial() {
    if (!selectedMaterial?.id) return;
    if (!window.confirm(`Delete material "${selectedMaterial.name}"?`)) return;
    try {
      setMaterialSaving(true);
      const res = await fetch(`${API_URL}/api/materials/${selectedMaterial.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      cancelEditMaterial();
      setSelectedMaterialId(null);
      await loadMaterials();
    } catch (err) {
      alert(err.message || "Failed to delete material");
    } finally {
      setMaterialSaving(false);
    }
  }

  const activeColourGroupName = useMemo(() => {
    if (!selectedGroup || selectedGroup === "colorbond") return "";
    if (groupCatalogue?.name) return groupCatalogue.name;
    const match = colourGroups.find((g) => g.key === selectedGroup);
    return match?.name || "";
  }, [selectedGroup, groupCatalogue, colourGroups]);

  const isDbColourGroup = Boolean(selectedGroup && selectedGroup !== "colorbond");
  const usesColourImageCopy = isDbColourGroup;
  const canManageSubgroups = isDbColourGroup;

  function buildColourImageFullPath(filename) {
    const file = String(filename || "")
      .trim()
      .replace(/^.*[\\/]/, "");
    if (!file) return "";
    const base = String(coloursAndFinishesPath || "").trim().replace(/[\\/]+$/, "");
    const groupName = String(activeColourGroupName || "").trim();
    if (!base || !groupName) return file;
    const sep = /\\/.test(base) || /^[A-Za-z]:/.test(base) ? "\\" : "/";
    return `${base}${sep}${groupName}${sep}${file}`;
  }

  function captureListPosition(preferredSampleId = null) {
    const scroller = listScrollRef.current;
    if (scroller) restoreScrollTopRef.current = scroller.scrollTop;
    if (preferredSampleId != null) {
      restoreSampleIdRef.current = preferredSampleId;
      return;
    }
    if (!scroller) return;
    const rows = scroller.querySelectorAll("[data-sample-id]");
    const scrollerTop = scroller.getBoundingClientRect().top;
    let bestId = null;
    let bestDist = Infinity;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const dist = Math.abs(rect.top - scrollerTop);
      if (rect.bottom > scrollerTop + 8 && dist < bestDist) {
        bestDist = dist;
        bestId = row.getAttribute("data-sample-id");
      }
    });
    if (bestId != null) restoreSampleIdRef.current = bestId;
  }

  function requestListRestore(preferredSampleId = null) {
    captureListPosition(preferredSampleId);
    pendingRestoreRef.current = true;
  }

  function restoreListPosition() {
    if (!pendingRestoreRef.current) return;
    const scroller = listScrollRef.current;
    if (!scroller) return;
    const sampleId = restoreSampleIdRef.current;
    const row =
      sampleId != null
        ? scroller.querySelector(`[data-sample-id="${CSS.escape(String(sampleId))}"]`)
        : null;
    if (row) {
      row.scrollIntoView({ block: "center", inline: "nearest" });
      pendingRestoreRef.current = false;
      return;
    }
    if (restoreScrollTopRef.current != null) {
      scroller.scrollTop = restoreScrollTopRef.current;
    }
    pendingRestoreRef.current = false;
  }

  useEffect(() => {
    if (loadingCatalogue || showModal || showSubgroupsModal) return;
    if (!pendingRestoreRef.current) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => restoreListPosition());
    });
    return () => window.cancelAnimationFrame(id);
  }, [loadingCatalogue, showModal, showSubgroupsModal, sortMode, groupCatalogue, selectedGroup]);

  const getColourHex = (r, g, b) => {
    return `#${[r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")}`;
  };

  const subgroups = groupCatalogue?.subgroups || [];

  const displayedSamples = useMemo(() => {
    const out = [];
    for (const sg of subgroups) {
      for (const sample of sg.samples || []) {
        out.push({ sample, subgroup: sg });
      }
    }
    if (sortMode === "alpha") {
      return out.sort((a, b) =>
        String(a.sample.name || "").localeCompare(String(b.sample.name || ""), undefined, {
          sensitivity: "base",
        })
      );
    }
    // Keep catalogue subgroup order from the API.
    return out;
  }, [subgroups, sortMode]);

  const colorbondColours = useMemo(() => {
    if (sortMode === "alpha") {
      return [...COLORBOND_COLOURS].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
    }
    return COLORBOND_COLOURS;
  }, [sortMode]);

  const handleColorClick = (sample, subgroup) => {
    requestListRestore(sample?.id ?? null);
    setIsAddColourModal(false);
    setEditingSample(sample);
    setPendingImageFile(null);
    setEditForm({
      name: sample.name || "",
      subgroupId: String(subgroup.id),
      imagePreview: sample.image_url || "",
      imageFilename: sample.image_filename || "",
    });
    setShowModal(true);
  };

  function openAddColourModal() {
    const availableSubgroups = groupCatalogue?.subgroups || [];
    if (!availableSubgroups.length) {
      alert("Add a subgroup first before adding a colour.");
      return;
    }
    requestListRestore();
    setIsAddColourModal(true);
    setEditingSample(null);
    setPendingImageFile(null);
    setEditForm({
      name: "",
      subgroupId: String(availableSubgroups[0].id),
      imagePreview: "",
      imageFilename: "",
    });
    setShowModal(true);
  }

  const handleModalClose = () => {
    if (saving) return;
    requestListRestore(editingSample?.id ?? restoreSampleIdRef.current);
    setShowModal(false);
    setIsAddColourModal(false);
    setEditingSample(null);
    setPendingImageFile(null);
    setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFilename: "" });
  };

  const handleModalOk = async () => {
    if (!editForm.name.trim() || !editForm.subgroupId) return;
    if (!isAddColourModal && !editingSample?.id) return;
    try {
      setSaving(true);
      const url = isAddColourModal
        ? `${API_URL}/api/colour-samples`
        : `${API_URL}/api/colour-samples/${editingSample.id}`;
      let res;
      if (usesColourImageCopy && pendingImageFile) {
        const form = new FormData();
        form.append("name", editForm.name.trim());
        form.append("subgroup_id", editForm.subgroupId);
        form.append("image", pendingImageFile);
        const headers = { ...getApiHeaders() };
        delete headers["Content-Type"];
        res = await fetch(url, {
          method: isAddColourModal ? "POST" : "PUT",
          headers,
          body: form,
        });
      } else {
        res = await fetch(url, {
          method: isAddColourModal ? "POST" : "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({
            name: editForm.name.trim(),
            subgroup_id: editForm.subgroupId,
            // Path-only for non-copy groups; copy groups keep existing image unless a new file is chosen
            image_filename: usesColourImageCopy ? undefined : editForm.imageFilename || null,
          }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      requestListRestore(isAddColourModal ? data?.id ?? null : editingSample.id);
      await reloadActiveCatalogue({ silent: true });
      setShowModal(false);
      setIsAddColourModal(false);
      setEditingSample(null);
      setPendingImageFile(null);
      setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFilename: "" });
    } catch (e) {
      alert(e.message || (isAddColourModal ? "Failed to add colour" : "Failed to save sample"));
    } finally {
      setSaving(false);
    }
  };

  const handleModalDelete = async () => {
    if (isAddColourModal || !editingSample?.id) return;
    if (!window.confirm(`Delete colour "${editingSample.name}"?`)) return;
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/colour-samples/${editingSample.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      requestListRestore(null);
      await reloadActiveCatalogue({ silent: true });
      setShowModal(false);
      setIsAddColourModal(false);
      setEditingSample(null);
      setPendingImageFile(null);
      setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFilename: "" });
    } catch (e) {
      alert(e.message || "Failed to delete sample");
    } finally {
      setSaving(false);
    }
  };

  function openSubgroupsModal() {
    requestListRestore();
    setSubgroupDraftName("");
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
    setShowSubgroupsModal(true);
  }

  function closeSubgroupsModal() {
    if (subgroupSaving) return;
    requestListRestore(restoreSampleIdRef.current);
    setShowSubgroupsModal(false);
    setSubgroupDraftName("");
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
  }

  function openGroupsModal() {
    setGroupDraftName("");
    setEditingGroupId(null);
    setEditingGroupName("");
    setShowGroupsModal(true);
    void loadColourGroups();
  }

  function closeGroupsModal() {
    if (groupSaving) return;
    setShowGroupsModal(false);
    setGroupDraftName("");
    setEditingGroupId(null);
    setEditingGroupName("");
  }

  async function handleAddGroup(e) {
    e?.preventDefault?.();
    const name = groupDraftName.trim();
    if (!name) {
      alert("Enter a group name.");
      return;
    }
    try {
      setGroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-groups`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setGroupDraftName("");
      await loadColourGroups();
    } catch (err) {
      alert(err.message || "Failed to add colour group");
    } finally {
      setGroupSaving(false);
    }
  }

  function startEditGroup(group) {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name || "");
  }

  function cancelEditGroup() {
    setEditingGroupId(null);
    setEditingGroupName("");
  }

  async function handleSaveGroup(e) {
    e?.preventDefault?.();
    if (!editingGroupId) return;
    const name = editingGroupName.trim();
    if (!name) {
      alert("Enter a group name.");
      return;
    }
    try {
      setGroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-groups/${editingGroupId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingGroupId(null);
      setEditingGroupName("");
      await loadColourGroups();
      await reloadActiveCatalogue({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to update colour group");
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleDeleteGroup(group) {
    if (!group?.id) return;
    const sampleCount = Number(group.sample_count) || 0;
    const subgroupCount = Number(group.subgroup_count) || 0;
    const detail =
      sampleCount || subgroupCount
        ? ` This will also delete ${subgroupCount} subgroup${subgroupCount === 1 ? "" : "s"} and ${sampleCount} colour${sampleCount === 1 ? "" : "s"}.`
        : "";
    if (!window.confirm(`Delete colour group "${group.name}"?${detail}`)) return;
    try {
      setGroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-groups/${group.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (editingGroupId === group.id) {
        setEditingGroupId(null);
        setEditingGroupName("");
      }
      if (selectedGroup === group.key) {
        setSelectedGroup(null);
      }
      await loadColourGroups();
      await reloadActiveCatalogue({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to delete colour group");
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleAddSubgroup(e) {
    e?.preventDefault?.();
    const name = subgroupDraftName.trim();
    if (!name) {
      alert("Enter a subgroup name.");
      return;
    }
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ name, group_key: selectedGroup }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setSubgroupDraftName("");
      requestListRestore(restoreSampleIdRef.current);
      await reloadActiveCatalogue({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to add subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  function startEditSubgroup(subgroup) {
    setEditingSubgroupId(subgroup.id);
    setEditingSubgroupName(subgroup.name || "");
  }

  function cancelEditSubgroup() {
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
  }

  async function handleSaveSubgroup(e) {
    e?.preventDefault?.();
    if (!editingSubgroupId) return;
    const name = editingSubgroupName.trim();
    if (!name) {
      alert("Enter a subgroup name.");
      return;
    }
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups/${editingSubgroupId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingSubgroupId(null);
      setEditingSubgroupName("");
      requestListRestore(restoreSampleIdRef.current);
      await reloadActiveCatalogue({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to update subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  async function handleDeleteSubgroup(subgroup) {
    const count = Number(subgroup.sample_count) || (subgroup.samples || []).length || 0;
    const msg =
      count > 0
        ? `Delete subgroup "${subgroup.name}" and its ${count} colour${count === 1 ? "" : "s"}?`
        : `Delete subgroup "${subgroup.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups/${subgroup.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (editingSubgroupId === subgroup.id) {
        setEditingSubgroupId(null);
        setEditingSubgroupName("");
      }
      requestListRestore(restoreSampleIdRef.current);
      await reloadActiveCatalogue({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to delete subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  function handleSortModeToggle() {
    requestListRestore();
    setSortMode((prev) => (prev === "group" ? "alpha" : "group"));
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filename = file.name || "";
    const fullPath = buildColourImageFullPath(filename);
    const localPreview = URL.createObjectURL(file);
    setPendingImageFile(file);
    setEditForm((prev) => {
      if (prev.imagePreview && prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }
      return {
        ...prev,
        imageFilename: usesColourImageCopy ? filename : fullPath || filename,
        imagePreview: localPreview,
      };
    });
  };

  const deleteButtonFallbackStyle = {
    background: MENU.purple,
    color: MENU.activeText,
    border: `1px solid ${UI.outline}`,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: saving ? "not-allowed" : "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
    boxSizing: "border-box",
    opacity: saving ? 0.65 : 1,
  };
  const deleteButtonStyle = mergeButtonStyle(DELETE_COLOUR_BUTTON_ID, deleteButtonFallbackStyle);
  const deleteUsesSavedStyle = Boolean(buildSavedButtonStyle(DELETE_COLOUR_BUTTON_ID, true));

  const modelNumberInputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: SECTION_TITLE_SIZE,
    fontWeight: 600,
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
    minHeight: LIST_ROW_HEIGHT,
  };

  function openModelMenu(id) {
    if (modelMenuLeaveTimerRef.current) {
      clearTimeout(modelMenuLeaveTimerRef.current);
      modelMenuLeaveTimerRef.current = null;
    }
    setModelMenuOpenId(id);
    if (id !== "subfloor") {
      setModelSubfloorTypeMenuOpen(null);
      setModelStumpStyleMenuOpen(false);
    }
  }

  function scheduleCloseModelMenu() {
    if (modelMenuLeaveTimerRef.current) clearTimeout(modelMenuLeaveTimerRef.current);
    modelMenuLeaveTimerRef.current = setTimeout(() => {
      setModelMenuOpenId(null);
      setModelSubfloorTypeMenuOpen(null);
      setModelStumpStyleMenuOpen(false);
    }, 160);
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        overflow: settingsTab === "model" ? "hidden" : "auto",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: "10px 16px",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600, flexShrink: 0 }}>
          Colour Settings
        </h2>
        {SETTINGS_TABS.map((tab) => {
          const selected = settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              style={{
                width: SETTINGS_TAB_WIDTH,
                padding: "10px 14px",
                border: FIELD_OUTLINE,
                borderRadius: "8px",
                background: selected ? MENU.purple : WHITE,
                color: selected ? MENU.activeText : MONUMENT,
                fontSize: "1rem",
                fontWeight: 500,
                textAlign: "center",
                cursor: "pointer",
                transition: "background 0.17s, color 0.17s",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {settingsTab === "colours" ? (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "24px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={sectionHeaderBlockStyle()}>
            <h3 style={sectionHeadingStyle()}>Color Groups</h3>
            <button type="button" onClick={openGroupsModal} style={sortButtonStyle(false)}>
              Group Manager
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: LIST_ROW_GAP,
              overflowY: "auto",
              paddingRight: "8px",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              onClick={() => setSelectedGroup("colorbond")}
              style={{
                ...listRowBaseStyle,
                cursor: "pointer",
                transition: "background 0.2s",
                backgroundColor: selectedGroup === "colorbond" ? UI.inputBg : "transparent",
                outline: selectedGroup === "colorbond" ? `1px solid ${MONUMENT}` : "none",
                outlineOffset: "-1px",
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== "colorbond") e.currentTarget.style.backgroundColor = UI.inputBg;
              }}
              onMouseLeave={(e) => {
                if (selectedGroup !== "colorbond") e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ ...listSwatchStyle, visibility: "hidden" }} aria-hidden />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Colorbond [{COLORBOND_COLOURS.length}]
              </div>
            </div>

            {colourGroups.map((group) => {
              const isSelected = selectedGroup === group.key;
              const sampleCount = Number(group.sample_count) || 0;
              const label = `${group.name || group.key} [${sampleCount}]`;
              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group.key)}
                  style={{
                    ...listRowBaseStyle,
                    cursor: "pointer",
                    transition: "background 0.2s",
                    backgroundColor: isSelected ? UI.inputBg : "transparent",
                    outline: isSelected ? `1px solid ${MONUMENT}` : "none",
                    outlineOffset: "-1px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = UI.inputBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{ ...listSwatchStyle, visibility: "hidden" }} aria-hidden />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {selectedGroup === "colorbond" && (
            <div style={sectionHeaderBlockStyle()}>
              <h3 style={sectionHeadingStyle()}>Colorbond Colours</h3>
              <div style={colourActionButtonColumnStyle}>
                <button type="button" onClick={handleSortModeToggle} style={sortButtonStyle(true)}>
                  {sortMode === "group" ? "Sort Alphabetically" : "Sort by Group"}
                </button>
              </div>
            </div>
          )}

          {isDbColourGroup && (
            <div style={sectionHeaderBlockStyle()}>
              <h3 style={sectionHeadingStyle()}>
                {groupCatalogue?.name || activeColourGroupName || "Colours"}
              </h3>
              <div style={colourActionButtonColumnStyle}>
                <button type="button" onClick={handleSortModeToggle} style={sortButtonStyle(true)}>
                  {sortMode === "group" ? "Sort Alphabetically" : "Sort by Group"}
                </button>
                {canManageSubgroups ? (
                  <button type="button" onClick={openSubgroupsModal} style={sortButtonStyle(false)}>
                    Sub Groups
                  </button>
                ) : null}
                <button type="button" onClick={openAddColourModal} style={sortButtonStyle(false)}>
                  Add
                </button>
              </div>
            </div>
          )}

          <div
            ref={listScrollRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              overflowY: "auto",
              paddingRight: "8px",
              flex: 1,
              minHeight: 0,
            }}
          >
          {selectedGroup === "colorbond" && (
            <div style={{ display: "flex", flexDirection: "column", gap: LIST_ROW_GAP }}>
              {colorbondColours.map((colour, index) => {
                const hex = getColourHex(colour.r, colour.g, colour.b);
                return (
                  <div
                    key={`${colour.name}-${index}`}
                    data-sample-id={`colorbond-${colour.name}`}
                    style={listRowBaseStyle}
                  >
                    <div
                      style={{
                        ...listSwatchStyle,
                        backgroundColor: hex,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: MONUMENT,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {colour.name}
                      </div>
                      <div
                        style={{
                          flexShrink: 0,
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: UI.textMuted,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Colorbond
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isDbColourGroup && (
            <>
              {loadingCatalogue ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>Loading…</div>
              ) : loadError ? (
                <div style={{ color: "#842029", fontSize: "0.9rem" }}>{loadError}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: LIST_ROW_GAP }}>
                  {displayedSamples.map(({ sample, subgroup }) => (
                    <div
                      key={sample.id}
                      data-sample-id={sample.id}
                      onClick={() => handleColorClick(sample, subgroup)}
                      style={{
                        ...listRowBaseStyle,
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = UI.inputBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        style={{
                          ...listSwatchStyle,
                          ...(sample.r != null && sample.g != null && sample.b != null
                            ? {
                                backgroundColor: `#${[sample.r, sample.g, sample.b]
                                  .map((x) => {
                                    const hex = Number(x).toString(16);
                                    return hex.length === 1 ? `0${hex}` : hex;
                                  })
                                  .join("")}`,
                              }
                            : null),
                        }}
                      >
                        {sample.r != null && sample.g != null && sample.b != null ? null : sample.image_url ? (
                          <AuthedImg
                            src={sample.image_url}
                            alt={sample.name}
                            fallback={
                              <div
                                style={{
                                  fontSize: "6px",
                                  color: "var(--sgf-text-primary)",
                                  fontWeight: 600,
                                  textAlign: "center",
                                  lineHeight: "1",
                                  letterSpacing: "0.3px",
                                }}
                              >
                                Soon
                              </div>
                            }
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              fontSize: "6px",
                              color: "var(--sgf-text-primary)",
                              fontWeight: 600,
                              textAlign: "center",
                              lineHeight: "1",
                              letterSpacing: "0.3px",
                            }}
                          >
                            Soon
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: MONUMENT,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sample.name}
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: UI.textMuted,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {subgroup.name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!selectedGroup && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--sgf-text-primary)",
                fontSize: "0.9rem",
              }}
            >
              Select a color group from the left to view colors
            </div>
          )}
          </div>
        </div>
      </div>
      ) : null}

      {settingsTab === "ranges" ? (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "24px",
          flex: 1,
          minHeight: 0,
        }}
      >
        {[COLOUR_SECTION_RANGE_KEYS.slice(0, 6), COLOUR_SECTION_RANGE_KEYS.slice(6)].map(
          (sectionKeys, columnIndex) => (
            <div
              key={columnIndex === 0 ? "colour-ranges-col-3" : "colour-ranges-col-4"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <div style={sectionHeaderBlockStyle()}>
                <h3 style={{ ...sectionHeadingStyle(), visibility: columnIndex === 0 ? "visible" : "hidden" }}>
                  Colour Ranges
                </h3>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  overflowY: "auto",
                  paddingRight: "8px",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {sectionKeys.map((sectionKey) => (
                  <label
                    key={sectionKey}
                    style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                  >
                    <span style={sectionHeadingStyle()}>{COLOUR_SECTION_RANGE_LABELS[sectionKey]}</span>
                    <select
                      value={sectionRanges[sectionKey] || ""}
                      disabled={sectionRangesSaving}
                      onChange={(e) => handleSectionRangeChange(sectionKey, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        fontSize: SECTION_TITLE_SIZE,
                        fontWeight: 600,
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                        minHeight: LIST_ROW_HEIGHT,
                        cursor: sectionRangesSaving ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value="">Nothing selected</option>
                      {rangeSelectOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )
        )}
      </div>
      ) : null}

      {settingsTab === "materials" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
            minHeight: 0,
            maxWidth: "560px",
          }}
        >
          <div style={sectionHeaderBlockStyle()}>
            <h3 style={sectionHeadingStyle()}>Materials</h3>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted }}>
            Used by Colours → External → Cladding - Material.
          </p>
          <form
            onSubmit={handleAddMaterial}
            style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}
          >
            <input
              type="text"
              value={materialDraftName}
              onChange={(e) => setMaterialDraftName(e.target.value)}
              placeholder="New material name"
              disabled={materialSaving}
              style={{
                flex: 1,
                minWidth: "180px",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "0.9rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                minHeight: LIST_ROW_HEIGHT,
              }}
            />
            <button
              type="submit"
              disabled={materialSaving || !materialDraftName.trim()}
              style={{ ...sortButtonStyle(false), width: "auto" }}
            >
              Add
            </button>
          </form>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={selectedMaterialId ?? ""}
              onChange={(e) => {
                const next = e.target.value === "" ? null : Number(e.target.value);
                setSelectedMaterialId(Number.isFinite(next) ? next : null);
                setEditingMaterial(false);
                setEditingMaterialName("");
              }}
              disabled={materialSaving || materials.length === 0}
              style={{
                flex: 1,
                minWidth: "180px",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "0.9rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                minHeight: LIST_ROW_HEIGHT,
              }}
            >
              {materials.length === 0 ? (
                <option value="">No materials yet</option>
              ) : (
                materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={startEditMaterial}
              disabled={materialSaving || !selectedMaterial || editingMaterial}
              style={{ ...sortButtonStyle(false), width: "auto" }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDeleteMaterial}
              disabled={materialSaving || !selectedMaterial}
              style={{ ...sortButtonStyle(false), width: "auto" }}
            >
              Delete
            </button>
          </div>

          {editingMaterial && selectedMaterial ? (
            <form
              onSubmit={handleSaveMaterial}
              style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}
            >
              <input
                type="text"
                value={editingMaterialName}
                onChange={(e) => setEditingMaterialName(e.target.value)}
                disabled={materialSaving}
                autoFocus
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  minHeight: LIST_ROW_HEIGHT,
                }}
              />
              <button
                type="submit"
                disabled={materialSaving || !editingMaterialName.trim()}
                style={{ ...sortButtonStyle(false), width: "auto" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditMaterial}
                disabled={materialSaving}
                style={{ ...sortButtonStyle(false), width: "auto" }}
              >
                Cancel
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {settingsTab === "elements" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
            minHeight: 0,
            maxWidth: "720px",
          }}
        >
          <div style={sectionHeaderBlockStyle()}>
            <h3 style={sectionHeadingStyle()}>Building Elements</h3>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted }}>
            Assign a material from the Materials tab to each building part. Used later for rendering.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              overflowY: "auto",
              paddingRight: "8px",
              flex: 1,
              minHeight: 0,
            }}
          >
            {BUILDING_ELEMENT_GROUPS.map((group) => (
              <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ ...sectionHeadingStyle(), fontSize: "1rem" }}>{group.label}</h4>
                {group.items.map((item) => {
                  const assignedId = String(elementMaterials[item.key] || "");
                  const selectValue = materials.some((m) => String(m.id) === assignedId)
                    ? assignedId
                    : "";
                  return (
                    <label
                      key={item.key}
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "12px",
                        minHeight: LIST_ROW_HEIGHT,
                      }}
                    >
                      <span
                        style={{
                          ...sectionHeadingStyle(),
                          flex: "0 0 200px",
                          width: "200px",
                        }}
                      >
                        {item.label}
                      </span>
                      <select
                        value={selectValue}
                        disabled={elementMaterialsSaving}
                        onChange={(e) =>
                          handleBuildingElementMaterialChange(item.key, e.target.value)
                        }
                        style={{
                          flex: 1,
                          minWidth: "180px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: SECTION_TITLE_SIZE,
                          fontWeight: 600,
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                          minHeight: LIST_ROW_HEIGHT,
                          cursor: elementMaterialsSaving ? "not-allowed" : "pointer",
                        }}
                      >
                        <option value="">Nothing selected</option>
                        {materials.map((material) => (
                          <option key={material.id} value={String(material.id)}>
                            {material.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {settingsTab === "model" ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "row",
            gap: "16px",
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "visible" }}>
            <Building3DModal
              embedded
              title="Base 3D Model"
              widthM={previewModel.widthM}
              depthM={previewModel.depthM}
              subfloorHeightM={previewModel.subfloorHeightM}
              wallHeightM={previewModel.wallHeightM}
              subfloorType={resolvedSubfloorDrawType(previewModel)}
              bearerHeightM={previewModel.bearerHeightM}
              joistHeightM={previewModel.joistHeightM}
              bearerWidthM={previewModel.bearerWidthM}
              joistWidthM={previewModel.joistWidthM}
              bearerSpanMaxM={previewModel.bearerSpanMaxM}
              joistSpanMaxM={previewModel.joistSpanMaxM}
              showFence={previewModel.showFence}
              showSubfloor={previewModel.showSubfloor}
              showWall={previewModel.showWall}
              elementVisibility={previewModel.elementVisibility}
              rightPanel={
          <aside
            style={{
              width: "100%",
              height: "100%",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "14px",
              boxSizing: "border-box",
              background: WHITE,
              borderRadius: "12px",
              border: "1px solid #ddd",
              overflow: "visible",
            }}
          >
            {MODEL_MENU_SECTIONS.map((section) => {
              const open = modelMenuOpenId === section.id;
              return (
                <div
                  key={section.id}
                  style={{ position: "relative", flexShrink: 0 }}
                  onMouseEnter={() => openModelMenu(section.id)}
                  onMouseLeave={scheduleCloseModelMenu}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setModelMenuOpenId((prev) => (prev === section.id ? null : section.id))
                    }
                    style={{
                      ...sortButtonStyle(open),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span>{section.label}</span>
                    <span
                      style={{
                        fontSize: "1.1rem",
                        lineHeight: 1,
                        transform: open ? "translateX(-2px)" : "none",
                        transition: "transform 0.12s ease",
                      }}
                      aria-hidden
                    >
                      ‹
                    </span>
                  </button>
                  {open ? (
                    <ViewportClampedFlyout open={open} width="240px" zIndex={20} gap="12px">
                      {section.fields.map((field) => (
                        <label
                          key={field.key}
                          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                        >
                          <span style={sectionHeadingStyle()}>{field.label} (m)</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={field.step}
                            min={field.min}
                            max={field.max}
                            value={modelDraft[field.key]}
                            onChange={(e) =>
                              setModelDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            onBlur={() =>
                              setModelDraft(building3dDraftFromDefaults(previewModel))
                            }
                            style={modelNumberInputStyle}
                          />
                        </label>
                      ))}
                      {section.includeSubfloorType ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {SUBFLOOR_TYPE_OPTIONS.map((option) => {
                            const selected = modelDraft.subfloorType === option.key;
                            const typeOpen = modelSubfloorTypeMenuOpen === option.key;
                            return (
                              <div key={option.key} style={{ position: "relative" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModelDraft((prev) => ({ ...prev, subfloorType: option.key }));
                                    setModelSubfloorTypeMenuOpen((prev) =>
                                      prev === option.key ? null : option.key
                                    );
                                    if (option.key !== "stumps") setModelStumpStyleMenuOpen(false);
                                  }}
                                  onMouseEnter={() => {
                                    setModelSubfloorTypeMenuOpen(option.key);
                                    if (option.key !== "stumps") setModelStumpStyleMenuOpen(false);
                                  }}
                                  style={{
                                    ...sortButtonStyle(selected || typeOpen),
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                    fontWeight: selected ? 700 : 600,
                                  }}
                                >
                                  <span>{option.label}</span>
                                  <span
                                    style={{
                                      fontSize: "1.1rem",
                                      lineHeight: 1,
                                      transform: typeOpen ? "translateX(-2px)" : "none",
                                      transition: "transform 0.12s ease",
                                    }}
                                    aria-hidden
                                  >
                                    ‹
                                  </span>
                                </button>
                                {typeOpen ? (
                                  <ViewportClampedFlyout
                                    open={typeOpen}
                                    width={option.extraFields?.length ? "420px" : "200px"}
                                    zIndex={21}
                                  >
                                    {option.includeStumpStyle ? (
                                      <div style={{ position: "relative" }}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setModelStumpStyleMenuOpen((prev) => !prev)
                                          }
                                          onMouseEnter={() => setModelStumpStyleMenuOpen(true)}
                                          style={{
                                            ...sortButtonStyle(modelStumpStyleMenuOpen),
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: "8px",
                                          }}
                                        >
                                          <span>Style</span>
                                          <span
                                            style={{
                                              fontSize: "1.1rem",
                                              lineHeight: 1,
                                              transform: modelStumpStyleMenuOpen
                                                ? "translateX(-2px)"
                                                : "none",
                                              transition: "transform 0.12s ease",
                                            }}
                                            aria-hidden
                                          >
                                            ‹
                                          </span>
                                        </button>
                                        <ViewportClampedFlyout
                                          open={modelStumpStyleMenuOpen}
                                          width="200px"
                                          zIndex={22}
                                        >
                                          {STUMP_STYLE_OPTIONS.map((style) => {
                                            const styleSelected =
                                              modelDraft.stumpStyle === style.key;
                                            return (
                                              <button
                                                key={style.key}
                                                type="button"
                                                onClick={() =>
                                                  setModelDraft((prev) => ({
                                                    ...prev,
                                                    subfloorType: "stumps",
                                                    stumpStyle: style.key,
                                                  }))
                                                }
                                                style={{
                                                  ...sortButtonStyle(styleSelected),
                                                  fontWeight: styleSelected ? 700 : 600,
                                                }}
                                              >
                                                {style.label}
                                              </button>
                                            );
                                          })}
                                        </ViewportClampedFlyout>
                                      </div>
                                    ) : null}
                                    <label
                                      style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                                    >
                                      <span style={sectionHeadingStyle()}>
                                        {option.heightLabel} (m)
                                      </span>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        step={SUBFLOOR_HEIGHT_FIELD.step}
                                        min={SUBFLOOR_HEIGHT_FIELD.min}
                                        max={SUBFLOOR_HEIGHT_FIELD.max}
                                        value={modelDraft[option.heightKey]}
                                        onChange={(e) =>
                                          setModelDraft((prev) => ({
                                            ...prev,
                                            subfloorType: option.key,
                                            [option.heightKey]: e.target.value,
                                          }))
                                        }
                                        onBlur={() =>
                                          setModelDraft(building3dDraftFromDefaults(previewModel))
                                        }
                                        style={modelNumberInputStyle}
                                      />
                                    </label>
                                    {(option.extraFields || []).length > 0 ? (
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "1fr 1fr",
                                          gap: "10px 12px",
                                        }}
                                      >
                                        {(option.extraFields || []).map((field) => (
                                          <label
                                            key={field.key}
                                            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                                          >
                                            <span style={sectionHeadingStyle()}>
                                              {field.label} (m)
                                            </span>
                                            <input
                                              type="number"
                                              inputMode="decimal"
                                              step={field.step}
                                              min={field.min}
                                              max={field.max}
                                              value={modelDraft[field.key]}
                                              onChange={(e) =>
                                                setModelDraft((prev) => ({
                                                  ...prev,
                                                  subfloorType: option.key,
                                                  [field.key]: e.target.value,
                                                }))
                                              }
                                              onBlur={() =>
                                                setModelDraft(building3dDraftFromDefaults(previewModel))
                                              }
                                              style={modelNumberInputStyle}
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    ) : null}
                                  </ViewportClampedFlyout>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </ViewportClampedFlyout>
                  ) : null}
                </div>
              );
            })}
            {modelDefaultsSaveError || modelDefaultsSaving ? (
              <div style={{ fontSize: "0.8rem", color: UI.textMuted, lineHeight: 1.4 }}>
                {modelDefaultsSaveError || "Saving…"}
              </div>
            ) : null}
          </aside>
              }
              elementsPanel={
          <aside
            style={{
              width: "100%",
              height: "100%",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              padding: "14px",
              boxSizing: "border-box",
              background: WHITE,
              borderRadius: "12px",
              border: "1px solid #ddd",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                paddingRight: "4px",
              }}
            >
              {BUILDING_ELEMENT_VISIBILITY_GROUPS.map((group) => (
                <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <h4 style={{ ...sectionHeadingStyle(), fontSize: "1rem", margin: 0 }}>
                    {group.label}
                  </h4>
                  {group.items.map((item) => {
                    const vis = normalizeElementVisibility(
                      previewModel.elementVisibility,
                      previewModel
                    );
                    const checked = vis[item.key] !== false;
                    return (
                      <label
                        key={item.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          minHeight: 36,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked;
                            setModelDraft((prev) => {
                              const current = normalizeElementVisibility(
                                prev.elementVisibility,
                                prev
                              );
                              return {
                                ...prev,
                                elementVisibility: {
                                  ...current,
                                  [item.key]: nextChecked,
                                },
                              };
                            });
                          }}
                          style={{
                            width: "16px",
                            height: "16px",
                            flexShrink: 0,
                            cursor: "pointer",
                            accentColor: MONUMENT,
                          }}
                        />
                        <span style={{ ...sectionHeadingStyle(), flex: 1 }}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
              }
            />
          </div>
        </div>
      ) : null}

      {showModal && (editingSample || isAddColourModal) && (
        <ModalBackdrop zIndex={20000} onClick={handleModalClose}>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.3rem", margin: "0 0 20px 0", color: MONUMENT, fontWeight: 600 }}>
              {isAddColourModal ? "Add Color" : "Edit Color"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Subgroup
                </label>
                <select
                  value={editForm.subgroupId}
                  onChange={(e) => setEditForm({ ...editForm, subgroupId: e.target.value })}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    backgroundColor: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select a subgroup</option>
                  {subgroups.map((subgroup) => (
                    <option key={subgroup.id} value={String(subgroup.id)}>
                      {subgroup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Image
                </label>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      flexShrink: 0,
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      background: UI.inputBg,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                    }}
                  >
                    {editForm.imagePreview ? (
                      String(editForm.imagePreview).startsWith("blob:") ||
                      String(editForm.imagePreview).startsWith("data:") ? (
                        <img
                          src={editForm.imagePreview}
                          alt="Selected colour"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : (
                        <AuthedImg
                          src={editForm.imagePreview}
                          alt="Selected colour"
                          fallback={
                            <span
                              style={{
                                color: UI.textMuted,
                                fontSize: "0.75rem",
                                textAlign: "center",
                                padding: "6px",
                              }}
                            >
                              No image
                            </span>
                          }
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      )
                    ) : (
                      <span style={{ color: UI.textMuted, fontSize: "0.75rem", textAlign: "center", padding: "6px" }}>
                        No image
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        boxSizing: "border-box",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    />
                    {editForm.imageFilename || (usesColourImageCopy && pendingImageFile) ? (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "0.85rem",
                          color: UI.textMuted,
                          wordBreak: "break-all",
                        }}
                      >
                        {usesColourImageCopy && pendingImageFile
                          ? (() => {
                              const sg =
                                subgroups.find((s) => String(s.id) === String(editForm.subgroupId))
                                  ?.name || "subgroup";
                              const colourName = editForm.name.trim() || "name";
                              const extMatch = /\.[A-Za-z0-9]+$/.exec(pendingImageFile.name || "");
                              const ext = extMatch ? extMatch[0] : ".jpg";
                              return `Will copy to: {Colours and Finishes}\\${activeColourGroupName || "group"}\\${sg}\\${colourName}${ext}`;
                            })()
                          : `Image path: ${editForm.imageFilename}`}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px", alignItems: "center" }}>
              {!isAddColourModal ? (
                <button
                  type="button"
                  onClick={handleModalDelete}
                  disabled={saving}
                  style={deleteButtonStyle}
                  onMouseEnter={
                    deleteUsesSavedStyle || saving
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = streamColorHover(MENU.purple);
                        }
                  }
                  onMouseLeave={
                    deleteUsesSavedStyle || saving
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = MENU.purple;
                        }
                  }
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleModalClose}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalOk}
                disabled={saving || !editForm.name.trim() || !editForm.subgroupId}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor:
                    saving || !editForm.name.trim() || !editForm.subgroupId ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor:
                    saving || !editForm.name.trim() || !editForm.subgroupId ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {showSubgroupsModal ? (
        <ModalBackdrop
          zIndex={20000}
          onClick={closeSubgroupsModal}
          style={{ padding: "24px", boxSizing: "border-box" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subgroups-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
          >
            <h3
              id="subgroups-modal-title"
              style={{ fontSize: "1.3rem", margin: "0 0 16px 0", color: MONUMENT, fontWeight: 600 }}
            >
              Sub Groups
            </h3>

            <form
              onSubmit={handleAddSubgroup}
              style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center" }}
            >
              <input
                type="text"
                value={subgroupDraftName}
                onChange={(e) => setSubgroupDraftName(e.target.value)}
                placeholder="New subgroup name"
                disabled={subgroupSaving}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={subgroupSaving || !subgroupDraftName.trim()}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderRadius: "8px",
                  background: subgroupSaving || !subgroupDraftName.trim() ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontWeight: 600,
                  cursor: subgroupSaving || !subgroupDraftName.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {subgroups.length === 0 ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>No subgroups yet.</div>
              ) : (
                subgroups.map((subgroup) => {
                  const sampleCount =
                    Number(subgroup.sample_count) || (subgroup.samples || []).length || 0;
                  const isEditing = editingSubgroupId === subgroup.id;
                  return (
                    <div
                      key={subgroup.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 12px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        background: UI.inputBg,
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={handleSaveSubgroup}
                          style={{ display: "flex", flex: 1, gap: "8px", alignItems: "center", minWidth: 0 }}
                        >
                          <input
                            type="text"
                            value={editingSubgroupName}
                            onChange={(e) => setEditingSubgroupName(e.target.value)}
                            disabled={subgroupSaving}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: "8px 10px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              boxSizing: "border-box",
                              minWidth: 0,
                            }}
                          />
                          <button
                            type="submit"
                            disabled={subgroupSaving || !editingSubgroupName.trim()}
                            style={{
                              padding: "8px 12px",
                              border: "none",
                              borderRadius: "8px",
                              background: MONUMENT,
                              color: WHITE,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditSubgroup}
                            disabled={subgroupSaving}
                            style={{
                              padding: "8px 12px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: MONUMENT }}>{subgroup.name}</div>
                            <div style={{ fontSize: "0.78rem", color: UI.textMuted }}>
                              {sampleCount} colour{sampleCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditSubgroup(subgroup)}
                            disabled={subgroupSaving}
                            style={{
                              padding: "7px 12px",
                              border: `1px solid ${MONUMENT}33`,
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: subgroupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubgroup(subgroup)}
                            disabled={subgroupSaving}
                            style={{
                              padding: "7px 12px",
                              border: "1px solid #b42318",
                              borderRadius: "8px",
                              background: WHITE,
                              color: "#b42318",
                              fontWeight: 600,
                              cursor: subgroupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                onClick={closeSubgroupsModal}
                disabled={subgroupSaving}
                style={{
                  padding: "10px 18px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  background: WHITE,
                  color: MONUMENT,
                  fontWeight: 600,
                  cursor: subgroupSaving ? "not-allowed" : "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {showGroupsModal ? (
        <ModalBackdrop
          zIndex={20000}
          onClick={closeGroupsModal}
          style={{ padding: "24px", boxSizing: "border-box" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="groups-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
          >
            <h3
              id="groups-modal-title"
              style={{ fontSize: "1.3rem", margin: "0 0 16px 0", color: MONUMENT, fontWeight: 600 }}
            >
              Group Manager
            </h3>

            <form
              onSubmit={handleAddGroup}
              style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center" }}
            >
              <input
                type="text"
                value={groupDraftName}
                onChange={(e) => setGroupDraftName(e.target.value)}
                placeholder="New colour group name"
                disabled={groupSaving}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={groupSaving || !groupDraftName.trim()}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderRadius: "8px",
                  background: groupSaving || !groupDraftName.trim() ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontWeight: 600,
                  cursor: groupSaving || !groupDraftName.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {colourGroups.length === 0 ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>No colour groups yet.</div>
              ) : (
                colourGroups.map((group) => {
                  const isEditing = editingGroupId === group.id;
                  const sampleCount = Number(group.sample_count) || 0;
                  const subgroupCount = Number(group.subgroup_count) || 0;
                  return (
                    <div
                      key={group.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 12px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        background: UI.inputBg,
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={handleSaveGroup}
                          style={{ display: "flex", flex: 1, gap: "8px", alignItems: "center", minWidth: 0 }}
                        >
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            disabled={groupSaving}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: "8px 10px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              boxSizing: "border-box",
                              minWidth: 0,
                            }}
                          />
                          <button
                            type="submit"
                            disabled={groupSaving || !editingGroupName.trim()}
                            style={{
                              padding: "8px 12px",
                              border: "none",
                              borderRadius: "8px",
                              background: MONUMENT,
                              color: WHITE,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditGroup}
                            disabled={groupSaving}
                            style={{
                              padding: "8px 12px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: MONUMENT }}>{group.name}</div>
                            <div style={{ fontSize: "0.78rem", color: UI.textMuted }}>
                              {subgroupCount} subgroup{subgroupCount === 1 ? "" : "s"} · {sampleCount} colour
                              {sampleCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditGroup(group)}
                            disabled={groupSaving}
                            style={{
                              padding: "7px 12px",
                              border: `1px solid ${MONUMENT}33`,
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: groupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group)}
                            disabled={groupSaving}
                            style={{
                              padding: "7px 12px",
                              border: "1px solid #b42318",
                              borderRadius: "8px",
                              background: WHITE,
                              color: "#b42318",
                              fontWeight: 600,
                              cursor: groupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                onClick={closeGroupsModal}
                disabled={groupSaving}
                style={{
                  padding: "10px 18px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  background: WHITE,
                  color: MONUMENT,
                  fontWeight: 600,
                  cursor: groupSaving ? "not-allowed" : "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
