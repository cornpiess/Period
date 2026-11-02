const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const {predict, dayOf} = require('./src/algorithm-v13.js')();
const DAY=86400000;
function records(gaps) {
  let day=Date.UTC(2020,0,1);const starts=[day];
  gaps.forEach(x=>starts.push(day+=x*DAY));
  return starts.map((d,i)=>({id:String(i),startDate:new Date(d).toISOString().slice(0,10),endDate:new Date(d+6*DAY).toISOString().slice(0,10)}));
}
let checks=0;
function test(name, fn) { fn();checks++;console.log('PASS '+name); }
for(const [name,gaps,expected] of [
 ['one interval',[31],31],['stable',[28,28,28,28],28],
 ['short cycles',[20,20,20],20],['stable long cycles',[48,51,49,50],50],
 ['one unusual interval',[28,28,28,42,28],28],['missed log',[28,28,28,56,28],28],
 ['persistent new baseline',[28,28,28,35,35,35],35],['persistent long baseline',[28,28,28,50,50,50],50],
 ['validated alternating',[28,35,28,35,28,35,28,35],28],
 ]) test(name,()=>assert.equal(predict(records(gaps)).avgCycleLength,expected));
test('increasing sequence is not flipped to odd phase',()=>assert.ok(predict(records([26,30,34,38])).avgCycleLength>31));
test('no artificial normal range',()=>{for(const d of [1,10,20,50,100,500,1100])assert.equal(predict(records([d,d,d])).avgCycleLength,d)});
test('empty and single records',()=>{assert.equal(predict([]),null);assert.equal(predict(records([])),null);assert.equal(predict(null),null)});
test('date validation rejects rollover',()=>{assert.ok(Number.isNaN(dayOf('2025-02-30')));assert.ok(Number.isNaN(dayOf('invalid')));assert.ok(Number.isFinite(dayOf('2024-02-29')))});
test('sort and duplicate working view only',()=>{const r=records([28,28,28]);const x=[r[2],null,r[0],r[1],r[1],r[3],{startDate:'2025-02-30'}];const copy=JSON.stringify(x);assert.deepEqual(predict(x),predict(r));assert.equal(JSON.stringify(x),copy)});
test('duration independent of start prediction',()=>{const r=records([28,29,28]);const a=predict(r);r.forEach(x=>x.endDate=x.startDate);const b=predict(r);assert.equal(a.predictedStartDate,b.predictedStartDate);assert.equal(b.avgPeriodDuration,1)});
test('last real start and original records preserved',()=>{const r=records([28,28,28,56]);const copy=JSON.stringify(r),p=predict(r);assert.equal(p.lastPeriodStart,r.at(-1).startDate);assert.equal(p.periodCount,r.length);assert.equal(JSON.stringify(r),copy)});
test('DST and leap day use calendar days',()=>{const r=[{startDate:'2024-02-01'},{startDate:'2024-02-29'}];assert.equal(predict(r).predictedStartDate,'2024-03-28')});
test('deterministic and bounded across seeded histories',()=>{let seed=17;for(let i=0;i<100;i++){const gs=Array.from({length:2+i%15},()=>{seed=(seed*1664525+1013904223)>>>0;return 15+seed%90});const r=records(gs);const a=predict(r),b=predict(r);assert.deepEqual(a,b);assert.ok(Number.isInteger(a.avgCycleLength)&&a.avgCycleLength>0);assert.ok(Number.isFinite(dayOf(a.predictedStartDate)))}});
const shipped='assets/www/assets/index-legacy-eCmZKwFb.js';
test('both shipped bundles identical and parse',()=>{const code=fs.readFileSync(shipped,'utf8');assert.equal(code,fs.readFileSync('tusi-web-dist/assets/index-legacy-eCmZKwFb.js','utf8'));new vm.Script(code);assert.equal((code.match(/PERIOD_V13_BEGIN/g)||[]).length,1)});
test('render cards contain matching core explanation',()=>{const s=fs.readFileSync('src/algorithm-v13-cards.js','utf8');for(const text of ['至少记录 2 次','至少有 7 个间隔','中位数','不会每天向后顺延','不直接认定为 28＋28'])assert.ok(s.includes(text))});
test('build patch repeatable without private ZIP',()=>{const patch=require('./scripts/patch-v13.cjs');const original=fs.readFileSync(shipped,'utf8');assert.equal(patch(original).trim(),original.trim())});
const start=performance.now();predict(records(Array.from({length:24},(_,i)=>28+i%3)));console.log('24-cycle prediction: '+(performance.now()-start).toFixed(1)+'ms');
console.log(checks+' tests passed');
