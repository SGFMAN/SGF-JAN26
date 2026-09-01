import {
  BUILDING_ELEMENT_VISIBILITY_GROUPS,
  BUILDING_ELEMENT_VISIBILITY_KEYS,
  CLADDING_TYPE_OPTIONS,
  FOOTING_TYPE_OPTIONS,
  emptyElementVisibility,
  isSlabHiddenVisibilityKey,
  normalizeElementVisibility,
  parseCladdingType,
  parseFootingType,
  visibilityAfterSubfloorDrawType,
} from "../constants/buildingElements.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;

const headingStyle = {
  fontSize: "1rem",
  margin: 0,
  color: MONUMENT,
  fontWeight: 600,
  lineHeight: 1.3,
};

function TypeChoices({ options, selectedKey, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        paddingLeft: "26px",
        marginTop: "2px",
      }}
    >
      {options.map((option) => {
        const selected = selectedKey === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect?.(option.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minHeight: 32,
              padding: "0 4px",
              border: "none",
              background: "transparent",
              color: MONUMENT,
              cursor: "pointer",
              textAlign: "left",
              opacity: selected ? 1 : 0.72,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                flexShrink: 0,
                border: `2px solid ${MONUMENT}`,
                background: selected ? MONUMENT : "transparent",
                boxSizing: "border-box",
              }}
            />
            <span style={{ ...headingStyle, fontWeight: selected ? 700 : 600 }}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function allOnMap(checked, subfloorDrawType) {
  const next = emptyElementVisibility();
  for (const key of BUILDING_ELEMENT_VISIBILITY_KEYS) next[key] = checked;
  if (checked && subfloorDrawType === "slab") {
    for (const key of BUILDING_ELEMENT_VISIBILITY_KEYS) {
      if (isSlabHiddenVisibilityKey(key)) next[key] = false;
    }
  }
  return next;
}

export default function BuildingElementVisibilityPanel({
  visibility,
  fallback = {},
  subfloorDrawType = null,
  claddingType = null,
  onChange,
  onCladdingTypeChange,
}) {
  const vis = normalizeElementVisibility(visibility, fallback);
  const isSlab = subfloorDrawType === "slab";
  const selectedCladding = parseCladdingType(claddingType);
  const selectedFooting = parseFootingType(subfloorDrawType);

  function emitChange(nextVis, nextDrawType) {
    onChange(nextVis, nextDrawType);
  }

  function toggleItem(itemKey, checked) {
    const next = {
      ...vis,
      [itemKey]: checked,
    };
    if (itemKey === "frame") next["internal-walls"] = checked;
    if (itemKey === "cladding" || itemKey === "weatherboards") {
      next.cladding = checked;
      next.weatherboards = checked;
      next.wall = checked;
    }
    emitChange(next);
  }

  function selectFootingType(drawType) {
    emitChange(visibilityAfterSubfloorDrawType(vis, drawType), drawType);
  }

  return (
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
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => emitChange(allOnMap(true, subfloorDrawType))}
          style={{
            flex: 1,
            minHeight: 32,
            padding: "4px 8px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            background: WHITE,
            color: MONUMENT,
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => emitChange(allOnMap(false, subfloorDrawType))}
          style={{
            flex: 1,
            minHeight: 32,
            padding: "4px 8px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            background: WHITE,
            color: MONUMENT,
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Hide all
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          paddingRight: "4px",
        }}
      >
        {BUILDING_ELEMENT_VISIBILITY_GROUPS.map((group) => (
          <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h4 style={headingStyle}>{group.label}</h4>
            {group.items.map((item) => {
              if (isSlab && isSlabHiddenVisibilityKey(item.key)) return null;
              const checked = vis[item.key] !== false;
              return (
                <div key={item.key}>
                <label
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
                    onChange={(e) => toggleItem(item.key, e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      flexShrink: 0,
                      cursor: "pointer",
                      accentColor: MONUMENT,
                    }}
                  />
                  <span style={{ ...headingStyle, flex: 1 }}>{item.label}</span>
                </label>
                {item.key === "footing" ? (
                  <TypeChoices
                    options={FOOTING_TYPE_OPTIONS}
                    selectedKey={selectedFooting}
                    onSelect={selectFootingType}
                  />
                ) : null}
                {item.key === "cladding" ? (
                  <TypeChoices
                    options={CLADDING_TYPE_OPTIONS}
                    selectedKey={selectedCladding}
                    onSelect={onCladdingTypeChange}
                  />
                ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
