/**
 * Path retarget helpers used when a project address / job folder changes.
 * Run: node retargetPaths.test.js
 */
const assert = require("assert/strict");
const path = require("path");

function normalizeWinPath(p) {
  return String(p || "")
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "");
}

function retargetJobFilePath(filePath, oldFolder, newFolder, roots) {
  const original = String(filePath ?? "");
  const file = normalizeWinPath(original);
  if (!file) return original;
  const newN = normalizeWinPath(newFolder);
  const oldN = normalizeWinPath(oldFolder);
  const lower = file.toLowerCase();
  if (oldN) {
    const oldLower = oldN.toLowerCase();
    if (lower === oldLower || lower.startsWith(oldLower + "\\")) {
      return newN + file.slice(oldN.length);
    }
  }
  for (const root of roots || []) {
    const rootN = normalizeWinPath(root);
    if (!rootN) continue;
    const rootLower = rootN.toLowerCase();
    if (!lower.startsWith(rootLower + "\\")) continue;
    const parts = file.slice(rootN.length + 1).split("\\");
    if (parts.length >= 4 && /^\d{4}$/.test(parts[0]) && /^[A-Za-z]{2,4}$/.test(parts[1])) {
      const tail = parts.slice(3).join("\\");
      return tail ? `${newN}\\${tail}` : newN;
    }
  }
  return original;
}

const root = "Z:\\1.SGF PROJECT MANAGEMENT";
const oldFolder = `${root}\\2026\\VIC\\BAYSWATER NORTH - 93 Canterbury Rd`;
const newFolder = `${root}\\2026\\VIC\\SCORESBY - 76 Grayson Dr`;
const roots = [root];

const proposal = `${oldFolder}\\Proposal.PDF`;
assert.equal(
  retargetJobFilePath(proposal, oldFolder, newFolder, roots),
  `${newFolder}\\Proposal.PDF`
);

// Same destination folder (Show Path after address already changed) still fixes stale leaf via roots.
assert.equal(
  retargetJobFilePath(proposal, newFolder, newFolder, roots),
  `${newFolder}\\Proposal.PDF`
);

const drawings = `${oldFolder}\\2. PUBLISHED PLANS\\Plans.PDF`;
assert.equal(
  retargetJobFilePath(drawings, oldFolder, newFolder, roots),
  `${newFolder}\\2. PUBLISHED PLANS\\Plans.PDF`
);

assert.equal(
  retargetJobFilePath("C:\\elsewhere\\file.pdf", oldFolder, newFolder, roots),
  "C:\\elsewhere\\file.pdf"
);

assert.equal(
  normalizeWinPath(proposal) !== normalizeWinPath(`${newFolder}\\Proposal.PDF`),
  true
);

console.log("retargetPaths.test.js ok");
