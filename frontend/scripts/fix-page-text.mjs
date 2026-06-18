import fs from "fs";
import path from "path";

const root = path.resolve("src");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(jsx|js)$/.test(name)) acc.push(p);
  }
  return acc;
}

let updated = 0;

for (const file of walk(root)) {
  let text = fs.readFileSync(file, "utf8");
  const original = text;

  if (text.includes("uiThemeTokens") && text.includes("const WHITE = UI.cardBg")) {
    if (!text.includes("const PAGE_TEXT = UI.pageText")) {
      text = text.replace(
        /const WHITE = UI\.cardBg;\n/,
        "const WHITE = UI.cardBg;\nconst PAGE_TEXT = UI.pageText;\n"
      );
    }
    text = text.replace(
      /color: WHITE,\n(\s+)letterSpacing: "1px"/g,
      "color: PAGE_TEXT,\n$1letterSpacing: \"1px\""
    );
  }

  if (text !== original) {
    fs.writeFileSync(file, text);
    updated += 1;
    console.log(file);
  }
}

console.log(`updated ${updated}`);
