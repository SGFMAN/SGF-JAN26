/**
 * Copy "Superior Handover Sheet" .docx from the template folder into every
 * direct child folder (each job folder) under four year/state roots.
 *
 * NOT part of the web app — run manually on the machine that has Z: mapped.
 *
 * Usage (from repo root):
 *   node backend/batch-copy-superior-handover-sheet.js
 *
 * Source (default):
 *   Z:\1.SGF PROJECT MANAGEMENT\2026\VIC\1-Folder Structure\
 *   Tries: Superior Handover Sheet.docx  then  Superior Handover Sheet,docx
 *
 * Targets (each immediate subfolder gets the file):
 *   Z:\1.SGF PROJECT MANAGEMENT\2025\QLD
 *   Z:\1.SGF PROJECT MANAGEMENT\2025\VIC
 *   Z:\1.SGF PROJECT MANAGEMENT\2026\QLD
 *   Z:\1.SGF PROJECT MANAGEMENT\2026\VIC
 */
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(
  "Z:",
  "1.SGF PROJECT MANAGEMENT",
  "2026",
  "VIC",
  "1-Folder Structure"
);

const CANDIDATE_NAMES = ["Superior Handover Sheet.docx", "Superior Handover Sheet,docx"];

const TARGET_ROOTS = [
  path.join("Z:", "1.SGF PROJECT MANAGEMENT", "2025", "QLD"),
  path.join("Z:", "1.SGF PROJECT MANAGEMENT", "2025", "VIC"),
  path.join("Z:", "1.SGF PROJECT MANAGEMENT", "2026", "QLD"),
  path.join("Z:", "1.SGF PROJECT MANAGEMENT", "2026", "VIC"),
];

/** Skip these top-level names under each root (template / meta folders only if present). */
const SKIP_DIR_NAMES = new Set(["1-Folder Structure"]);

function findSourceFile() {
  for (const name of CANDIDATE_NAMES) {
    const full = path.join(SOURCE_DIR, name);
    try {
      if (fs.statSync(full).isFile()) return { full, base: name };
    } catch {
      /* try next */
    }
  }
  return null;
}

function main() {
  const src = findSourceFile();
  if (!src) {
    console.error("Source file not found. Tried:");
    for (const name of CANDIDATE_NAMES) {
      console.error("  ", path.join(SOURCE_DIR, name));
    }
    process.exit(1);
  }

  console.log("Source:", src.full);

  let copied = 0;
  let skipped = 0;
  const errors = [];

  for (const root of TARGET_ROOTS) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      errors.push(`${root}: ${e.message}`);
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (SKIP_DIR_NAMES.has(name)) {
        skipped += 1;
        continue;
      }

      const destDir = path.join(root, name);
      const destFile = path.join(destDir, src.base);

      try {
        fs.copyFileSync(src.full, destFile);
        copied += 1;
        console.log("OK", destFile);
      } catch (e) {
        errors.push(`${destFile}: ${e.message}`);
      }
    }
  }

  console.log("\nDone. Copied:", copied, " Skipped dirs (name):", skipped, " Errors:", errors.length);
  if (errors.length) {
    console.error("\nErrors:");
    errors.forEach((x) => console.error(x));
    process.exit(1);
  }
}

main();
