const {chromium}=require('playwright');
const fs=require('node:fs'), http=require('node:http'), path=require('node:path'), assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'tusi-web-dist');
const cacheName=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/period-pwa-v\d+/)[0];
const old=p=>execFileSync('git',['show','92cc92d:tusi-web-dist/'+p],{cwd:__dirname});
let modern=false, workerModern=false, browser;
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');
 res.setHeader('Cache-Control','no-store');
 if((!modern&&['index.html','assets/index-legacy-eCmZKwFb.js'].includes(p))||(p==='sw.js'&&!workerModern))return res.end(old(p));
 try{res.end(fs.readFileSync(path.join(root,p)))}catch{res.statusCode=404;res.end()}
});
(async()=>{
 await new Promise(r=>server.listen(8877,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--in-process-gpu']});
 const context=await browser.newContext();const page=await context.newPage();
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.goto('http://127.0.0.1:8877/');await page.getByRole('button',{name:'预测算法说明'}).click();
 assert.equal(await page.locator('button').filter({hasText:'v1.3'}).count(),0);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;localStorage.setItem('upgrade-proof','retain');});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 console.log('PASS genuine old worker and cache installed');
 modern=true;
 await page.reload();await page.getByRole('button',{name:'预测算法说明'}).click();
 assert.equal(await page.getByRole('tab',{name:'v1.3 — 自适应'}).count(),1);
 assert.equal(await page.evaluate(()=>localStorage.getItem('upgrade-proof')),'retain');
 console.log('PASS versioned script bypasses old cache before worker update; local data retained');
 workerModern=true;
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
 await page.waitForFunction(async(expected)=>{const names=await caches.keys();return names.includes(expected)&&!names.includes('period-pwa-v11')},cacheName);
 await page.waitForFunction(()=>document.querySelector('#app')?.innerHTML.length>100);
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'预测算法说明'}).click();
 assert.equal(await page.getByRole('tab',{name:'v1.3 — 自适应'}).count(),1);
 console.log('PASS upgraded PWA reopens offline with v1.3');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
