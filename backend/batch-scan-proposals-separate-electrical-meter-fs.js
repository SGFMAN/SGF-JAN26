/**
 * Batch-scan proposal PDFs on disk — filesystem only (no DB).
 *
 * Roots (direct children = one job folder each):
 *   Z:\1.SGF PROJECT MANAGEMENT\2025\QLD
 *   Z:\1.SGF PROJECT MANAGEMENT\2025\VIC
 *   Z:\1.SGF PROJECT MANAGEMENT\2026\QLD
 *   Z:\1.SGF PROJECT MANAGEMENT\2026\VIC
 *
 * Exactly ONE PDF per job from that folder's root only (never subfolders).
 *
 * Resolution order:
 *   1) Filename matches /^proposal\\.pdf$/i exactly (Proposal.PDF, proposal.pdf, …).
 *   2) Filename matches /^proposal/i and ends with .pdf (Proposal.something.pdf, Proposal_123.pdf).
 *   3) If exactly one *.pdf exists in root → use it.
 *   4) If multiple → alphabetical by basename (localeCompare), pick first (deterministic).
 *
 * Usage:
 *   node backend/batch-scan-proposals-separate-electrical-meter-fs.js
 *
 * Output:
 *   proposal-scan-separate-electrical-meter-2025-2026.txt (repo root)
 */
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const BASE_DIR = path.join("Z:", "1.SGF PROJECT MANAGEMENT");
const YEAR_STATE_PAIRS = [
  ["2025", "QLD"],
  ["2025", "VIC"],
  ["2026", "QLD"],
  ["2026", "VIC"],
];

const SKIP_DIR_NAMES = new Set(["1-Folder Structure"]);
const NEEDLE_LOWER = "separate electrical meter";

/** List *.pdf basenames only in jobDir root (not recursive). */
function listPdfBasenames(jobDir) {
  let entries;
  try {
    entries = fs.readdirSync(jobDir, { withFileTypes: true });
  } catch (e) {
    return { error: e.message, pdfs: [] };
  }

  const pdfs = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const n = ent.name;
    if (/\.pdf$/i.test(n)) pdfs.push(n);
  }
  return { error: null, pdfs };
}

/**
 * Choose one PDF basename using user rules: proposal first, else sole PDF, else first sorted.
 */
function chooseProposalBasename(pdfs) {
  if (pdfs.length === 0) return null;

  // 1) Exact proposal.pdf (case-insensitive)
  const exact = pdfs.find((n) => /^proposal\.pdf$/i.test(n));
  if (exact != null) return exact;

  // 2) Other names starting with proposal (case-insensitive)
  const proposalStarts = pdfs.filter((n) => /^proposal/i.test(path.parse(n).name));
  if (proposalStarts.length >= 1) {
    return [...proposalStarts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0];
  }

  // 3) Sole PDF
  if (pdfs.length === 1) return pdfs[0];

  // 4) Tie-break: first alphabetically
  return [...pdfs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0];
}

function* iterJobFolders() {
  for (const [year, state] of YEAR_STATE_PAIRS) {
    const root = path.join(BASE_DIR, year, state);
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      yield { type: "root_error", root, year, state, error: e.message };
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folderName = ent.name;
      if (SKIP_DIR_NAMES.has(folderName)) continue;
      const jobDir = path.join(root, folderName);
      yield { type: "job", year, state, folderName, jobDir };
    }
  }
}

async function main() {
  const outFile = path.join(__dirname, "..", "proposal-scan-separate-electrical-meter-2025-2026.txt");
  const matched = [];
  const notMatched = [];
  const noPdf = [];
  const pdfErrors = [];
  const rootErrors = [];

  let jobCount = 0;

  for (const item of iterJobFolders()) {
    if (item.type === "root_error") {
      rootErrors.push(`${item.root}: ${item.error}`);
      continue;
    }

    jobCount += 1;
    const { year, state, folderName, jobDir } = item;
    const tag = `${year}/${state}/${folderName}`;

    const { error: listErr, pdfs } = listPdfBasenames(jobDir);
    if (listErr) {
      pdfErrors.push(`${tag}: list failed — ${listErr}`);
      continue;
    }

    const choice = chooseProposalBasename(pdfs);
    if (choice == null) {
      noPdf.push(tag);
      continue;
    }

    const pdfPath = path.join(jobDir, choice);
    let text = "";
    try {
      const buf = fs.readFileSync(pdfPath);
      const data = await pdfParse(buf);
      text = (data.text || "").toLowerCase();
    } catch (e) {
      pdfErrors.push(`${tag} — ${pdfPath}: ${e.message}`);
      continue;
    }

    const hit = text.includes(NEEDLE_LOWER);
    const line = `${tag}\n  PDF: ${choice}\n  Path: ${pdfPath}`;
    if (hit) matched.push(line);
    else notMatched.push(line);
  }

  const lines = [];
  lines.push("Scan: Separate Electrical Meter (case-insensitive substring) in ONE root-level PDF per job");
  lines.push(`Base: ${BASE_DIR}`);
  lines.push(`Roots: ${YEAR_STATE_PAIRS.map((a) => a.join("/")).join(", ")}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Job folders scanned: ${jobCount}`);
  lines.push(`Root read errors: ${rootErrors.length}`);
  lines.push(`No PDF in root: ${noPdf.length}`);
  lines.push(`PDF read/parse errors: ${pdfErrors.length}`);
  lines.push(`Matches (phrase found): ${matched.length}`);
  lines.push(`PDF chosen but phrase not found: ${notMatched.length}`);
  lines.push("");
  lines.push("=== MATCHES ===");
  lines.push("");
  if (matched.length === 0) lines.push("(none)");
  else lines.push(...matched);

  lines.push("");
  lines.push("=== CHOSEN PDF BUT NO PHRASE ===");
  lines.push("");
  if (notMatched.length === 0) lines.push("(none)");
  else lines.push(...notMatched);

  lines.push("");
  lines.push("=== NO PDF IN ROOT ===");
  lines.push("");
  if (noPdf.length === 0) lines.push("(none)");
  else lines.push(...noPdf);

  if (pdfErrors.length) {
    lines.push("");
    lines.push("=== PDF / LIST ERRORS ===");
    lines.push("");
    lines.push(...pdfErrors);
  }

  if (rootErrors.length) {
    lines.push("");
    lines.push("=== ROOT ERRORS ===");
    lines.push("");
    lines.push(...rootErrors);
  }

  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log(`Wrote ${outFile}`);
  console.log(`Jobs: ${jobCount}, matches: ${matched.length}, no phrase: ${notMatched.length}, no pdf: ${noPdf.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
