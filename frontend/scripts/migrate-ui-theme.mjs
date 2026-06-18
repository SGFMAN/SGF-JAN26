import fs from "fs";
import path from "path";

const root = path.resolve("src");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(jsx|js|css)$/.test(name)) acc.push(p);
  }
  return acc;
}

const skip = ["uiThemeTokens", "uiThemes", "applyUiTheme", "UiThemeProvider"];
let updated = 0;

for (const file of walk(root)) {
  if (skip.some((s) => file.includes(s))) continue;

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  if (!text.includes("uiThemeTokens") && /const MONUMENT = "#323233"/.test(text)) {
    const relPath = path.relative(path.dirname(file), path.join(root, "utils/uiThemeTokens.js")).replace(/\\/g, "/");
    const importPath = relPath.startsWith(".") ? relPath : `./${relPath}`;
    const importStmt = `import { UI } from "${importPath}";\n`;

    text = text.replace(/const MONUMENT = "#323233";\r?\n/, `${importStmt}const MONUMENT = UI.textPrimary;\n`);
    text = text.replace(/const SECTION_GREY = "#a1a1a3";[^\n]*\r?\n/g, "const SECTION_GREY = UI.panelBg;\n");
    text = text.replace(/const LIGHT_MONUMENT = "#42464d";[^\n]*\r?\n/g, "const LIGHT_MONUMENT = UI.pageBg;\n");
    text = text.replace(/const WHITE = "#fff";\r?\n/g, "const WHITE = UI.cardBg;\n");
    text = text.replace(/"#32323399"/g, "UI.textMuted");
    text = text.replace(/"#f0f0f0"/g, "UI.inputBg");
    text = text.replace(/"#f5f5f5"/g, "UI.inputBg");
    text = text.replace(/"#f9f9f9"/g, "UI.inputBg");
    text = text.replace(/"#e0e0e0"/g, "UI.border");
    text = text.replace(/"#404049"/g, "UI.textSecondary");
  }

  if (file.endsWith("mobile.css")) {
    text = text
      .replace(/background: #42464d;/g, "background: var(--sgf-page-bg);")
      .replace(/background: #323233;/g, "background: var(--sgf-text-primary);")
      .replace(/color: #323233;/g, "color: var(--sgf-text-primary);")
      .replace(/color: #32323399;/g, "color: var(--sgf-text-muted);")
      .replace(/background: #fff;/g, "background: var(--sgf-card-bg);")
      .replace(/background: #e8e8ea;/g, "background: var(--sgf-input-bg);");
  }

  if (text !== original) {
    fs.writeFileSync(file, text);
    updated += 1;
    console.log(file);
  }
}

console.log(`updated ${updated} files`);
