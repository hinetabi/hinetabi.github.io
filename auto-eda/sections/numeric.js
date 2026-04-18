/* ============================================================
   Auto EDA — sections/numeric.js
   Section 02 · Numeric Features

   One card per numeric column: summary tags (missing rate,
   skew, outliers), 8-stat mini grid, and a histogram built
   from the precomputed bins in stats[col].

   User controls: chip-style multi-select picker above the grid.
   Defaults to the top 5 numeric columns with the lowest missing
   count. "Top 5" / "All" / "Clear" preset buttons are provided.

   Reads from core.js: numCols, stats, rawData, charts,
                       MAX_NUM_SHOW, sid, fmt, pctStr, int, chartColors.
   Writes to DOM:      #numeric-out, #num-sub, #num-picker
   ============================================================ */

// Module-level state. Reset on every renderNumeric() (i.e. every upload).
let selectedNumeric = [];

function topNumericByLeastMissing(k){
  // Sort by missing count ascending; ties keep original order.
  return [...numCols]
    .map((c,i)=>({c, i, m: stats[c]?.missing ?? Infinity}))
    .sort((a,b)=> a.m - b.m || a.i - b.i)
    .slice(0,k)
    .map(x=>x.c);
}

function renderNumeric(){
  // Default = top 5 least-missing numerics (or all if fewer than 5).
  selectedNumeric = topNumericByLeastMissing(Math.min(5, numCols.length));

  const sub=document.getElementById('num-sub');
  sub.textContent = `${numCols.length} numeric column${numCols.length!==1?'s':''} available · pick which to display below`;

  renderNumPicker();
  renderNumCards();
}

function renderNumPicker(){
  const host=document.getElementById('num-picker');
  if(!host) return;
  host.innerHTML='';
  if(numCols.length===0){
    host.innerHTML='<div class="callout amber">No numeric columns detected.</div>';
    return;
  }

  const box=document.createElement('div');
  box.className='picker';

  const head=document.createElement('div');
  head.className='picker-head';
  head.innerHTML=`
    <div class="picker-title">Numeric columns (${numCols.length})</div>
    <div class="picker-actions">
      <button class="btn-sm" data-act="top5">Top 5 (least missing)</button>
      <button class="btn-sm" data-act="all">All</button>
      <button class="btn-sm" data-act="clear">Clear</button>
    </div>`;
  box.appendChild(head);

  const chips=document.createElement('div');
  chips.className='picker-chips';
  numCols.forEach(col=>{
    const chip=document.createElement('span');
    chip.className='chip'+(selectedNumeric.includes(col)?' active':'');
    chip.dataset.col=col;
    chip.textContent=col;
    chips.appendChild(chip);
  });
  box.appendChild(chips);

  const meta=document.createElement('div');
  meta.className='picker-meta';
  meta.id='num-picker-meta';
  box.appendChild(meta);

  host.appendChild(box);

  // Chip toggle (delegated).
  chips.addEventListener('click', e=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    const col=chip.dataset.col;
    const i=selectedNumeric.indexOf(col);
    if(i>=0) selectedNumeric.splice(i,1); else selectedNumeric.push(col);
    chip.classList.toggle('active');
    renderNumCards();
    updateNumMeta();
  });

  // Preset buttons.
  head.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const act=btn.dataset.act;
    if(act==='top5') selectedNumeric = topNumericByLeastMissing(Math.min(5,numCols.length));
    if(act==='all')  selectedNumeric = [...numCols];
    if(act==='clear') selectedNumeric = [];
    // Refresh chip active states.
    chips.querySelectorAll('.chip').forEach(c=>{
      c.classList.toggle('active', selectedNumeric.includes(c.dataset.col));
    });
    renderNumCards();
    updateNumMeta();
  });

  updateNumMeta();
}

function updateNumMeta(){
  const meta=document.getElementById('num-picker-meta');
  if(!meta) return;
  const n=selectedNumeric.length;
  const over = n>MAX_NUM_SHOW ? ` · capped at ${MAX_NUM_SHOW} for performance` : '';
  meta.textContent = n===0 ? 'Nothing selected.' : `Showing ${Math.min(n,MAX_NUM_SHOW)} of ${numCols.length}${over}`;
}

function renderNumCards(){
  const cols=selectedNumeric.slice(0,MAX_NUM_SHOW);
  const out=document.getElementById('numeric-out');
  out.innerHTML='';

  if(cols.length===0){
    out.innerHTML='<div class="callout">Select one or more columns above to view distributions.</div>';
    return;
  }

  cols.forEach(col=>{
    const s=stats[col]||{};
    if(!s.count) return;
    const mp=s.missing/rawData.length;
    const skewAbs=Math.abs(s.skew||0);
    const skewLbl=skewAbs<0.5?'Symmetric':skewAbs<1?'Mod. skew':'High skew';
    const skewCls=skewAbs<0.5?'tag-ok':skewAbs<1?'tag-warn':'tag-bad';
    const cid='h_'+sid(col);

    const div=document.createElement('div');
    div.className='feat-card';
    div.innerHTML=`
      <div class="feat-name" title="${col}">${col}</div>
      <div class="feat-meta">
        <span class="tag tag-num">numeric</span>
        ${mp>0?`<span class="tag tag-miss">missing ${pctStr(mp)}</span>`:'<span class="tag tag-ok">complete</span>'}
        <span class="tag ${skewCls}">${skewLbl} (${(s.skew||0).toFixed(2)})</span>
        ${s.outlierPct>.02?`<span class="tag tag-warn">${pctStr(s.outlierPct)} outliers</span>`:''}
      </div>
      <div class="fs-grid">
        <div class="fs-box"><div class="fs-lbl">Mean</div><div class="fs-val">${fmt(s.mean)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Std</div><div class="fs-val">${fmt(s.std)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Min</div><div class="fs-val">${fmt(s.min)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Max</div><div class="fs-val">${fmt(s.max)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Q1</div><div class="fs-val">${fmt(s.q1)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Median</div><div class="fs-val">${fmt(s.median)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Q3</div><div class="fs-val">${fmt(s.q3)}</div></div>
        <div class="fs-box"><div class="fs-lbl">Count</div><div class="fs-val">${int(s.count)}</div></div>
      </div>
      <div class="chart-wrap"><canvas id="${cid}"></canvas></div>`;
    out.appendChild(div);
    requestAnimationFrame(()=>makeHistogram(cid,s));
  });
}

function makeHistogram(cid,s){
  const canvas=document.getElementById(cid);
  if(!canvas||!s.histCounts) return;
  const c=chartColors();
  if(charts[cid]) charts[cid].destroy();
  charts[cid]=new Chart(canvas,{
    type:'bar',
    data:{
      labels:s.histLabels,
      datasets:[{data:s.histCounts,backgroundColor:'rgba(29,158,117,0.75)',borderColor:'rgba(29,158,117,0.9)',borderWidth:0.5,borderRadius:2}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{title:ctx=>`≥ ${ctx[0].label}`,label:ctx=>`Count: ${ctx.parsed.y}`}}},
      scales:{
        x:{grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9},maxTicksLimit:8,maxRotation:0}},
        y:{grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}}
      }
    }
  });
}
