import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "pages");

function ensurePageText(content) {
  if (content.includes("PAGE_TEXT")) return content;
  if (!content.includes("UI.pageText") && !content.includes('from "../utils/uiThemeTokens')) {
    return content;
  }
  if (content.includes("const WHITE = UI.cardBg;")) {
    return content.replace(
      "const WHITE = UI.cardBg;",
      "const WHITE = UI.cardBg;\nconst PAGE_TEXT = UI.pageText;"
    );
  }
  if (content.includes("UI } from")) {
    return content.replace(
      /(import \{ UI[^}]*\} from [^;]+;)/,
      "$1\nconst PAGE_TEXT = UI.pageText;"
    );
  }
  return content;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".jsx")) {
      let content = fs.readFileSync(p, "utf8");
      const original = content;

      content = content.replace(/\? WHITE : MONUMENT/g, "? PAGE_TEXT : MONUMENT");

      // Page titles on dark page background
      content = content.replace(
        /fontWeight: 700,\s*\n\s*color: WHITE,\s*\n\s*letterSpacing: "1px"/g,
        'fontWeight: 700,\n              color: PAGE_TEXT,\n              letterSpacing: "1px"'
      );

      // Filled toolbar buttons: use Text - Light on coloured/dark backgrounds
      content = content.replace(
        /(background: (?:MONUMENT|"#4D93D9"|"#33cc33"|MENU\.(?:blueActive|greenActive)),\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: stateFilter === "[^"]+" \? (?:MONUMENT|"#4D93D9"|"#D54358") : WHITE,\s*\n\s*)color: stateFilter === "[^"]+" \? WHITE : MONUMENT,/g,
        (match) => match.replace(/\? WHITE : MONUMENT/g, "? PAGE_TEXT : MONUMENT")
      );

      // Standalone action buttons with coloured bg then white text
      content = content.replace(
        /(padding: "10px 20px",\s*\n\s*background: "#4D93D9",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: "#33cc33",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: MONUMENT,\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: "#4D93D9",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: "#cc3333",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: "#dc3545",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: PURPLE,\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: "#FFA500",\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );
      content = content.replace(
        /(background: accent\.agreementBg,\s*\n\s*)color: WHITE,/g,
        "$1color: PAGE_TEXT,"
      );

      if (
        content.includes("? PAGE_TEXT : MONUMENT") ||
        content.includes("color: PAGE_TEXT,") ||
        content.includes('letterSpacing: "1px"')
      ) {
        content = ensurePageText(content);
      }

      if (content !== original) {
        fs.writeFileSync(p, content);
        console.log("updated", p);
      }
    }
  }
}

walk(root);
