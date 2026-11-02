// Rebuild the maintained calendar boundary in BOTH shipped PWA copies.
// No untracked ZIP or extra runtime dependencies. Authored code lives in pwa/.
// Re-running with unchanged inputs is a no-op, including asset/cache versions.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = __dirname;
const bundlePath = "assets/index-legacy-eCmZKwFb.js";
const web = path.join(root, "tusi-web-dist");
const native = path.join(root, "assets/www");
let source = fs.readFileSync(path.join(web, bundlePath), "utf8");
const original = source;
const read = name => fs.readFileSync(path.join(root, "pwa", name), "utf8").trim();

function replaceOnce(before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Patch anchor must match once (${count}): ${before.slice(0, 90)}`);
  source = source.replace(before, () => after);
}
function section(name, content, install) {
  const start = `/* period:${name}:start */`;
  const end = `/* period:${name}:end */`;
  const block = `${start}\n${content}\n${end}`;
  const first = source.indexOf(start);
  if (first !== -1) {
    const last = source.indexOf(end, first);
    if (last === -1) throw new Error(`Missing end marker: ${name}`);
    source = source.slice(0, first) + block + source.slice(last + end.length);
  } else install(block);
}

section("save", "function s(next=e.value){localStorage.setItem(Kl,JSON.stringify(next));e.value=next}",
  block => replaceOnce("function s(){localStorage.setItem(Kl,JSON.stringify(e.value))}", block));
section("actions", `const periodActions=(${read("period-actions.js")})(e,s,` +
  "{parse:jl,format:Rl,add:Fl,isFuture:Ll});",
  block => replaceOnce("dn(o,e=>{localStorage.setItem(Zl", block + "dn(o,e=>{localStorage.setItem(Zl"));
const methods = ["previewPeriod", "previewPeriodUpdate", "addPeriod", "setPeriodStart", "setPeriodEnd", "removePeriod"];
section("methods", methods.map(name => `${name}:periodActions.${name}`).join(","), block => {
  const start = source.indexOf("addPeriod:function(t){");
  const end = source.indexOf(",getDayRole:function(t)", start);
  if (start === -1 || end === -1) throw new Error("Store methods boundary not found");
  source = source.slice(0, start) + block + source.slice(end);
});
if (source.includes("o.valid?(e.value=o.periods,s(),")) {
  replaceOnce("o.valid?(e.value=o.periods,s(),", "o.valid?(s(o.periods),");
}

const calendar = read("calendar.js").replace("__PERIOD_CALENDAR_CSS__", JSON.stringify(read("calendar.css")));
section("calendar", `uc=${calendar}`, block => {
  const start = source.indexOf('tc={class:"flex items-center justify-between mb-5"');
  const end = source.indexOf(',dc={class:', start);
  if (start === -1 || end === -1) throw new Error("Calendar component boundary not found");
  source = source.slice(0, start) + block + source.slice(end);
});

// The calendar owns contextual guidance. The existing footer only shows
// actual prediction results, never a second onboarding/status message.
if (source.includes('St(t).isFirstTime?(br(),Ar("div",Tc')) {
  const start = source.indexOf('St(t).isFirstTime?(br(),Ar("div",Tc');
  const end = source.indexOf('St(t).prediction?(br(),Ar("div",jc', start);
  if (end === -1) throw new Error("Home guidance boundary not found");
  source = source.slice(0, start) + source.slice(end);
}
// Make the existing footer a compiler-compatible conditional block. Merely
// adding a dynamic style to a hoisted node would leave it permanently hidden.
const footerAnchor = 'Or("div",Pc,[Or("div",';
if (source.includes(footerAnchor)) {
  const start = source.indexOf(footerAnchor);
  let depth = 0, quote = null, escaped = false, end = -1;
  for (let index = start + 2; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) { end = index + 1; break; }
  }
  if (end < 0) throw new Error("Home footer boundary not found");
  const footer = source.slice(start, end).replace('Or("div",Pc,', 'Ar("div",Pc,');
  source = source.slice(0, start) + `St(t).prediction?(br(),${footer}):jr("",!0)` + source.slice(end);
}
// Parse the WHOLE generated artifact before touching either shipped copy.
new vm.Script(source, { filename: bundlePath });
const nativeBundle = fs.readFileSync(path.join(native, bundlePath), "utf8");
const changed = source !== original || nativeBundle !== source;
if (!changed) { console.log("PWA is current; no version changes."); process.exit(0); }

const swPath = path.join(web, "sw.js");
const appPath = path.join(root, "App.js");
const sw = fs.readFileSync(swPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
if (!/period-pwa-v\d+/.test(sw) || !/PWA_ASSETS_VERSION = '\d+'/.test(app)) {
  throw new Error("Cache/asset version markers not found");
}
const swNext = sw.replace(/period-pwa-v(\d+)/, (_, version) => `period-pwa-v${Number(version) + 1}`);
const appNext = app.replace(/PWA_ASSETS_VERSION = '(\d+)'/, (_, version) => `PWA_ASSETS_VERSION = '${Number(version) + 1}'`);
for (const directory of [web, native]) fs.writeFileSync(path.join(directory, bundlePath), source);
fs.writeFileSync(swPath, swNext);
fs.writeFileSync(path.join(native, "sw.js.txt"), swNext);
fs.writeFileSync(appPath, appNext);
console.log("Rebuilt calendar + store; web/native artifacts synchronized; cache and assets versioned.");
