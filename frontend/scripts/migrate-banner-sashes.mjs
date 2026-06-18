import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const onHoldBlock =
  /<div\s+style=\{\{\s*position: "absolute",\s*top: "50%",\s*left: "50%",\s*transform: "translate\(-50%, -50%\) rotate\(-45deg\)",\s*width: "280px",\s*height: "40px",\s*background: "#0066cc",[\s\S]*?>\s*ON HOLD\s*<\/span>\s*<\/div>/g;

const cancelledBlock =
  /<div\s+style=\{\{\s*position: "absolute",\s*top: "50%",\s*left: "50%",\s*transform: "translate\(-50%, -50%\) rotate\(-45deg\)",\s*width: "280px",\s*height: "40px",\s*background: "#cc0000",[\s\S]*?>\s*CANCELLED\s*<\/span>\s*<\/div>/g;

const files = [
  "pages/SiteVisitManager.jsx",
  "pages/SiteVisitPlanner.jsx",
];

for (const rel of files) {
  const filePath = path.join(srcRoot, rel);
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  if (!content.includes("ProjectStatusSash")) {
    content = content.replace(
      /import \{ UI \} from "\.\.\/utils\/uiThemeTokens\.js";/,
      'import { UI, BANNER } from "../utils/uiThemeTokens.js";\nimport { OnHoldSash, CancelledSash } from "../components/ProjectStatusSash";'
    );
  }

  content = content.replace(onHoldBlock, "<OnHoldSash />");
  content = content.replace(cancelledBlock, "<CancelledSash />");
  content = content.replace(
    /isSelected \? "#0066cc"/g,
    "isSelected ? BANNER.onHold"
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("Updated", rel);
  }
}
