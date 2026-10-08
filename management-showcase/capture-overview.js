/**
 * Captures the project Overview only. Read-only. Customer details are masked.
 */
const path = require("path");
const { chromium } = require("playwright");
const { lookup, mask, assertNoCustomerDetails, BASE } = require("./capture");

async function main() {
  const { userId, constructionToken } = await lookup();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2400, height: 1500 },
    deviceScaleFactor: 2,
  });
  context.setDefaultTimeout(70000);
  await context.addInitScript((id) => {
    sessionStorage.setItem("loggedInUserId", String(id));
    sessionStorage.setItem("passwordType", "global");
    sessionStorage.setItem("loggedInUserName", "Staff");
  }, userId);
  const page = await context.newPage();
  await page.goto(`${BASE}/project/${constructionToken}?view=overview`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return text.includes("To Do List") && text.includes("Deposit") && !/Loading project/i.test(text);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document
      .querySelectorAll(
        ".content-section, .overview-page, .overview-stack, .overview-progress-block, .overview-progress-section, .overview-view-body, .overview-planner-board"
      )
      .forEach((el) => {
        el.style.overflow = "visible";
        el.style.height = "auto";
        el.style.maxHeight = "none";
      });
  });
  const size = await page.evaluate(() => {
    const nodes = [
      document.querySelector(".overview-planner-board"),
      document.querySelector(".overview-outstanding"),
      document.querySelector("h1"),
    ].filter(Boolean);
    let bottom = 0;
    let right = 0;
    nodes.forEach((el) => {
      const rect = el.getBoundingClientRect();
      bottom = Math.max(bottom, rect.bottom);
      right = Math.max(right, rect.right);
    });
    return { bottom: Math.ceil(bottom + 48), right: Math.ceil(right + 48) };
  });
  await page.setViewportSize({
    width: Math.max(2400, size.right),
    height: Math.max(1500, size.bottom),
  });
  await page.waitForTimeout(400);
  await mask(page);
  await page.waitForTimeout(300);
  await mask(page);
  await assertNoCustomerDetails(page);
  await page.screenshot({
    path: path.join(__dirname, "screenshots", "16-overview.png"),
    type: "png",
  });
  console.log("16-overview.png");
  await browser.close();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
