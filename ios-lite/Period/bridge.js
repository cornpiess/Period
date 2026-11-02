// iOS-only adapter. The calendar, algorithms, and clipboard UI remain shared.
(() => {
  "use strict";
  const keys = ["period-tracker-v4", "period-algo-version", "period-custom-config", "period-v13-migrated"];
  const backing = window.localStorage;
  const originalGet = Storage.prototype.getItem;
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  let snapshot = {};
  const call = message => {
    const response = JSON.parse(window.prompt("__PERIOD_NATIVE_V1__", JSON.stringify(message)) || "{}");
    if (!response.ok) throw new Error(response.error || "保存失败，请重试");
    return response;
  };
  const legacy = {};
  for (const key of keys) {
    const value = originalGet.call(backing, key);
    if (value !== null) legacy[key] = value;
  }
  const initial = call({ action: "bootstrap", legacy });
  snapshot = initial.values;
  // The authoritative native document is durable now. Remove the obsolete
  // browser copy so later deletions don't leave a second stale history behind.
  for (const key of keys) originalRemove.call(backing, key);
  Storage.prototype.getItem = function (key) {
    key = String(key);
    if (this === backing && keys.includes(key)) return snapshot[key] ?? null;
    return originalGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    key = String(key); value = String(value);
    if (this !== backing || !keys.includes(key)) return originalSet.call(this, key, value);
    if (key !== "period-v13-migrated") call({ action: "write", key, value });
    snapshot[key] = value; // publish only after atomic native persistence succeeded
  };
  Storage.prototype.removeItem = function (key) {
    key = String(key);
    if (this !== backing || !keys.includes(key)) return originalRemove.call(this, key);
    if (key !== "period-v13-migrated") call({ action: "write", key, value: null });
    delete snapshot[key];
  };
  // Preserve clipboard behavior while using UIPasteboard for the actual copy.
  const clipboard = { writeText: async text => { call({ action: "copy", text: String(text) }); } };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });

  function renderStatus() {
    const title = [...document.querySelectorAll("h3")].find(node => node.textContent.trim() === "备份与恢复");
    if (!title) return;
    const header = title.parentElement;
    let card = document.getElementById("period-icloud-status");
    if (!card) {
      card = document.createElement("div");
      card.id = "period-icloud-status";
      card.style.cssText = "background:#f8f8fc;border-radius:16px;padding:14px 16px;margin-bottom:16px;font-size:13px;color:#45515e;line-height:1.6";
      const text = document.createElement("div"); text.dataset.cloudStatus = ""; text.setAttribute("role", "status");
      const detail = document.createElement("p");
      detail.textContent = "换机时请使用 iPhone 迁移或恢复整机备份。仅登录相同 Apple 账户不会单独恢复本 App 记录。";
      detail.style.cssText = "font-size:11px;color:#8e8e93;margin-top:6px";
      card.append(text, detail);
      header.after(card);
    }
    const text = card.querySelector("[data-cloud-status]");
    const status = "记录保存在本机 · 支持系统备份与换机迁移";
    if (text.textContent !== status) text.textContent = status;
  }
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(renderStatus).observe(document.body, { childList: true, subtree: true });
    renderStatus();
  });
})();
