const path = require("path");
const { chromium } = require("playwright");
const { lookup, mask, assertNoCustomerDetails, BASE } = require("./capture");

async function main() {
  const { userId } = await lookup();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2100, height: 1180 },
    deviceScaleFactor: 2,
  });
  context.setDefaultTimeout(70000);
  await context.addInitScript((id) => {
    sessionStorage.setItem("loggedInUserId", String(id));
    sessionStorage.setItem("passwordType", "global");
    sessionStorage.setItem("loggedInUserName", "Staff");
  }, userId);
  const page = await context.newPage();
  await page.goto(`${BASE}/sales-totals`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return /grand total/i.test(text) && /average price/i.test(text) && !/LOADING/i.test(text);
  });
  await page.waitForTimeout(1000);
  await mask(page);
  await page.waitForTimeout(300);
  await mask(page);
  await assertNoCustomerDetails(page);
  await page.screenshot({
    path: path.join(__dirname, "screenshots", "11-sales-totals.png"),
    type: "png",
  });
  console.log("11-sales-totals.png");
  await browser.close();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
