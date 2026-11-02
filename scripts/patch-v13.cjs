const fs = require('fs');
const path = require('path');
module.exports = function patchV13(src) {
  const replace = (old, next) => {
    if (src.includes(next)) return;
    if (src.split(old).length !== 2) throw new Error('v1.3 patch anchor mismatch: '+old.slice(0,90));
    src = src.replace(old,next);
  };
  src = src.replace(/\n*\/\* PERIOD_V13_BEGIN \*\/[\s\S]*?\/\* PERIOD_V13_END \*\/\n*/,'');
  const engine = fs.readFileSync(path.join(__dirname,'../src/algorithm-v13.js'),'utf8')
    .replace("'use strict';",'').replace(/if \(typeof module[^\n]+/,'');
  const cards = fs.readFileSync(path.join(__dirname,'../src/algorithm-v13-cards.js'),'utf8');
  const code = '\n/* PERIOD_V13_BEGIN */\n'+engine+'\nconst periodV13=createPeriodV13();\n'+cards+'\n/* PERIOD_V13_END */\n';
  replace('function Yl(e,t,n){switch(e){',code+'function Yl(e,t,n){switch(e){');
  replace('switch(e){case"1.0":return Wl(t);','switch(e){case"1.3":return periodV13.predict(t);case"1.0":return Wl(t);');
  replace('{version:"1.2",label:"v1.2 — 智能"},{version:"custom"','{version:"1.2",label:"v1.2 — 智能"},{version:"1.3",label:"v1.3 — 自适应"},{version:"custom"');
  replace('t=_t(localStorage.getItem(Xl)||"1.2")','t=_t((()=>{const saved=localStorage.getItem(Xl);if(!localStorage.getItem("period-v13-migrated")){localStorage.setItem("period-v13-migrated","1");const next=saved==="custom"?saved:"1.3";localStorage.setItem(Xl,next);return next}return ["1.0","1.1","1.2","1.3","custom"].includes(saved)?saved:"1.3"})())');
  replace('Or("div",mc,["1.0"===e.currentVersion?', 'Or("div",mc,["1.3"===e.currentVersion?renderPeriodV13Cards():"1.0"===e.currentVersion?');
  replace('fc={class:"flex mb-5 p-1 bg-[#f2f3f5] rounded-xl overflow-x-auto",','fc={class:"flex mb-5 p-1 bg-[#f2f3f5] rounded-xl overflow-x-auto",role:"tablist","aria-label":"预测算法版本",style:{flexWrap:"nowrap",gap:"4px",overflowX:"auto",overscrollBehaviorX:"contain",scrollPadding:"4px"},onKeydown:event=>{const tabs=Array.from(event.currentTarget.querySelectorAll("[role=tab]"));let i=tabs.indexOf(event.target);if(i<0)return;const keys={ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1};if(!(event.key in keys))return;event.preventDefault();const tab=tabs[keys[event.key]];tab.click();tab.focus()},ref:el=>{if(el)requestAnimationFrame(()=>{const tab=el.querySelector("[aria-selected=true]");if(tab){const left=tab.offsetLeft-el.offsetLeft;if(left<el.scrollLeft)el.scrollLeft=left;else if(left+tab.offsetWidth>el.scrollLeft+el.clientWidth)el.scrollLeft=left+tab.offsetWidth-el.clientWidth}})},');
  replace('key:n.version,class:W(["flex-1 min-w-0 py-2', 'key:n.version,role:"tab","aria-selected":e.currentVersion===n.version,tabindex:e.currentVersion===n.version?0:-1,class:W(["flex-1 min-w-0 py-2');
  replace('style:{"font-family":"\'Outfit\', sans-serif"},onClick:e=>t.$emit("update:version",n.version)', 'style:{"font-family":"\'Outfit\', sans-serif",flex:"0 0 auto",paddingLeft:"14px",paddingRight:"14px",whiteSpace:"nowrap",minHeight:"40px"},onClick:e=>t.$emit("update:version",n.version)');
  // Compiled dynamic prop list must include the new accessibility attributes.
  replace('hc=["onClick"]','hc=["onClick","aria-selected","tabindex"]');
  return src;
};
