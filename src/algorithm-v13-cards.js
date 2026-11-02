// Compiled into the existing Vue render scope by scripts/patch-v13.cjs.
function renderPeriodV13Cards() {
  const badge = (text, color) => Or('span', {style: {display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:'0',width:'24px',height:'24px',borderRadius:'7px',background:color,color:'white',fontWeight:'700',marginTop:'2px'}}, text);
  const example = text => Or('p', {style:{marginTop:'10px'}}, [Or('span', {style:{display:'inline-block',padding:'5px 9px',borderRadius:'8px',fontSize:'12px',background:'rgba(46,124,246,.08)',color:'#2E7CF6'}}, text)]);
  const row = (mark, color, title, text) => Or('div', {style:{display:'flex',gap:'10px',marginTop:'12px'}}, [badge(mark,color), Or('div',{},[Or('p',{style:{fontWeight:'600',color:'#181e25'}},title),Or('p',{style:{marginTop:'3px'}},text)])]);
  const card = (number, title, children) => Or('div', {style:{background:'#f8f8fc',borderRadius:'16px',padding:'16px'}}, [Or('h4',{style:{fontSize:'15px',fontWeight:'600',color:'#181e25',marginBottom:'8px',fontFamily:"'Outfit', sans-serif"}},number+'. '+title),...children]);
  return Or('div', {'data-algorithm':'1.3',style:{display:'grid',gap:'16px'}}, [
    Or('div',{style:{padding:'12px 16px',borderRadius:'12px',background:'rgba(52,199,89,.09)',color:'#248b42',fontWeight:'600'}},'v1.3 — 自适应 · 默认算法'),
    card(1,'只用开始日期，理解你的周期',[
      Or('p',{},'按实际开始日期排序，计算相邻两次的间隔。至少记录 2 次即可预测；只有一个间隔时，先以这次间隔作为参考。'),
      example('预测起点 = 最近一次记录的开始日期'),
      Or('p',{style:{fontSize:'12px',color:'#8e8e93',marginTop:'8px'}},'记录时默认生成的 7 天方便日历标记，不用于推算下次开始日。'),
    ]),
    card(2,'同时考虑规律、波动和可能的漏记',[
      Or('p',{},'算法在内部比较不同周期长度的可能性，同时估计你的波动。一次偏长或偏短，不会直接改写长期规律。'),
      row('稳','#2E7CF6','稳定记录 — 稳健估计','规律明确时，预测集中在你的典型周期附近；不同寻常的间隔保留在记录中。'),
      row('疑','#F26DAD','疑似漏记 — 保留多种解释','有足够历史后，较长间隔会同时考虑真实延长、漏记一次或漏记两次的可能。推测不会生成新的经期记录。'),
      example('56 天可能是一次长周期，也可能包含两次周期；不直接认定为 28＋28'),
    ]),
    card(3,'跟随持续变化，谨慎识别交替',[
      row('变','#AF52DE','持续变化 — 逐步更新','内部估计允许周期基线改变。连续出现的新间隔，会逐步改变预测；不会把长周期统一拉回固定天数。'),
      row('验','#34C759','长短交替 — 先检验，再参与','至少有 7 个间隔，并在至少 3 个历史预测点检验交替表现。只有比基础预测误差更低、长短差异明确时，才逐步增加它的影响。'),
      example('28、35、28、35……需要持续的预测证据，才增加交替模式的权重'),
    ]),
    card(4,'综合计算，给出一个预计日期',[
      Or('p',{},'将内部各种可能性综合后，取预测分布的中位数，得到整数周期天数，再加到最近一次开始日期上。'),
      example('预计日期 = 最近一次开始日期 ＋ 预测周期天数'),
      Or('p',{style:{marginTop:'8px'}},'新增、删除或修改记录后自动重算。没有新记录时，预计日期不会每天向后顺延。'),
    ]),
    card(5,'数据不足时，保持结果可用',[
      Or('p',{},'记录较少时不启用交替模式；计算遇到数值问题时，回退到有效间隔的中位数。日期校验和去重只用于计算，不改动你的原始记录。'),
      Or('p',{style:{fontSize:'12px',color:'#8e8e93',marginTop:'8px'}},'预测依据历史开始日期，不能确定身体变化或漏记的原因，也不用于判断排卵或避孕。v1.3 的真实准确度仍需持续验证。'),
    ]),
  ]);
}
