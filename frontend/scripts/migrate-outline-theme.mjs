import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, acc);
    } else if (name.endsWith(".jsx") || name.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

const replacements = [
  ["MENU.groupBorder", "UI.outline"],
  ["border: `2px solid ${MONUMENT}`", "border: `2px solid ${UI.outline}`"],
  ["2px solid ${MONUMENT}", "2px solid ${UI.outline}"],
  ['? "#4D93D9" : MONUMENT}', '? "#4D93D9" : UI.outline}'],
  ['? "#D54358" : MONUMENT}', '? "#D54358" : UI.outline}'],
];

for (const filePath of walk(srcRoot)) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("Updated", path.relative(srcRoot, filePath));
  }
}
