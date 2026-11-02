// Interactive regression test via Chrome DevTools Protocol (zero deps).
// Validates the ORIGINAL interaction model:
//   record = click day to select (ring) → click same day again / double-click / long-press
//   delete = click a period day → × badge at range midpoint → confirm modal
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const APP = "http://127.0.0.1:8888/#/";

// fresh profile per run: a persisted one would let the previous run's
// Service Worker serve its cached bundle on first navigation
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "period-test-"));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + PROFILE,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTargetWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("chrome devtools endpoint never came up");
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) events.push(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const awaitEvent = (method, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      const poll = setInterval(() => {
        const idx = events.findIndex((e) => e.method === method);
        if (idx >= 0) { clearInterval(poll); resolve(events.splice(idx, 1)[0]); }
        else if (Date.now() - t0 > timeout) { clearInterval(poll); reject(new Error("timeout " + method)); }
      }, 50);
    });
  const ready = new Promise((res) => ws.addEventListener("open", res));
  return { ws, send, awaitEvent, ready };
}

async function evalJs(conn, expr) {
  const r = await conn.send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true,
  });
  if (r.result && r.result.exceptionDetails) {
    throw new Error("page eval failed: " + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  }
  return r.result ? r.result.result.value : undefined;
}

const results = [];
const check = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

(async () => {
  const wsUrl = await getTargetWs();
  const conn = cdp(wsUrl);
  await conn.ready;
  await conn.send("Page.enable");
  await conn.send("Runtime.enable");
  const loaded = conn.awaitEvent("Page.loadEventFired");
  await conn.send("Page.navigate", { url: APP });
  await loaded;
  await sleep(2500); // let SystemJS legacy bootstrapping finish

  // ---- 1. mount + icon + action bar fully removed
  check("app mounted", await evalJs(conn, `document.querySelector('#app')?.innerHTML.length > 100`));
  check("header shows app icon img (loaded)", await evalJs(conn,
    `(function(){const img=document.querySelector('header img[src*="icon-192"]');return !!img && img.naturalWidth > 0})()`));
  check("no record/delete action buttons", await evalJs(conn,
    `![...document.querySelectorAll('button')].some(b => ['记录今日经期','删除该段经期'].includes(b.textContent.trim()) || ['记录经期','删除选中的经期记录','取消选择'].includes(b.getAttribute('aria-label')))`));
  check("original onboarding tip restored", await evalJs(conn,
    `document.body.textContent.includes('点击选中空白日期再点击即可记录经期')`));

  // ---- 2. circular "+": click date → button appears → click + → records
  check("idle: no action button", await evalJs(conn,
    `![...document.querySelectorAll('button')].some(b => ['记录经期','删除选中的经期记录'].includes(b.getAttribute('aria-label')))`));
  check("click TODAY 11-02", await evalJs(conn,
    `(function(){document.querySelector('button[data-date="2026-11-02"]').click();return true})()`));
  await sleep(200);
  check("today cell shows selection ring (fix verified)", await evalJs(conn,
    `document.querySelector('button[data-date="2026-11-02"]').className.includes('ring-2')`));
  check("click 11-01 moves selection there", await evalJs(conn,
    `(function(){document.querySelector('button[data-date="2026-11-01"]').click();return true})()`));
  await sleep(200);
  check("ring selection visible", await evalJs(conn,
    `document.querySelector('button[data-date="2026-11-01"]').className.includes('ring-2')`));
  check("circular + button appears (48x48, two bars)", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='记录经期');
      if(!b)return false;
      const bars=b.querySelectorAll('span');
      return b.offsetWidth===48 && b.offsetHeight===48 && bars.length===2 &&
        [...bars].some(s=>s.offsetWidth===20 && s.offsetHeight<=3) &&
        [...bars].some(s=>s.offsetWidth<=3 && s.offsetHeight===20) &&
        getComputedStyle(b).borderRadius!=='0px'})()`));
  check("click + records period", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='记录经期');if(!b)return false;b.click();return true})()`));
  await sleep(300);
  const store1 = await evalJs(conn, `JSON.parse(localStorage.getItem('period-tracker-v4') || '[]')`);
  check("period persisted (11-01..11-07)", store1.length === 1 && store1[0].startDate === "2026-11-01" && store1[0].endDate === "2026-11-07",
    JSON.stringify(store1));
  check("+ button gone after add", await evalJs(conn,
    `![...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label')==='记录经期')`));

  // ---- 3. circular "×": click period day → × appears → confirm modal flow
  check("click period day 11-03", await evalJs(conn,
    `(function(){document.querySelector('button[data-date="2026-11-03"]').click();return true})()`));
  await sleep(300);
  check("circular × button appears (white fill, pink outline, pink bars)", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='删除选中的经期记录');
      if(!b)return false;
      const bars=b.querySelectorAll('span');
      const cs=getComputedStyle(b);
      return b.offsetWidth===48 && b.offsetHeight===48 && bars.length===2 &&
        [...bars].every(s=>s.offsetWidth===20 && getComputedStyle(s).backgroundColor==='rgb(242, 109, 173)') &&
        [...bars].some(s=>s.style.transform.includes('rotate(45deg)')) &&
        [...bars].some(s=>s.style.transform.includes('rotate(-45deg)')) &&
        cs.backgroundColor==='rgb(255, 255, 255)' &&
        cs.borderColor==='rgb(242, 109, 173)'})()`));
  check("click × opens confirm modal", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='删除选中的经期记录');if(!b)return false;b.click();return true})()`));
  await sleep(300);
  check("modal visible", await evalJs(conn, `document.body.textContent.includes('删除经期记录')`));
  check("cancel modal keeps selection (× stays)", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='取消');b.click();return true})()`));
  await sleep(300);
  check("× still visible after cancel", await evalJs(conn,
    `!![...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label')==='删除选中的经期记录')`));
  check("click × again and confirm delete", await evalJs(conn,
    `(function(){[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='删除选中的经期记录').click();return true})()`));
  await sleep(300);
  check("click 确认删除", await evalJs(conn,
    `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='确认删除');if(!b)return false;b.click();return true})()`));
  await sleep(300);
  const store2 = await evalJs(conn, `JSON.parse(localStorage.getItem('period-tracker-v4') || '[]')`);
  check("period removed", store2.length === 0);
  check("× button gone after delete", await evalJs(conn,
    `![...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label')==='删除选中的经期记录')`));

  // ---- 4. legacy gestures still work and also dismiss the +
  check("dblclick 11-01 records (legacy path)", await evalJs(conn,
    `(function(){const el=document.querySelector('button[data-date="2026-11-01"]');el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return true})()`));
  await sleep(300);
  const store3 = await evalJs(conn, `JSON.parse(localStorage.getItem('period-tracker-v4') || '[]')`);
  check("dblclick created period", store3.length === 1 && store3[0].startDate === "2026-11-01");
  // November has no free past day left (11-01 covered); go back one month
  check("navigate to previous month", await evalJs(conn,
    `(function(){document.querySelector('button[aria-label="上一月"]').click();return true})()`));
  await sleep(300);
  check("click-click 10-15 records (legacy path, dismisses +)", await evalJs(conn,
    `(function(){const el=document.querySelector('button[data-date="2026-10-15"]');el.click();el.click();return true})()`));
  await sleep(300);
  const store4 = await evalJs(conn, `JSON.parse(localStorage.getItem('period-tracker-v4') || '[]')`);
  check("click-click created period 10-15", store4.length === 2 && store4.some(p => p.startDate === "2026-10-15"));
  check("no + button left", await evalJs(conn,
    `![...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label')==='记录经期')`));

  const fails = results.filter((r) => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  chrome.kill();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR:", e.message); chrome.kill(); process.exit(2); });
