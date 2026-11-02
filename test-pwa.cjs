// Real-browser regression tests. Start the preview server in this process tree.
// Prerequisite: npm install --no-save playwright && npx playwright install chromium
// Optional: CHROME_PATH=/path/to/chrome, TEST_SCREENSHOTS=/path/to/screenshots
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
let playwright;
try { playwright = require("playwright"); }
catch (failure) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw failure;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright"));
}
const url = "http://127.0.0.1:8888";
const key = "period-tracker-v4";
const checks = [];
const server = spawn(process.execPath, [path.join(__dirname, "preview-server.cjs")], { stdio: "ignore" });
let browser;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function check(name, task) { await task(); checks.push(name); console.log("PASS", name); }
async function records(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), key); }
async function writes(page) { return page.evaluate(() => window.__periodWrites); }
async function hint(page) { return page.locator("#period-context-hint").innerText(); }
function day(page, value) { return page.locator(`[data-date="${value}"]`); }
async function fresh(seed = [], viewport = { width: 390, height: 844 }, touch = false) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
  page.setDefaultTimeout(5000);
  page.__errors = [];
  page.on("pageerror", error => page.__errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") page.__errors.push(message.text()); });
  // Exercise the offline font fallback; no external requests needed by a test.
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ body: "" }));
  await page.addInitScript(({ seed, key }) => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [2026, 10, 15, 12])); }
      static now() { return OriginalDate.now(); }
    };
    const original = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) original.call(localStorage, key, JSON.stringify(seed));
    window.__periodWrites = 0;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__periodWrites++;
      return original.call(this, name, value);
    };
  }, { seed, key });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".period-days");
  return page;
}
async function point(locator) {
  const rect = await locator.boundingBox();
  assert(rect); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
async function drag(page, from, to, cancel = false) {
  const start = await point(day(page, from)), end = await point(day(page, to));
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.waitForFunction(() => document.querySelector("#period-context-hint").textContent.includes("·"));
  const during = { records: await records(page), writes: await writes(page), hint: await hint(page) };
  if (cancel) await page.locator(".period-calendar").dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true });
  await page.mouse.up(); await delay(550);
  return during;
}
async function screenshot(page, name) {
  if (!process.env.TEST_SCREENSHOTS) return;
  fs.mkdirSync(process.env.TEST_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.TEST_SCREENSHOTS, name + ".png"), fullPage: true });
}

(async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch (failure) { if (attempt === 29) throw failure; }
    await delay(100);
  }
  browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  let page = await fresh();
  await check("empty state has one contextual hint and no action button", async () => {
    assert.equal(await hint(page), "点选经期开始那天");
    assert.equal(await page.locator(".period-action").count(), 0);
    assert(!(await page.locator("body").innerText()).includes("长按和双击"));
    await screenshot(page, "empty");
  });
  await check("selecting a date previews exactly 7 days without saving", async () => {
    await day(page, "2026-11-02").click();
    assert.equal(await page.locator(".is-preview").count(), 7);
    assert.equal(await page.locator(".is-date-selected").count(), 1);
    assert.match(await hint(page), /默认 7 天/);
    assert.equal(await writes(page), 0); assert.deepEqual(await records(page), []);
    await screenshot(page, "preview");
  });
  await check("changing month cancels the preview without saving", async () => {
    await page.getByRole("button", { name: "上一月", exact: true }).click();
    assert.equal(await page.locator(".is-preview").count(), 0); assert.equal(await writes(page), 0);
    await page.getByRole("button", { name: "下一月", exact: true }).click();
  });
  await check("plus commits the preview once and needs no end confirmation", async () => {
    await day(page, "2026-11-02").click();
    await page.getByRole("button", { name: "记录开始", exact: true }).click();
    const data = await records(page);
    assert.equal(data.length, 1); assert.equal(data[0].startDate, "2026-11-02");
    assert.equal(data[0].endDate, "2026-11-08"); assert.equal(await writes(page), 1);
    assert.equal(await hint(page), "已记录，无需再记录结束");
    assert.equal(await page.locator(".period-action").count(), 0);
    await screenshot(page, "saved");
  });
  await check("reload retains the record", async () => {
    await page.reload(); await page.waitForSelector(".period-days");
    assert.equal((await records(page)).length, 1); assert.equal(await page.locator(".is-period").count(), 7);
  });
  await check("selecting a period reveals 2 handles and exactly one delete entry", async () => {
    await day(page, "2026-11-04").click();
    assert.equal(await page.locator(".period-range-handle").count(), 2);
    assert.equal(await page.getByRole("button", { name: "删除选中的经期记录" }).count(), 1);
    assert.equal(await page.locator(".period-day").filter({ hasText: "×" }).count(), 0);
    await screenshot(page, "selected");
  });
  await check("drag previews only, then saves exactly once on release", async () => {
    const during = await drag(page, "2026-11-08", "2026-11-07");
    assert.equal(during.records[0].endDate, "2026-11-08"); assert.equal(during.writes, 0);
    assert.match(during.hint, /6天/); assert.equal((await records(page))[0].endDate, "2026-11-07");
    assert.equal(await writes(page), 1);
  });
  await check("cancelling drag leaves stored dates and write count unchanged", async () => {
    const before = await records(page), count = await writes(page);
    await drag(page, "2026-11-07", "2026-11-06", true);
    assert.deepEqual(await records(page), before); assert.equal(await writes(page), count);
  });
  await check("keyboard can adjust an endpoint", async () => {
    await day(page, "2026-11-07").focus(); await page.keyboard.press("ArrowLeft");
    assert.equal((await records(page))[0].endDate, "2026-11-06");
  });
  await check("cancel delete preserves record and returns focus", async () => {
    await page.getByRole("button", { name: "删除选中的经期记录" }).click();
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal((await records(page)).length, 1);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "删除选中的经期记录");
  });
  await check("confirm delete removes whole period and returns to empty state", async () => {
    await page.getByRole("button", { name: "删除选中的经期记录" }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    assert.deepEqual(await records(page), []); assert.equal(await hint(page), "点选经期开始那天");
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh();
  await check("real double-click creates one record without duplicate selection", async () => {
    await day(page, "2026-11-02").dblclick();
    assert.equal((await records(page)).length, 1); assert.equal(await writes(page), 1);
    assert.equal(await page.locator(".period-action").count(), 0);
  });
  await check("long press creates one record and suppresses its synthetic click", async () => {
    const position = await point(day(page, "2026-11-12"));
    await page.mouse.move(position.x, position.y); await page.mouse.down(); await delay(700); await page.mouse.up();
    assert.equal((await records(page)).length, 2); assert.equal(await writes(page), 2);
    assert.equal(await page.locator(".period-action").count(), 0);
    assert((await page.locator("body").innerText()).includes("预测下次经期"));
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([{ id: "existing", startDate: "2026-11-08", endDate: "2026-11-14" }]);
  await check("overlap is blocked even when only the proposed end overlaps", async () => {
    await day(page, "2026-11-04").click();
    assert.equal(await page.getByRole("button", { name: "记录开始", exact: true }).isDisabled(), true);
    assert.match(await hint(page), /重叠/); assert.equal(await writes(page), 0);
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh();
  await check("failed persistence never turns preview into a saved record", async () => {
    await day(page, "2026-11-02").click();
    await page.evaluate(() => { const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === "period-tracker-v4") throw new Error("QuotaExceededError");
        return original.call(this, name, value); }; });
    await page.getByRole("button", { name: "记录开始", exact: true }).click();
    assert.deepEqual(await records(page), []); assert.equal(await page.locator(".is-period").count(), 0);
    assert.equal(await page.locator(".is-preview").count(), 7); assert.match(await hint(page), /保存失败/);
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([{ id: "existing", startDate: "2026-11-02", endDate: "2026-11-08" }]);
  await check("failed drag persistence restores the original visible range", async () => {
    await day(page, "2026-11-04").click();
    await page.evaluate(() => { const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === "period-tracker-v4") throw new Error("QuotaExceededError");
        return original.call(this, name, value); }; });
    await drag(page, "2026-11-08", "2026-11-07");
    assert.equal((await records(page))[0].endDate, "2026-11-08");
    assert.equal(await page.locator(".is-period").count(), 7); assert.match(await hint(page), /恢复原日期/);
  });
  await check("failed deletion leaves the original record visible", async () => {
    await page.getByRole("button", { name: "删除选中的经期记录" }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    assert.equal((await records(page)).length, 1); assert.equal(await page.locator(".is-period").count(), 7);
    assert.match(await hint(page), /记录仍保留/);
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([{ id: "single", startDate: "2026-11-02", endDate: "2026-11-02" }]);
  await check("a one-day period can be extended by dragging toward a later date", async () => {
    await day(page, "2026-11-02").click(); await drag(page, "2026-11-02", "2026-11-04");
    assert.equal((await records(page))[0].endDate, "2026-11-04"); assert.equal(await writes(page), 1);
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([], { width: 390, height: 844 }, true);
  await check("touch dragging previews and commits once", async () => {
    await day(page, "2026-11-02").tap();
    await page.getByRole("button", { name: "记录开始", exact: true }).tap();
    await day(page, "2026-11-04").tap();
    const session = await page.context().newCDPSession(page);
    const start = await point(day(page, "2026-11-08")), end = await point(day(page, "2026-11-07"));
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= 5; step++) await session.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 5,
        y: start.y + (end.y - start.y) * step / 5 }],
    });
    await page.waitForFunction(() => document.querySelector("#period-context-hint").textContent.includes("6天"));
    assert.equal((await records(page))[0].endDate, "2026-11-08"); assert.equal(await writes(page), 1);
    assert.match(await hint(page), /6天/);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => !document.querySelector("#period-context-hint").textContent.includes("·"));
    assert.equal((await records(page))[0].endDate, "2026-11-07"); assert.equal(await writes(page), 2);
    await session.detach();
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([], { width: 320, height: 568 }, true);
  await check("touch can select and record on a 320px screen without overflow", async () => {
    await day(page, "2026-11-15").tap();
    assert.equal(await page.locator(".is-preview").count(), 7);
    const action = await page.locator(".period-action").boundingBox();
    assert(action.y + action.height <= 568, "record action must be visible without scrolling");
    await screenshot(page, "touch-320-preview");
    await page.getByRole("button", { name: "记录开始", exact: true }).tap();
    assert.equal((await records(page))[0].startDate, "2026-11-15");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await screenshot(page, "touch-320");
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([], { width: 1024, height: 768 });
  await check("cross-month preview uses actual dates, still exactly 7 days", async () => {
    await page.getByRole("button", { name: "上一月", exact: true }).click();
    await day(page, "2026-10-30").click();
    assert.equal(await page.locator(".is-preview").count(), 7);
    await screenshot(page, "cross-month-desktop");
    await page.getByRole("button", { name: "记录开始", exact: true }).click();
    assert.equal((await records(page))[0].endDate, "2026-11-05");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
  assert.deepEqual(page.__errors, []); await page.close();

  page = await fresh([{ id: "cross-month", startDate: "2026-10-30", endDate: "2026-11-05" }]);
  await check("a visible endpoint can be dragged across the month boundary", async () => {
    await page.getByRole("button", { name: "上一月", exact: true }).click();
    await day(page, "2026-10-30").click();
    await drag(page, "2026-10-30", "2026-11-01");
    assert.equal((await records(page))[0].startDate, "2026-11-01"); assert.equal(await writes(page), 1);
  });
  assert.deepEqual(page.__errors, []); await page.close();
  console.log(`\n${checks.length}/${checks.length} browser scenarios passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); server.kill();
});
