/* ============================================================
   Auto EDA — sections/categorical.js
   Section 03 · Categorical Features

   One card per categorical column with count / unique / mode
   stats and a bar chart of the top values. Uses horizontal
   bars when there are more than four categories.

   User controls: chip-style multi-select picker above the grid.
   Defaults to the top 5 categorical columns with the lowest
   missing count. Presets: Top 5 / All / Clear.

   Reads from core.js: catCols, stats, rawData, charts,
                       MAX_CAT_SHOW, sid, pctStr, int, chartColors.
   Writes to DOM:      #categorical-out, #cat-sub, #cat-picker
   ============================================================ */

let selectedCategorical = [];

function topCategoricalByLeastMissing(k){
  return [...catCols]
    .map((c,i)=>({c, i, m: stats[c]?.missing ?? Infinity}))
    .sort((a,b)=> a.m - b.m || a.i - b.i)
    .slice(0,k)
    .map(x=>x.c);
}

function renderCategorical(){
  selectedCategorical = topCategoricalByLeastMissing(Math.min(5, catCols.length));

  const sub=document.getElementById('cat-sub');
  sub.textContent = `${catCols.length} categorical column${catCols.length!==1?'s':''} available · pick which to display below`;

  renderCatPicker();
  renderCatCards();
}

function renderCatPicker(){
  const host=document.getElementById('cat-picker');
  if(!host) return;
  host.innerHTML='';
  if(catCols.length===0){
    host.innerHTML='<div class="callout amber">No categorical columns detected.</div>';
    return;
  }

  const box=document.createElement('div');
  box.className='picker';

  const head=document.createElement('div');
  head.className='picker-head';
  head.innerHTML=`
    <div class="picker-title">Categorical columns (${catCols.length})</div>
    <div class="picker-actions">
      <button class="btn-sm" data-act="top5">Top 5 (least missing)</button>
      <button class="btn-sm" data-act="all">All</button>
      <button class="btn-sm" data-act="clear">Clear</button>
    </div>`;
  box.appendChild(head);

  const chips=document.createElement('div');
  chips.className='picker-chips';
  catCols.forEach(col=>{
    const chip=document.createElement('span');
    chip.className='chip'+(selectedCategorical.includes(col)?' active':'');
    chip.dataset.col=col;
    chip.textContent=col;
    chips.appendChild(chip);
  });
  box.appendChild(chips);

  const meta=document.createElement('div');
  meta.className='picker-meta';
  meta.id='cat-picker-meta';
  box.appendChild(meta);

  host.appendChild(box);

  chips.addEventListener('click', e=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    const col=chip.dataset.col;
    const i=selectedCategorical.indexOf(col);
    if(i>=0) selectedCategorical.splice(i,1); else selectedCategorical.push(col);
    chip.classList.toggle('active');
    renderCatCards();
    updateCatMeta();
  });

  head.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const act=btn.dataset.act;
    if(act==='top5') selectedCategorical = topCategoricalByLeastMissing(Math.min(5,catCols.length));
    if(act==='all')  selectedCategorical = [...catCols];
    if(act==='clear') selectedCategorical = [];
    chips.querySelectorAll('.chip').forEach(c=>{
      c.classList.toggle('active', selectedCategorical.includes(c.dataset.col));
    });
    renderCatCards();
    updateCatMeta();
  });

  updateCatMeta();
}

function updateCatMeta(){
  const meta=document.getElementById('cat-picker-meta');
  if(!meta) return;
  const n=selectedCategorical.length;
  const over = n>MAX_CAT_SHOW ? ` · capped at ${MAX_CAT_SHOW} for performance` : '';
  meta.textContent = n===0 ? 'Nothing selected.' : `Showing ${Math.min(n,MAX_CAT_SHOW)} of ${catCols.length}${over}`;
}

function renderCatCards(){
  const cols=selectedCategorical.slice(0,MAX_CAT_SHOW);
  const out=document.getElementById('categorical-out');
  out.innerHTML='';

  if(cols.length===0){
    out.innerHTML='<div class="callout">Select one or more columns above to view value counts.</div>';
    return;
  }

  cols.forEach(col=>{
    const s=stats[col]||{};
    const mp=s.missing/rawData.length;
    const cid='b_'+sid(col);

    const div=document.createElement('div');
    div.className='feat-card';
    div.innerHTML=`
      <div class="feat-name" title="${col}">${col}</div>
      <div class="feat-meta">
        <span class="tag tag-cat">categorical</span>
        ${mp>0?`<span class="tag tag-miss">missing ${pctStr(mp)}</span>`:'<span class="tag tag-ok">complete</span>'}
        <span class="tag tag-num">${int(s.unique||0)} unique</span>
        ${s.unique===rawData.length&&rawData.length>10?'<span class="tag tag-purple">possible ID</span>':''}
        ${s.unique===1?'<span class="tag tag-bad">constant</span>':''}
      </div>
      <div class="fs-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="fs-box"><div class="fs-lbl">Count</div><div class="fs-val">${int(s.count||0)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Unique</div><div class="fs-val">${int(s.unique||0)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Top Value</div><div class="fs-val" title="${s.mode||''}" style="font-size:11px">${s.mode||'—'}</div></div>
      </div>
      <div class="chart-wrap"><canvas id="${cid}"></canvas></div>`;
    out.appendChild(div);
    requestAnimationFrame(()=>makeBarChart(cid,s));
  });
}

function makeBarChart(cid,s){
  const canvas=document.getElementById(cid);
  if(!canvas||!s.topValues) return;
  const c=chartColors();
  const top=s.topValues.slice(0,8);
  const horiz=top.length>4;

  if(charts[cid]) charts[cid].destroy();
  charts[cid]=new Chart(canvas,{
    type:'bar',
    data:{
      labels:top.map(([v])=>String(v).length>16?String(v).slice(0,14)+'…':String(v)),
      datasets:[{
        data:top.map(([,c])=>c),
        backgroundColor:top.map((_,i)=>i===0?'rgba(29,158,117,0.85)':'rgba(29,158,117,0.35)'),
        borderRadius:3,borderWidth:0
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,indexAxis:horiz?'y':'x',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`Count: ${ctx.parsed[horiz?'x':'y']}`}}},
      scales:{
        x:{grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}},
        y:{grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}}
      }
    }
  });
}
