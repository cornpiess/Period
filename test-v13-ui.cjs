const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--in-process-gpu']});
 const results=[];
 async function check(name, fn){await fn();results.push(name);console.log('PASS '+name)}
 const errors=[];
 const context=await browser.newContext({viewport:{width:320,height:740},deviceScaleFactor:1});
 if(process.env.QA_FONT_PATH){const font=fs.readFileSync(process.env.QA_FONT_PATH).toString('base64');await context.addInitScript(data=>{const face=new FontFace('QAChinese','url(data:font/woff2;base64,'+data+')');document.fonts.add(face);face.load();document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent="*{font-family:QAChinese,sans-serif!important}";document.head.appendChild(style)})},font)}
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8888/#/');
 await page.getByRole('button',{name:'预测算法说明'}).click();
 await check('new users default to v1.3',async()=>{await page.getByRole('tab',{name:'v1.3 — 自适应'}).waitFor();assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'v1.3 — 自适应')});
 await check('v1.3 cards visible and complete',async()=>{assert.equal(await page.locator('[data-algorithm="1.3"] h4').count(),5);assert.ok(await page.locator('[data-algorithm="1.3"]').isVisible())});
 await check('320px tabs overflow inside container only',async()=>{assert.ok(await page.getByRole('tablist').evaluate(el=>el.scrollWidth>el.clientWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))});
 await check('selected tab automatically visible',async()=>{assert.ok(await page.getByRole('tab',{selected:true}).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1}))});
 await check('all five tabs reachable and descriptions switch',async()=>{for(const label of ['v1.0 — MAD','v1.1 — 截断','v1.2 — 智能','v1.3 — 自适应','自定义']){await page.getByRole('tab',{name:label,exact:true}).click();assert.equal(await page.getByRole('tab',{selected:true}).textContent(),label)}assert.ok(await page.getByText('自定义算法配置',{exact:true}).isVisible())});
 await check('keyboard navigation updates selection and focus',async()=>{const tab=page.getByRole('tab',{name:'自定义',exact:true});await tab.focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'v1.3 — 自适应');assert.equal(await page.locator(':focus').textContent(),'v1.3 — 自适应')});
 await page.getByRole('tab',{name:'v1.2 — 智能',exact:true}).click();await page.reload();await page.getByRole('button',{name:'预测算法说明'}).click();
 await check('manual older selection survives reload',async()=>assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'v1.2 — 智能'));
 await page.evaluate(()=>{localStorage.setItem('period-algo-version','1.2');localStorage.removeItem('period-v13-migrated')});await page.reload();await page.getByRole('button',{name:'预测算法说明'}).click();
 await check('existing users migrate once to v1.3',async()=>assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'v1.3 — 自适应'));
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);await page.screenshot({path:path.join(os.tmpdir(),'period-v13-mobile.png')});
 await page.evaluate(()=>{localStorage.setItem('period-algo-version','custom');localStorage.removeItem('period-v13-migrated')});await page.reload();await page.getByRole('button',{name:'预测算法说明'}).click();
 await check('custom algorithm selection preserved during migration',async()=>assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'自定义'));
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>{let day=Date.UTC(2026,5,1);const rs=[day];[20,20,20].forEach(g=>rs.push(day+=g*86400000));localStorage.setItem('period-tracker-v4',JSON.stringify(rs.map((x,i)=>({id:String(i),startDate:new Date(x).toISOString().slice(0,10),endDate:new Date(x+6*86400000).toISOString().slice(0,10)}))));localStorage.setItem('period-algo-version','1.3')});await page.reload();
 await check('v1.3 actually drives calendar and status card',async()=>{assert.ok((await page.locator('body').innerText()).includes('周期 20天'));assert.ok(!(await page.locator('body').innerText()).includes('NaN'))});
 await page.getByRole('button',{name:'预测算法说明'}).click();await page.setViewportSize({width:1280,height:900});
 await check('wide screen remains within modal',async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('[data-algorithm="1.3"]').isVisible())});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);await page.screenshot({path:path.join(os.tmpdir(),'period-v13-desktop.png')});
 await check('no JavaScript runtime errors',async()=>assert.deepEqual(errors,[]));
 await browser.close();console.log(results.length+' browser tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
