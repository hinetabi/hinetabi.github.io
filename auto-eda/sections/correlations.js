/* ============================================================
   Auto EDA — sections/correlations.js
   Section 04 · Numeric Feature Correlations

   Renders a user-selectable Pearson matrix as a hand-drawn
   heatmap on a <canvas>. Cell colour interpolates from white
   toward green (positive) or red (negative); text is
   auto-contrasted.

   User controls: chip-style multi-select picker above the
   heatmap. Defaults to the top 5 numeric columns with the
   lowest missing count. Needs ≥2 selected to render.

   The matrix for the user's selection is computed on demand
   via corrMatFor(cols) (defined in core.js). The global
   corrMat (precomputed for the first MAX_CORR_COLS numerics)
   is used by sections/insights.js for multicollinearity flags
   and is not touched here.

   Note: renderCorrHeatmap is also re-invoked from core.js's
   toggleDark() so the canvas background matches the theme.

   Reads from core.js: numCols, stats, MAX_CORR_COLS, corrMatFor.
   Writes to DOM:      #corr-out
   ============================================================ */

let selectedCorr = [];
let activeCorrMat = {};     // matrix for the current selection
let activeCorrCols = [];    // column order matching activeCorrMat

function topNumericByLeastMissingForCorr(k){
  return [...numCols]
    .map((c,i)=>({c, i, m: stats[c]?.missing ?? Infinity}))
    .sort((a,b)=> a.m - b.m || a.i - b.i)
    .slice(0,k)
    .map(x=>x.c);
}

function corrColor(r){
  const t=Math.abs(r);
  if(r>=0){return[Math.round(255*(1-t)+29*t),Math.round(255*(1-t)+158*t),Math.round(255*(1-t)+117*t)]}
  else{return[Math.round(255*(1-t)+239*t),Math.round(255*(1-t)+68*t),Math.round(255*(1-t)+68*t)]}
}

function renderCorrelation(){
  const out=document.getElementById('corr-out');
  out.innerHTML='';

  if(numCols.length<2){
    out.innerHTML='<div class="callout amber">Need at least 2 numeric columns to compute correlations.</div>';
    return;
  }

  selectedCorr = topNumericByLeastMissingForCorr(Math.min(5, numCols.length));
  renderCorrPicker();
  renderCorrMatrix();
}

function renderCorrPicker(){
  const out=document.getElementById('corr-out');
  // Picker card
  const pickCard=document.createElement('div');
  pickCard.className='picker';
  pickCard.id='corr-picker';

  const head=document.createElement('div');
  head.className='picker-head';
  head.innerHTML=`
    <div class="picker-title">Numeric columns to correlate (${numCols.length} available)</div>
    <div class="picker-actions">
      <button class="btn-sm" data-act="top5">Top 5 (least missing)</button>
      <button class="btn-sm" data-act="all">All (max ${MAX_CORR_COLS})</button>
      <button class="btn-sm" data-act="clear">Clear</button>
    </div>`;
  pickCard.appendChild(head);

  const chips=document.createElement('div');
  chips.className='picker-chips';
  numCols.forEach(col=>{
    const chip=document.createElement('span');
    chip.className='chip'+(selectedCorr.includes(col)?' active':'');
    chip.dataset.col=col;
    chip.textContent=col;
    chips.appendChild(chip);
  });
  pickCard.appendChild(chips);

  const meta=document.createElement('div');
  meta.className='picker-meta';
  meta.id='corr-picker-meta';
  pickCard.appendChild(meta);

  out.appendChild(pickCard);

  // Matrix card (filled by renderCorrMatrix).
  const matrixCard=document.createElement('div');
  matrixCard.className='card';
  matrixCard.id='corr-matrix-card';
  out.appendChild(matrixCard);

  chips.addEventListener('click', e=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    const col=chip.dataset.col;
    const i=selectedCorr.indexOf(col);
    if(i>=0){
      selectedCorr.splice(i,1);
    } else {
      // Enforce MAX_CORR_COLS hard cap on manual picks.
      if(selectedCorr.length>=MAX_CORR_COLS) return;
      selectedCorr.push(col);
    }
    chip.classList.toggle('active', selectedCorr.includes(col));
    renderCorrMatrix();
  });

  head.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const act=btn.dataset.act;
    if(act==='top5') selectedCorr = topNumericByLeastMissingForCorr(Math.min(5,numCols.length));
    if(act==='all')  selectedCorr = numCols.slice(0,MAX_CORR_COLS);
    if(act==='clear') selectedCorr = [];
    chips.querySelectorAll('.chip').forEach(c=>{
      c.classList.toggle('active', selectedCorr.includes(c.dataset.col));
    });
    renderCorrMatrix();
  });
}

function updateCorrMeta(msg){
  const meta=document.getElementById('corr-picker-meta');
  if(meta) meta.textContent = msg;
}

function renderCorrMatrix(){
  const card=document.getElementById('corr-matrix-card');
  if(!card) return;

  if(selectedCorr.length<2){
    card.innerHTML='<div class="callout">Select at least 2 numeric columns above to view the correlation matrix.</div>';
    updateCorrMeta(`${selectedCorr.length} selected · need ≥2`);
    activeCorrMat={}; activeCorrCols=[];
    return;
  }

  // Compute matrix for the current selection.
  activeCorrCols = [...selectedCorr];
  activeCorrMat = corrMatFor(activeCorrCols);

  card.innerHTML=`
    <div class="card-title">Pearson Correlation Matrix</div>
    <div class="card-sub">${activeCorrCols.length} selected columns · diagonal = 1.00.</div>
    <div class="corr-scroll"><canvas id="corr-canvas"></canvas></div>`;

  updateCorrMeta(`${activeCorrCols.length} selected${activeCorrCols.length>=MAX_CORR_COLS?` · hit ${MAX_CORR_COLS}-column cap`:''}`);
  renderCorrHeatmap();
}

function renderCorrHeatmap(){
  const cols=activeCorrCols;
  const canvas=document.getElementById('corr-canvas');
  if(!canvas||cols.length<2) return;

  const dark=document.body.classList.contains('dark');
  const cell=Math.min(54,Math.max(28,Math.floor(580/cols.length)));
  const lpad=130,tpad=130;
  const W=lpad+cols.length*cell, H=tpad+cols.length*cell;

  canvas.width=W; canvas.height=H;
  const scale=Math.min(1,680/W);
  canvas.style.width=Math.round(W*scale)+'px';
  canvas.style.height=Math.round(H*scale)+'px';

  const ctx=canvas.getContext('2d');
  const bg=dark?'#1c1c1a':'#ffffff';
  const tickCol=dark?'#888780':'#6b6b67';

  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.font=`${Math.min(11,cell*0.21)}px "DM Mono",monospace`;

  // Column headers (rotated 45°)
  cols.forEach((col,j)=>{
    const lbl=col.length>14?col.slice(0,12)+'…':col;
    ctx.save();
    ctx.translate(lpad+j*cell+cell/2, tpad-10);
    ctx.rotate(-Math.PI/4);
    ctx.textAlign='left'; ctx.fillStyle=tickCol;
    ctx.fillText(lbl,0,0);
    ctx.restore();
  });

  // Row labels
  cols.forEach((col,i)=>{
    const lbl=col.length>16?col.slice(0,14)+'…':col;
    ctx.textAlign='right'; ctx.fillStyle=tickCol;
    ctx.fillText(lbl, lpad-8, tpad+i*cell+cell/2+4);
  });

  // Cells
  cols.forEach((c1,i)=>cols.forEach((c2,j)=>{
    const r=activeCorrMat[c1]?.[c2]??0;
    const [R,G,B]=corrColor(r);
    ctx.fillStyle=`rgb(${R},${G},${B})`;
    ctx.fillRect(lpad+j*cell, tpad+i*cell, cell-1, cell-1);

    const fs=Math.max(8,Math.min(11,cell*0.22));
    ctx.font=`${fs}px "DM Mono",monospace`;
    ctx.textAlign='center';
    const bright=(R*299+G*587+B*114)/1000;
    ctx.fillStyle=bright>150?'rgba(26,26,24,0.85)':'rgba(255,255,255,0.95)';
    ctx.fillText(r.toFixed(2), lpad+j*cell+cell/2, tpad+i*cell+cell/2+fs*0.38);
  }));
}
