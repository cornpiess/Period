// PWA patch pipeline — single entry point, keeps both shipped copies in sync.
//
//   1. restore pristine bundle + sw.js from Period-PWA.zip (the v1 backup)
//   2. patch the bundle (currently: Home header logo 🌙 → app icon image)
//   3. auto-bump the Service Worker CACHE_NAME (cache-first SW would
//      otherwise serve the previous bundle forever)
//   4. write results to BOTH tusi-web-dist/ (web preview) and assets/www/
//      (what App.js bundles into the Expo shell)
//   5. bump App.js PWA_ASSETS_VERSION so devices recopy on next launch
//
// Run: node patch-pwa.js   (idempotent against pristine sources)
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const DIST = path.join(ROOT, "tusi-web-dist");
const WWW = path.join(ROOT, "assets", "www");
const BUNDLE_REL = path.join("assets", "index-legacy-eCmZKwFb.js");
const ZIP = path.join(ROOT, "Period-PWA.zip");

// ---------------------------------------------------------------------------
// Step 1 — restore pristine bundle from the v1 backup
// ---------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "period-patch-"));
execFileSync("unzip", ["-q", "-o", ZIP, `assets/index-legacy-eCmZKwFb.js`, "sw.js", "-d", tmp], { stdio: "pipe" });
const pristineBundle = fs.readFileSync(path.join(tmp, BUNDLE_REL), "utf8");
const pristineSw = fs.readFileSync(path.join(tmp, "sw.js"), "utf8");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("[ok] pristine sources extracted from Period-PWA.zip");

// ---------------------------------------------------------------------------
// Step 2 — bundle patches. Anchors verified unique; replacements keep the
// original code shape (no patchFlags in this build — full children diff).
// ---------------------------------------------------------------------------
let src = pristineBundle;
function replaceOnce(anchor, replacement, label) {
  const count = src.split(anchor).length - 1;
  if (count !== 1) {
    console.error(`[FAIL] anchor "${label}" found ${count} times (expected 1)`);
    process.exit(1);
  }
  src = src.replace(anchor, replacement);
  console.log(`[ok] ${label}`);
}

// Home header logo: 🌙 emoji → real app icon (icon-192.png; already in SW
// cache + Expo asset manifest; full-bleed gradient covers the old tile)
const logoOld = '[Or("span",{class:"text-white text-sm","data-yyb-inspector-info":"src/views/Home.vue|11:13-11:55"},"🌙")]';
const logoNew =
  '[Or("img",{src:"./icon-192.png",alt:"Period",class:"w-9 h-9 rounded-xl object-cover",draggable:"false","data-yyb-inspector-info":"patch:app-icon"},null)]';
replaceOnce(logoOld, logoNew, "Home header app-icon swap");

// Day-cell style priority: selection ring must outrank the "today" style —
// originally isToday won, so selecting today showed no ring at all.
const styleOld =
  'return e.isToday?"text-[#F26DAD] font-bold cursor-pointer":e.isFuture?"text-[#c7c7cc] cursor-default":c.value===e.dateStr?"text-[#F26DAD] font-semibold cursor-pointer rounded-xl ring-2 ring-[#F26DAD] ring-offset-1"';
const styleNew =
  'return c.value===e.dateStr?"text-[#F26DAD] font-semibold cursor-pointer rounded-xl ring-2 ring-[#F26DAD] ring-offset-1":e.isToday?"text-[#F26DAD] font-bold cursor-pointer":e.isFuture?"text-[#c7c7cc] cursor-default"';
replaceOnce(styleOld, styleNew, "day-cell style: selection ring outranks today");

// ---------------------------------------------------------------------------
// Circular action button (between calendar and bottom card):
//   date selected (ring)   → pink circle "+"  → addPeriod(that date)
//   period segment selected → pink circle "×" → existing confirm modal
//   nothing selected        → not rendered
// Closure vars: t=store, c=selectedDate, l=selectedPeriodId, a=confirm modal.
// ---------------------------------------------------------------------------
const actionSetup = `
function __doAdd() {
  if (!c.value) return;
  t.addPeriod(c.value);
  c.value = null;
}
function __doDel() {
  if (!l.value) return;
  const e = t.periods.find((e) => e.id === l.value);
  if (e) a.value = { periodId: e.id, startDate: e.startDate, endDate: e.endDate };
}
`;
const actionBtn = `
c.value
  ? (br(), Ar("button", {
      key: "act-" + c.value,
      class: "transition-all active:scale-95",
      style: {
        width: "48px", height: "48px", borderRadius: "50%",
        background: "#F26DAD", border: "none", boxSizing: "border-box", padding: "0",
        display: "flex", position: "relative",
        marginLeft: "auto", marginRight: "auto",
        marginTop: "12px", marginBottom: "6px",
        boxShadow: "0 4px 12px rgba(242, 109, 173, 0.35)",
      },
      "aria-label": "记录经期",
      onClick: __doAdd,
    }, [
      Or("span", { style: { position: "absolute", left: "50%", top: "50%", width: "20px", height: "2.5px", borderRadius: "2px", background: "rgba(255,255,255,0.95)", transform: "translate(-50%,-50%)" } }),
      Or("span", { style: { position: "absolute", left: "50%", top: "50%", width: "2.5px", height: "20px", borderRadius: "2px", background: "rgba(255,255,255,0.95)", transform: "translate(-50%,-50%)" } }),
    ]))
  : l.value
  ? (br(), Ar("button", {
      key: "act-" + l.value,
      class: "transition-all active:scale-95",
      style: {
        width: "48px", height: "48px", borderRadius: "50%",
        background: "#FFFFFF", border: "2px solid #F26DAD", boxSizing: "border-box", padding: "0",
        display: "flex", position: "relative",
        marginLeft: "auto", marginRight: "auto",
        marginTop: "12px", marginBottom: "6px",
        boxShadow: "0 4px 12px rgba(242, 109, 173, 0.35)",
      },
      "aria-label": "删除选中的经期记录",
      onClick: __doDel,
    }, [
      Or("span", { style: { position: "absolute", left: "50%", top: "50%", width: "20px", height: "2.5px", borderRadius: "2px", background: "#F26DAD", transform: "translate(-50%,-50%) rotate(45deg)" } }),
      Or("span", { style: { position: "absolute", left: "50%", top: "50%", width: "20px", height: "2.5px", borderRadius: "2px", background: "#F26DAD", transform: "translate(-50%,-50%) rotate(-45deg)" } }),
    ]))
  : jr("", !0)
`;

// standalone syntax verification of both fragments with stub bindings
function verifyFragment(code, statement) {
  const stubs =
    "var t={periods:[],getDayRole:function(){return{isPeriod:false}},addPeriod:function(){}}," +
    "l={value:null},c={value:null},a={value:null}," +
    "br=function(){},Ar=function(){},jr=function(){};";
  const tmpFile = path.join(os.tmpdir(), "period-frag-check.js");
  fs.writeFileSync(tmpFile, stubs + statement.replace("/*CODE*/", code));
  try {
    execFileSync(process.execPath, ["--check", tmpFile], { stdio: "pipe" });
  } catch (e) {
    console.error("[FAIL] fragment syntax:\n" + e.stderr.toString().split("\n")[0]);
    process.exit(1);
  }
}
verifyFragment(actionSetup, "/*CODE*/");
verifyFragment(actionBtn, "var result = /*CODE*/;");
console.log("[ok] fragments syntax-verified standalone");

// per-line trim + join: authored fragments contain no line-spanning strings,
// no // comments, and every line ends on a token that forbids ASI
const minify = (code) => code.split("\n").map((l) => l.trim()).filter(Boolean).join("");

const setupAnchor = 'return eo(()=>{t.load()}),(e,n)=>(br(),Ar("div",{class:"calendar-view';
replaceOnce(setupAnchor, minify(actionSetup) + setupAnchor, "CalendarView action handlers");

const btnAnchor = "预测经期</span></div></div>',1)),(br(),_r(An";
replaceOnce(
  btnAnchor,
  "预测经期</span></div></div>',1))," + minify(actionBtn) + ",(br(),_r(An",
  "circular action button vnode"
);

// ---------------------------------------------------------------------------
// Step 3 — bump SW cache version relative to the latest shipped one
// ---------------------------------------------------------------------------
function swNextVersion() {
  let current = 1;
  for (const p of [path.join(DIST, "sw.js"), path.join(WWW, "sw.js")]) {
    const m = fs.existsSync(p) ? fs.readFileSync(p, "utf8").match(/period-pwa-v(\d+)/) : null;
    if (m) current = Math.max(current, +m[1]);
  }
  return current + 1;
}
const swNext = swNextVersion();
const patchedSw = pristineSw.replace(/period-pwa-v\d+/, `period-pwa-v${swNext}`);
console.log(`[ok] sw cache bumped to period-pwa-v${swNext}`);

// ---------------------------------------------------------------------------
// Step 4 — write both shipped copies.
// assets/www keeps sw.js as sw.js.txt (Metro asset convention, see App.js);
// adapt to whichever name is present so we never resurrect a removed file.
// ---------------------------------------------------------------------------
const wwwSwPath = fs.existsSync(path.join(WWW, "sw.js.txt"))
  ? path.join(WWW, "sw.js.txt")
  : path.join(WWW, "sw.js");
for (const dir of [DIST, WWW]) {
  fs.writeFileSync(path.join(dir, BUNDLE_REL), src, "utf8");
  fs.writeFileSync(dir === WWW ? wwwSwPath : path.join(dir, "sw.js"), patchedSw, "utf8");
  console.log(`[ok] written ${path.relative(ROOT, dir)}`);
}

// ---------------------------------------------------------------------------
// Step 5 — bump App.js asset version so the Expo shell recopies on device
// ---------------------------------------------------------------------------
const appJsPath = path.join(ROOT, "App.js");
const appJs = fs.readFileSync(appJsPath, "utf8");
const m = appJs.match(/const PWA_ASSETS_VERSION = '(\d+)';/);
if (!m) {
  console.error("[FAIL] PWA_ASSETS_VERSION not found in App.js");
  process.exit(1);
}
fs.writeFileSync(appJsPath, appJs.replace(m[0], `const PWA_ASSETS_VERSION = '${+m[1] + 1}';`));
console.log(`[ok] App.js PWA_ASSETS_VERSION bumped to ${+m[1] + 1}`);

console.log(`done: bundle ${src.length} bytes, sw v${swNext}`);
