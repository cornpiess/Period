// Dev preview server for the PWA — ONE stable URL, never stale.
//
// Why this exists: the shipped sw.js is cache-first (correct for production
// users), which makes any browser preview stick to old assets until the SW
// lifecycle rotates. This server neutralizes that for LOCAL PREVIEW ONLY:
//   - /sw.js is replaced by a pass-through SW (skipWaiting + claim + drop old
//     caches, no fetch interception) so a previously registered caching SW is
//     displaced immediately and never shadows the preview again
//   - every response carries Cache-Control: no-store
//   - everything else is served straight from tusi-web-dist/
// The shipped artifacts (tusi-web-dist/, assets/www/) are untouched.
//
// Run: node preview-server.cjs    → http://127.0.0.1:8765 (and :8767 alias)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "tusi-web-dist");
const PORTS = [8888, 8765, 8767]; // 8888 canonical; old ports stay alive for stale tabs

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const PASSTHROUGH_SW = `// preview-only pass-through: displace any caching SW, never intercept fetch
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
`;

// Injected into served index.html in place of the production SW registration:
// unregister every SW on this origin, drop all their caches, then reload ONCE
// (sessionStorage guard prevents a loop). Heals any browser that ever
// registered the old caching SW, without relying on SW update checks.
const SW_REG_ANCHOR = 'navigator.serviceWorker.register("./sw.js").catch(function () {});';
const SW_SELF_CLEAN =
  'navigator.serviceWorker.getRegistrations().then(function(rs){if(!rs.length)return;' +
  'return Promise.all(rs.map(function(r){return r.unregister()}))' +
  '.then(function(){return caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))})' +
  '.then(function(){sessionStorage.setItem("__sw_clean__","1");location.reload()})})}).catch(function(){});';

let cachedIndex = null;
function serveIndex(res) {
  if (!cachedIndex) {
    let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    if (html.includes(SW_REG_ANCHOR)) {
      html = html.replace(SW_REG_ANCHOR, SW_SELF_CLEAN);
    } else {
      console.error("[warn] SW registration anchor not found in index.html; serving as-is");
    }
    cachedIndex = Buffer.from(html, "utf8");
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(cachedIndex);
}

function makeServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/" || urlPath === "/index.html") return serveIndex(res);
    if (urlPath === "/sw.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(PASSTHROUGH_SW);
      return;
    }
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "Cache-Control": "no-store" }); res.end("not found"); return; }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  });
}

for (const port of PORTS) {
  makeServer().listen(port, "127.0.0.1", () => console.log(`preview: http://127.0.0.1:${port}`));
}
