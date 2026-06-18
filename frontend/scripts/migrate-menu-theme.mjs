import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const files = [
  "pages/AllProjects.jsx",
  "pages/HomePage.jsx",
  "pages/Hotlist.jsx",
  "pages/InConstruction.jsx",
  "pages/FinishedProjects.jsx",
  "pages/Cancelled.jsx",
  "pages/OnHold.jsx",
  "pages/PortalProjects.jsx",
  "pages/Sales.jsx",
  "pages/SalesAnalytics.jsx",
  "pages/SalesTotals.jsx",
];

const replacements = [
  ['background: "#A6C9EC"', "background: MENU.blue"],
  ['background: "#CEEAB0"', "background: MENU.green"],
  ['background: "#F79198"', "background: MENU.red"],
  ['background: "#B19CD9"', "background: MENU.purple"],
  ['border: "2px solid #000"', "border: `2px solid ${MENU.groupBorder}`"],
  ['background: "#92D050"', "background: MENU.greenActive"],
  ['? "#92D050" : "transparent"', "? MENU.greenActive : \"transparent\""],
  ['? "#4D93D9" : "transparent"', "? MENU.blueActive : \"transparent\""],
  ['? WHITE : UI.textSecondary', "? MENU.activeText : UI.textSecondary"],
];

function ensureMenuImport(content) {
  if (content.includes("MENU")) return content;

  if (content.includes('import { UI } from "../utils/uiThemeTokens.js"')) {
    return content.replace(
      'import { UI } from "../utils/uiThemeTokens.js"',
      'import { UI, MENU } from "../utils/uiThemeTokens.js"'
    );
  }
  if (content.includes('import { UI } from "../utils/uiThemeTokens"')) {
    return content.replace(
      'import { UI } from "../utils/uiThemeTokens"',
      'import { UI, MENU } from "../utils/uiThemeTokens"'
    );
  }
  return content;
}

function fixActiveLinkColors(content) {
  // Active menu links: greenActive/blueActive paired with WHITE on next line
  return content.replace(
    /background: MENU\.(greenActive|blueActive),\n(\s+)color: WHITE,/g,
    "background: MENU.$1,\n$2color: MENU.activeText,"
  );
}

for (const rel of files) {
  const filePath = path.join(srcRoot, rel);
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  const needsMenu =
    content.includes("#A6C9EC") ||
    content.includes("#CEEAB0") ||
    content.includes("#F79198") ||
    content.includes("#B19CD9") ||
    content.includes('background: "#92D050"') ||
    content.includes('background: "#4D93D9"');

  if (!needsMenu) continue;

  content = ensureMenuImport(content);

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  content = fixActiveLinkColors(content);

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("Updated", rel);
  }
}
