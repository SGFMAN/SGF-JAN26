/**
 * Lists projects whose expected job folder does not exist on disk.
 *
 * Usage (PowerShell):
 *   cd backend
 *   node .\audit-project-folders-missing.js
 *
 * Requires:
 *   DATABASE_URL in backend/.env (or environment)
 *
 * Output:
 *   CSV to stdout: id,state,year,suburb,street,expected_path,exists_expected,exists_legacy_unicode_dash
 */
require("dotenv").config();

const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

const UNICODE_ADDRESS_DASHES = /[\u2013\u2014\u2212]/g; // en dash, em dash, minus
const WIN_FILENAME_ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

function normalizeAddressHyphensForFilesystem(s) {
  if (s == null) return "";
  return String(s).replace(UNICODE_ADDRESS_DASHES, "-");
}

function folderYearFromProjectYear(y) {
  if (y == null || y === "") return new Date().getFullYear().toString();
  const s = String(y).trim();
  if (s.includes("-")) return s.split("-")[0];
  if (/^\d{4}$/.test(s)) return s;
  return new Date().getFullYear().toString();
}

function buildJobProjectFolderName(suburb, street) {
  const sub = normalizeAddressHyphensForFilesystem(suburb ?? "").toUpperCase();
  const st = normalizeAddressHyphensForFilesystem(street ?? "");
  return `${sub} - ${st}`.replace(WIN_FILENAME_ILLEGAL_CHARS, "_");
}

function buildLegacyUnicodeDashFolderName(suburb, street) {
  // This intentionally preserves any unicode dash characters the DB might contain
  // (older jobs may have been created that way).
  const sub = String(suburb ?? "").toUpperCase();
  const st = String(street ?? "");
  return `${sub} - ${st}`.replace(WIN_FILENAME_ILLEGAL_CHARS, "_");
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pickRootDirForState(settingsRow, stateUpper) {
  const vic = String(settingsRow?.root_directory || "").trim();
  const qld = String(settingsRow?.root_directory_qld || "").trim();
  if (stateUpper === "QLD") return qld || vic;
  return vic;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in backend/.env or environment.");
    process.exitCode = 2;
    return;
  }

  const needsSsl =
    String(process.env.PGSSL || "").toLowerCase() === "true" ||
    /\brender\.com\b/i.test(String(process.env.DATABASE_URL || ""));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  try {
    const settingsR = await pool.query(
      "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
    );
    const settingsRow = settingsR.rows[0] || {};

    const projectsR = await pool.query(
      `SELECT id, suburb, street, state, year, status
       FROM projects
       WHERE COALESCE(TRIM(state), '') <> ''
         AND COALESCE(TRIM(suburb), '') <> ''
         AND COALESCE(TRIM(street), '') <> ''
       ORDER BY id ASC`
    );

    process.stdout.write(
      [
        "id",
        "state",
        "year",
        "suburb",
        "street",
        "status",
        "expected_path",
        "exists_expected",
        "exists_legacy_unicode_dash",
      ].join(",") + "\n"
    );

    for (const p of projectsR.rows) {
      const stateUpper = String(p.state || "").toUpperCase().trim();
      const rootDir = pickRootDirForState(settingsRow, stateUpper);
      if (!rootDir) continue;

      const yearFolder = folderYearFromProjectYear(p.year);
      const expectedLeaf = buildJobProjectFolderName(p.suburb, p.street);
      const expectedPath = path.join(rootDir, yearFolder, stateUpper, expectedLeaf);
      const existsExpected = fs.existsSync(expectedPath);

      // If expected doesn't exist, check the legacy leaf that preserves unicode dashes (if any)
      let existsLegacy = false;
      if (!existsExpected) {
        const legacyLeaf = buildLegacyUnicodeDashFolderName(p.suburb, p.street);
        if (legacyLeaf !== expectedLeaf) {
          const legacyPath = path.join(rootDir, yearFolder, stateUpper, legacyLeaf);
          existsLegacy = fs.existsSync(legacyPath);
        }
      }

      if (existsExpected) continue;

      process.stdout.write(
        [
          csvEscape(p.id),
          csvEscape(stateUpper),
          csvEscape(yearFolder),
          csvEscape(p.suburb),
          csvEscape(p.street),
          csvEscape(p.status),
          csvEscape(expectedPath),
          csvEscape(existsExpected ? "Y" : "N"),
          csvEscape(existsLegacy ? "Y" : "N"),
        ].join(",") + "\n"
      );
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Audit failed:", e);
  process.exitCode = 1;
});

