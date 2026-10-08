/**
 * Read-only screenshot capture for the management showcase.
 * Does not save project data. Customer names, addresses, emails and phones
 * are masked in the browser before each screenshot.
 */
const fs = require("fs");
const path = require("path");

const backendModules = path.resolve(__dirname, "../backend/node_modules");
require(path.join(backendModules, "dotenv")).config({
  path: path.resolve(__dirname, "../backend/.env"),
  quiet: true,
});
const { Pool } = require(path.join(backendModules, "pg"));
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "screenshots");
const BASE = "http://127.0.0.1:5173";

function pool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

async function lookup() {
  const db = pool();
  try {
    const user = await db.query(`
      SELECT u.id
      FROM users u
      JOIN user_access_permissions a ON a.user_id = u.id
      WHERE a.granted = true
        AND a.access_area IN ('admin', 'sales', 'managers', 'drawing')
      GROUP BY u.id
      HAVING count(DISTINCT a.access_area) = 4
      ORDER BY u.id
      LIMIT 1
    `);
    const design = await db.query(`
      SELECT access_token
      FROM projects
      WHERE access_token IS NOT NULL
        AND lower(trim(status)) = 'design phase'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `);
    const construction = await db.query(`
      SELECT access_token
      FROM projects
      WHERE access_token IS NOT NULL
        AND lower(trim(status)) IN ('construction phase', 'in construction')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `);
    if (!user.rows[0] || !design.rows[0] || !construction.rows[0]) {
      throw new Error("Could not find a staff user or sample projects");
    }
    return {
      userId: user.rows[0].id,
      designToken: design.rows[0].access_token,
      constructionToken: construction.rows[0].access_token,
    };
  } finally {
    await db.end();
  }
}

async function mask(page) {
  await page.evaluate(() => {
    const keepBadge = /^(VIC|QLD|NSW|SA|WA|TAS|NT|ACT|SSD|DPU|DEX|DWE|OFFICE|D&DPU|D&SSD|SSD&DPU|REN|DOC|SGF)$/i;
    const keepCell = /^(VIC|QLD|NSW|SA|WA|TAS|NT|ACT|Victoria|Queensland|—|-|None)$/i;
    const dateRe = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    const isoRe = /^\d{4}-\d{2}-\d{2}/;
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRe = /\b(?:\+?61[\s-]?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g;

    document.querySelectorAll("div").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 170 || rect.width > 250 || rect.height < 80 || rect.height > 140) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (!text || keepBadge.test(text) || /^on hold$/i.test(text)) return;
        if (/^start\b/i.test(text) || /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(text)) return;
        if (/back|main|overview|drawing|colour|planning|payment|contract|window|admin|costing|client|info|visit|variation|quote|sales|permit|design|construction|archive|manager|settings|tools|graph|line|pie|chart|rate|target|analytics|month|hot|list/i.test(text)) return;
        node.nodeValue = "PROJECT";
      });
    });

    document.querySelectorAll(".project-folder-card__face").forEach((card) => {
      card.querySelectorAll("div").forEach((el) => {
        if (el.childElementCount) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        const text = (el.textContent || "").trim();
        if (!text || keepBadge.test(text)) return;
        if (size >= 14.5) el.textContent = "PROJECT";
      });
    });

    document.querySelectorAll('a[href*="/project/"]').forEach((a) => {
      if (a.querySelector("img, .project-folder-card")) return;
      const href = a.getAttribute("href") || "";
      if (!href.includes("/project/")) return;
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node, index) => {
        if (node.nodeValue && node.nodeValue.trim()) node.nodeValue = index === 0 ? "Project" : "";
      });
      a.removeAttribute("title");
    });

    document.querySelectorAll("div").forEach((el) => {
      if (el.childElementCount) return;
      if (el.closest("button, a, h1, h2, h3, th")) return;
      const text = (el.textContent || "").trim();
      if (!text || keepCell.test(text) || dateRe.test(text) || isoRe.test(text)) return;
      const wordBreak = getComputedStyle(el).wordBreak;
      if (wordBreak === "break-word" && text.length > 6) el.textContent = "Client record";
    });

    if (location.pathname.startsWith("/project/")) {
      const h1 = document.querySelector("h1");
      if (h1) {
        h1.textContent = "Project record";
        h1.removeAttribute("title");
      }
    }

    document.querySelectorAll("td").forEach((td) => {
      if (td.querySelector("input, button, select, a")) return;
      const text = (td.textContent || "").trim();
      if (!text || keepCell.test(text) || dateRe.test(text) || isoRe.test(text)) return;
      td.textContent = "Masked";
      td.removeAttribute("title");
    });

    document.querySelectorAll("input, textarea").forEach((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["checkbox", "radio", "date", "number", "range", "hidden", "button", "submit"].includes(type)) return;
      const value = el.value || "";
      if (!value.trim()) return;
      if (isoRe.test(value) || dateRe.test(value.trim())) return;
      if (keepCell.test(value.trim())) return;
      if (/^(Design Phase|Permit Phase|Pre-Engagement Phase|Ready to Build|Construction Phase|Complete|Cancelled|Not Sent|Sent|Not Booked|Booked|Not Assigned|Concept Stage|Working Drawing Stage|Drawings Complete|Not Complete|Email Sent|Not Ordered|Ordered|Not Required|Not Selected|No Planning Required|Planning Required|Planning Permit Issued|Not Submitted|Permit Issued)$/i.test(value.trim())) {
        return;
      }
      if (value.includes("@")) el.value = "client@example.com";
      else if (phoneRe.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/[^a-z]/gi, "").length < 4) el.value = "0400 000 000";
      else if (/^[$\d,.\s]+$/.test(value)) return;
      else el.value = "Masked";
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const original = node.nodeValue;
      if (!original) return;
      const next = original.replace(emailRe, "client@example.com").replace(phoneRe, "0400 000 000");
      if (next !== original) node.nodeValue = next;
    });

    const keepSelectText = /^(Design Team|Sales Team|Not Sent|Not Booked|Not Assigned|Not Complete|Not Ordered|Not Required|Not Selected|Not Submitted|Council Sewer|Concept Stage|Drawings Complete|Working Drawing Stage|All States|All Projects|On Hold|Email Sent|Permit Issued|No Planning Required|Planning Required|Planning Permit Issued|Hot List|New Quote)$/;
    document.querySelectorAll("select").forEach((sel) => {
      const opt = sel.options[sel.selectedIndex];
      if (!opt) return;
      const text = (opt.text || "").trim();
      if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text) && !keepSelectText.test(text)) opt.text = "Staff";
    });

    document.querySelectorAll("button").forEach((button) => {
      const text = (button.textContent || "").trim();
      if (text.includes("@")) button.textContent = "client@example.com";
      button.removeAttribute("title");
    });

    document.querySelectorAll("[title], [aria-label]").forEach((el) => {
      ["title", "aria-label"].forEach((attr) => {
        const value = el.getAttribute(attr) || "";
        if (!value) return;
        if (emailRe.test(value) || phoneRe.test(value) || /mark called|street|suburb|@/i.test(value)) {
          el.setAttribute(attr, attr === "aria-label" ? "Item" : "");
        }
      });
    });

    const streetRe = /\b\d{1,5}(?:\([^)]*\))?\s+[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,5}\s+(?:St|Street|Rd|Road|Ave|Avenue|Av|Dr|Drive|Ct|Court|Cres|Crescent|Cr|Pde|Parade|Way|Lane|Ln|Blvd|Place|Pl|Tce|Terrace|Hwy|Highway|Cl|Close|Gr|Grove|Cct|Circuit)\b/i;
    const realEmailRe = /[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const elements = [...document.querySelectorAll("body *")].sort(
      (a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length
    );
    elements.forEach((el) => {
      if (el.closest("script, style, svg")) return;
      const text = (el.innerText || "").trim();
      if (text.length < 6 || text.length > 220) return;
      if (text.includes("$") || /\bAvg\b/.test(text) || /Sales/.test(text)) return;
      const digits = (text.match(/\b(?:\+?61[\s-]?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g) || []).some((value) => {
        return value.replace(/\D/g, "") !== "0400000000";
      });
      if (streetRe.test(text) || realEmailRe.test(text) || digits) {
        el.textContent = "Masked";
      }
    });
  });
}

async function assertNoCustomerDetails(page) {
  const hits = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const streets = text.match(/\b\d{1,5}(?:\([^)]*\))?\s+[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,5}\s+(?:St|Street|Rd|Road|Ave|Avenue|Av|Dr|Drive|Ct|Court|Cres|Crescent|Cr|Pde|Parade|Way|Lane|Ln|Blvd|Place|Pl|Tce|Terrace|Hwy|Highway|Cl|Close|Gr|Grove|Cct|Circuit)\b/gi) || [];
    const emails = text.match(/[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const phones = (text.match(/\b(?:\+?61[\s-]?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g) || []).filter((value) => {
      return value.replace(/\D/g, "") !== "0400000000";
    });
    return { streets: streets.length, emails: emails.length, phones: phones.length };
  });
  if (hits.streets || hits.emails || hits.phones) {
    throw new Error(`Customer details still visible (streets ${hits.streets}, emails ${hits.emails}, phones ${hits.phones})`);
  }
}

async function shoot(page, name) {
  await mask(page);
  await page.waitForTimeout(300);
  await mask(page);
  await assertNoCustomerDetails(page);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: "png" });
  console.log(name);
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { userId, designToken, constructionToken } = await lookup();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2100, height: 1180 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((id) => {
    sessionStorage.setItem("loggedInUserId", String(id));
    sessionStorage.setItem("passwordType", "global");
    sessionStorage.setItem("loggedInUserName", "Staff");
  }, userId);
  const page = await context.newPage();

  await goto(page, `${BASE}/projects`);
  await page.getByText("All Projects").first().waitFor({ timeout: 30000 });
  await page.locator(".project-folder-card").first().waitFor({ timeout: 30000 });
  await shoot(page, "01-projects.png");

  await goto(page, `${BASE}/new`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return text.includes("Date added") && !/LOADING/i.test(text);
  }, { timeout: 45000 });
  await shoot(page, "02-quotes.png");

  const callback = page.getByText("Call Back Lists", { exact: true });
  if (await callback.count()) {
    await callback.click();
    await page.waitForTimeout(1200);
    await shoot(page, "03-callbacks.png");
  }

  await goto(page, `${BASE}/hotlist`);
  await page.waitForTimeout(1200);
  await shoot(page, "04-hotlist.png");

  await goto(page, `${BASE}/managers/status-manager`);
  await page.getByText("Deposit").first().waitFor({ timeout: 30000 });
  await shoot(page, "05-status-manager.png");

  await goto(page, `${BASE}/managers/drawing-manager`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return text.includes("Drawing Manager") && !/Loading projects/i.test(text);
  }, { timeout: 45000 });
  const conceptTab = page.getByText(/^Concept \(/).first();
  if (await conceptTab.count()) {
    await conceptTab.click();
    await page.waitForTimeout(800);
  }
  await shoot(page, "06-drawing-manager.png");

  await goto(page, `${BASE}/project/${designToken}?view=drawings`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return /Drawing/i.test(text) && !/LOADING/i.test(text);
  }, { timeout: 45000 });
  await page.waitForTimeout(1000);
  await shoot(page, "07-drawings.png");

  await goto(page, `${BASE}/project/${designToken}?view=colours`);
  await page.waitForTimeout(2500);
  await shoot(page, "08-colours.png");

  await goto(page, `${BASE}/project/${designToken}?view=planning`);
  await page.waitForTimeout(2500);
  await shoot(page, "09-planning.png");

  await goto(page, `${BASE}/project/${constructionToken}?view=payments`);
  await page.getByText("Deposit").first().waitFor({ timeout: 30000 });
  await shoot(page, "10-payments.png");

  await goto(page, `${BASE}/sales-totals`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return /grand total/i.test(text) && /average price/i.test(text) && !/LOADING/i.test(text);
  }, { timeout: 60000 });
  await page.waitForTimeout(800);
  await shoot(page, "11-sales-totals.png");

  await goto(page, `${BASE}/sales-analytics`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return /Monthly Sales|JAN/.test(text) && !/Loading projects/i.test(text);
  }, { timeout: 45000 });
  await page.getByRole("button", { name: "Show Average" }).click();
  await page.waitForTimeout(600);
  await shoot(page, "12-sales-analytics.png");

  await page.getByRole("button", { name: "Pie Chart" }).click();
  await page.waitForTimeout(1500);
  await shoot(page, "13-sales-pie.png");

  await goto(page, `${BASE}/managers/colour-manager`);
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return text.includes("Colour Manager") && !/Loading projects/i.test(text);
  }, { timeout: 45000 });
  await page.waitForTimeout(600);
  await shoot(page, "14-colour-manager.png");

  await goto(page, `${BASE}/site-visit-manager`);
  await page.waitForTimeout(2000);
  await shoot(page, "15-site-visits.png");

  await browser.close();
}

module.exports = { lookup, mask, assertNoCustomerDetails, shoot, goto, BASE };

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
