import { UI, STREAM, MENU } from "../utils/uiThemeTokens.js";
import { setStateFilter as saveStateFilter } from "../utils/stateFilter";

const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const MONUMENT = UI.textPrimary;

const btnBase = {
  borderRadius: "8px",
  padding: "10px 20px",
  fontSize: "1rem",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s, color 0.2s",
};

export default function StateFilterButtons({ stateFilter, setStateFilter }) {
  const select = (filter) => {
    setStateFilter(filter);
    saveStateFilter(filter);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => select("VIC")}
        style={{
          ...btnBase,
          background: stateFilter === "VIC" ? STREAM.vicBlue : WHITE,
          color: stateFilter === "VIC" ? PAGE_TEXT : MONUMENT,
          border: `2px solid ${STREAM.vicBlue}`,
        }}
        onMouseEnter={(e) => {
          if (stateFilter !== "VIC") {
            e.currentTarget.style.background = UI.inputBg;
          }
        }}
        onMouseLeave={(e) => {
          if (stateFilter !== "VIC") {
            e.currentTarget.style.background = WHITE;
          }
        }}
      >
        VIC Only
      </button>
      <button
        type="button"
        onClick={() => select("QLD")}
        style={{
          ...btnBase,
          background: stateFilter === "QLD" ? STREAM.qldRed : WHITE,
          color: stateFilter === "QLD" ? PAGE_TEXT : MONUMENT,
          border: `2px solid ${STREAM.qldRed}`,
        }}
        onMouseEnter={(e) => {
          if (stateFilter !== "QLD") {
            e.currentTarget.style.background = UI.inputBg;
          }
        }}
        onMouseLeave={(e) => {
          if (stateFilter !== "QLD") {
            e.currentTarget.style.background = WHITE;
          }
        }}
      >
        QLD Only
      </button>
      <button
        type="button"
        onClick={() => select("All")}
        style={{
          ...btnBase,
          background: stateFilter === "All" ? MENU.purple : WHITE,
          color: stateFilter === "All" ? PAGE_TEXT : MONUMENT,
          border: `2px solid ${MENU.purple}`,
        }}
        onMouseEnter={(e) => {
          if (stateFilter !== "All") {
            e.currentTarget.style.background = UI.inputBg;
          }
        }}
        onMouseLeave={(e) => {
          if (stateFilter !== "All") {
            e.currentTarget.style.background = WHITE;
          }
        }}
      >
        All Projects
      </button>
    </>
  );
}
