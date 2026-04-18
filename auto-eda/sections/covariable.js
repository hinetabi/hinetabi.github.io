/* ============================================================
   Auto EDA — sections/covariable.js
   Section 07 · Co-variable (Bivariate) Analysis

   Dropdown-driven: user picks two columns, we dispatch to the
   right view based on the pair's detected types.

     num × num  → scatter + OLS line, Pearson r / R² / slope
     num × cat  → per-group quartile bars, ANOVA F & η²
     cat × cat  → crosstab heatmap table, Chi² & Cramér's V

   Reads from core.js: headers, colTypes, rawData, numCols,
                       stats, charts, pearson, pct, fmt,
                       pctStr, int, chartColors.
   Writes to DOM:      #covar-out
   ============================================================ */
function renderCovar(){
  if(headers.length<2){
    document.getElementById('covar-out').innerHTML='<div class="callout amber">Need at least 2 columns for bivariate analysis.</div>';
    return;
  }
  const opts=headers.map(c=>{
    const tag=colTypes[c]==='numeric'?'num':'cat';
    return `<option value="${c}">${c}  ·  ${tag}</option>`;
  }).join('');

  document.getElementById('covar-out').innerHTML=`
    <div class="card">
      <div class="card-title">Pick Two Variables</div>
      <div class="card-sub">The tool picks the right chart & test based on the pair's types</div>
      <div class="covar-controls">
        <div>
          <label for="covar-x">X variable</label>
          <select id="covar-x" class="covar-select">${opts}</select>
        </div>
        <div>
          <label for="covar-y">Y variable</label>
          <select id="covar-y" class="covar-select">${opts}</select>
        </div>
      </div>
      <div id="covar-result"></div>
    </div>`;

  const xSel=document.getElementById('covar-x');
  const ySel=document.getElementById('covar-y');

  // Sensible defaults: two numerics if available, else two different columns
  const defX = numCols[0] || headers[0];
  const defY = numCols[1] || headers.find(h=>h!==defX) || headers[1] || headers[0];
  xSel.value=defX; ySel.value=defY;

  const update=()=>renderCovarResult(xSel.value, ySel.value);
  xSel.addEventListener('change',update);
  ySel.addEventListener('change',update);
  update();
}

function renderCovarResult(x,y){
  const out=document.getElementById('covar-result');
  if(!out||!x||!y) return;
  if(x===y){
    out.innerHTML='<div class="callout amber">Pick two different variables to compare.</div>';
    if(charts['covar-chart']){charts['covar-chart'].destroy();delete charts['covar-chart']}
    return;
  }
  const tx=colTypes[x], ty=colTypes[y];
  const pairTag=`<div class="covar-pair-tag"><span class="tag ${tx==='numeric'?'tag-num':'tag-cat'}">${x}</span> × <span class="tag ${ty==='numeric'?'tag-num':'tag-cat'}">${y}</span></div>`;

  if(tx==='numeric'&&ty==='numeric')          renderScatterPair(x,y,out,pairTag);
  else if(tx==='numeric'&&ty==='categorical') renderBoxPair(y,x,out,pairTag);
  else if(tx==='categorical'&&ty==='numeric') renderBoxPair(x,y,out,pairTag);
  else                                         renderCrossTabPair(x,y,out,pairTag);
}

// — NUM × NUM: scatter + OLS line —
function renderScatterPair(x,y,container,pairTag){
  const pairs=rawData.map(r=>[parseFloat(r[x]),parseFloat(r[y])])
    .filter(([a,b])=>!isNaN(a)&&!isNaN(b)&&isFinite(a)&&isFinite(b));
  if(pairs.length<2){
    container.innerHTML=pairTag+'<div class="callout amber">Not enough valid paired observations.</div>';
    if(charts['covar-chart']){charts['covar-chart'].destroy();delete charts['covar-chart']}
    return;
  }
  const xs=pairs.map(p=>p[0]), ys=pairs.map(p=>p[1]);
  const r=pearson(xs,ys);
  const mx=xs.reduce((s,v)=>s+v,0)/xs.length;
  const my=ys.reduce((s,v)=>s+v,0)/ys.length;
  let num=0,den=0;
  for(let i=0;i<xs.length;i++){num+=(xs[i]-mx)*(ys[i]-my);den+=(xs[i]-mx)**2}
  const slope=den===0?0:num/den;
  const intercept=my-slope*mx;
  const xMin=Math.min(...xs), xMax=Math.max(...xs);

  // Cap scatter points for performance
  const MAX_PTS=4000;
  const plotPairs= pairs.length>MAX_PTS
    ? pairs.filter((_,i)=>i%Math.ceil(pairs.length/MAX_PTS)===0)
    : pairs;

  const strength=Math.abs(r);
  const rCls=strength>.7?'green':strength>.3?'amber':'';

  container.innerHTML=`${pairTag}
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-lbl">N Pairs</div><div class="stat-val">${int(pairs.length)}</div></div>
      <div class="stat-box"><div class="stat-lbl">Pearson r</div><div class="stat-val ${rCls}">${r.toFixed(3)}</div></div>
      <div class="stat-box"><div class="stat-lbl">R²</div><div class="stat-val">${(r*r).toFixed(3)}</div></div>
      <div class="stat-box"><div class="stat-lbl">Slope (OLS)</div><div class="stat-val">${fmt(slope)}</div></div>
      <div class="stat-box"><div class="stat-lbl">Intercept</div><div class="stat-val">${fmt(intercept)}</div></div>
    </div>
    ${strength>=.7?`<div class="callout">Strong linear relationship (|r| ≥ 0.7). Watch for multicollinearity if both are model inputs.</div>`
      :strength>=.3?`<div class="callout blue">Moderate linear association (|r| ≈ ${strength.toFixed(2)}). Inspect the scatter for non-linear patterns.</div>`
      :`<div class="callout amber">Weak linear association (|r| &lt; 0.3). A non-linear transform or different model may help.</div>`}
    <div class="chart-wrap" style="height:360px"><canvas id="covar-chart"></canvas></div>`;

  const c=chartColors();
  if(charts['covar-chart']) charts['covar-chart'].destroy();
  charts['covar-chart']=new Chart(document.getElementById('covar-chart'),{
    type:'scatter',
    data:{
      datasets:[
        {type:'scatter',label:`${y} vs ${x}`,data:plotPairs.map(([a,b])=>({x:a,y:b})),
          backgroundColor:'rgba(29,158,117,0.45)',borderColor:'rgba(29,158,117,0.8)',borderWidth:0.5,pointRadius:2.5},
        {type:'line',label:'OLS fit',
          data:[{x:xMin,y:intercept+slope*xMin},{x:xMax,y:intercept+slope*xMax}],
          borderColor:'rgba(239,68,68,0.85)',borderWidth:1.5,pointRadius:0,fill:false,tension:0}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:c.tick,font:{family:'DM Mono',size:10}}},
        tooltip:{callbacks:{label:ctx=>ctx.dataset.type==='line'?'OLS fit':`(${fmt(ctx.parsed.x)}, ${fmt(ctx.parsed.y)})`}}
      },
      scales:{
        x:{type:'linear',title:{display:true,text:x,color:c.tick,font:{family:'DM Mono',size:10}},grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}},
        y:{title:{display:true,text:y,color:c.tick,font:{family:'DM Mono',size:10}},grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}}
      }
    }
  });
}

// — NUM × CAT: per-group quartile bars + ANOVA —
function renderBoxPair(catCol,numCol,container,pairTag){
  const groups={};
  rawData.forEach(r=>{
    const k=r[catCol];
    const v=parseFloat(r[numCol]);
    if(k===''||k==null||isNaN(v)||!isFinite(v)) return;
    (groups[k]=groups[k]||[]).push(v);
  });
  const MAX_GROUPS=15;
  const allEntries=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
  const entries=allEntries.slice(0,MAX_GROUPS);
  if(!entries.length){
    container.innerHTML=pairTag+'<div class="callout amber">No valid (category, numeric) pairs to display.</div>';
    if(charts['covar-chart']){charts['covar-chart'].destroy();delete charts['covar-chart']}
    return;
  }

  const boxData=entries.map(([k,vals])=>{
    const sorted=[...vals].sort((a,b)=>a-b);
    const q1=pct(sorted,25), median=pct(sorted,50), q3=pct(sorted,75);
    return {
      k, count:vals.length,
      min:sorted[0], q1, median, q3, max:sorted[sorted.length-1],
      mean:vals.reduce((s,v)=>s+v,0)/vals.length
    };
  });

  // One-way ANOVA (across the rendered groups)
  const allVals=entries.flatMap(e=>e[1]);
  const grandMean=allVals.reduce((s,v)=>s+v,0)/allVals.length;
  let ssB=0, ssW=0;
  entries.forEach(([,vals])=>{
    const m=vals.reduce((s,v)=>s+v,0)/vals.length;
    ssB += vals.length*(m-grandMean)**2;
    vals.forEach(v=>ssW+=(v-m)**2);
  });
  const dfB=entries.length-1, dfW=allVals.length-entries.length;
  const F=(dfB>0&&dfW>0&&ssW>0)?(ssB/dfB)/(ssW/dfW):0;
  const etaSq=(ssB+ssW)?ssB/(ssB+ssW):0;
  const etaCls=etaSq>.14?'green':etaSq>.06?'amber':'';

  let rows='';
  boxData.forEach(b=>{
    rows+=`<tr>
      <td class="mono" style="color:var(--t1)">${b.k}</td>
      <td class="mono">${int(b.count)}</td>
      <td class="mono">${fmt(b.mean)}</td>
      <td class="mono">${fmt(b.min)}</td>
      <td class="mono">${fmt(b.q1)}</td>
      <td class="mono">${fmt(b.median)}</td>
      <td class="mono">${fmt(b.q3)}</td>
      <td class="mono">${fmt(b.max)}</td>
    </tr>`;
  });

  container.innerHTML=`${pairTag}
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-lbl">Groups</div><div class="stat-val">${entries.length}${allEntries.length>MAX_GROUPS?` / ${allEntries.length}`:''}</div></div>
      <div class="stat-box"><div class="stat-lbl">N (used)</div><div class="stat-val">${int(allVals.length)}</div></div>
      <div class="stat-box"><div class="stat-lbl">ANOVA F</div><div class="stat-val">${F.toFixed(2)}</div></div>
      <div class="stat-box"><div class="stat-lbl">η² (eta²)</div><div class="stat-val ${etaCls}">${etaSq.toFixed(3)}</div></div>
      <div class="stat-box"><div class="stat-lbl">df</div><div class="stat-val mono" style="font-size:14px">${dfB}, ${dfW}</div></div>
    </div>
    ${etaSq>.14?`<div class="callout">${catCol} explains a large share of variance in ${numCol} (η² ≈ ${etaSq.toFixed(2)}).</div>`
      :etaSq>.06?`<div class="callout blue">${catCol} explains a moderate share of variance in ${numCol} (η² ≈ ${etaSq.toFixed(2)}).</div>`
      :`<div class="callout amber">${catCol} explains little variance in ${numCol} (η² ≈ ${etaSq.toFixed(2)}).</div>`}
    ${allEntries.length>MAX_GROUPS?`<div class="callout amber">Showing top ${MAX_GROUPS} categories by count (of ${allEntries.length}).</div>`:''}
    <div class="chart-wrap" style="height:380px"><canvas id="covar-chart"></canvas></div>
    <div class="tbl-scroll" style="margin-top:1rem"><table><thead><tr>
      <th>${catCol}</th><th>N</th><th>Mean</th><th>Min</th><th>Q1</th><th>Median</th><th>Q3</th><th>Max</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;

  const c=chartColors();
  if(charts['covar-chart']) charts['covar-chart'].destroy();
  const labels=boxData.map(b=>{const s=String(b.k);return s.length>14?s.slice(0,12)+'…':s});
  // Pseudo-box: stacked floating bars. Chart.js "bar" supports 2-value [lo,hi] datapoints.
  charts['covar-chart']=new Chart(document.getElementById('covar-chart'),{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Min → Q1',    data:boxData.map(b=>[b.min,b.q1]),    backgroundColor:'rgba(29,158,117,0.20)',borderWidth:0},
        {label:'Q1 → Median', data:boxData.map(b=>[b.q1,b.median]), backgroundColor:'rgba(29,158,117,0.55)',borderWidth:0},
        {label:'Median → Q3', data:boxData.map(b=>[b.median,b.q3]), backgroundColor:'rgba(29,158,117,0.85)',borderWidth:0},
        {label:'Q3 → Max',    data:boxData.map(b=>[b.q3,b.max]),    backgroundColor:'rgba(29,158,117,0.20)',borderWidth:0}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:c.tick,font:{family:'DM Mono',size:9},boxWidth:10}},
        tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.raw[0])} → ${fmt(ctx.raw[1])}`}}
      },
      scales:{
        x:{title:{display:true,text:catCol,color:c.tick,font:{family:'DM Mono',size:10}},grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9},maxRotation:45,minRotation:0}},
        y:{title:{display:true,text:numCol,color:c.tick,font:{family:'DM Mono',size:10}},grid:{color:c.grid},ticks:{color:c.tick,font:{family:'DM Mono',size:9}}}
      }
    }
  });
}

// — CAT × CAT: crosstab heatmap + chi-square / Cramér's V —
function renderCrossTabPair(x,y,container,pairTag){
  const counts={};
  const xVals=new Set(), yVals=new Set();
  rawData.forEach(r=>{
    const a=r[x], b=r[y];
    if(a===''||a==null||b===''||b==null) return;
    xVals.add(a); yVals.add(b);
    const k=a+'‖'+b;
    counts[k]=(counts[k]||0)+1;
  });
  const MAX_X=10, MAX_Y=10;
  const takeX=(stats[x]?.topValues||[]).slice(0,MAX_X).map(([v])=>v);
  const takeY=(stats[y]?.topValues||[]).slice(0,MAX_Y).map(([v])=>v);

  if(!takeX.length||!takeY.length){
    container.innerHTML=pairTag+'<div class="callout amber">No valid (x, y) combinations to display.</div>';
    if(charts['covar-chart']){charts['covar-chart'].destroy();delete charts['covar-chart']}
    return;
  }

  const rowTot={}, colTot={};
  let grand=0;
  takeX.forEach(xv=>takeY.forEach(yv=>{
    const c=counts[xv+'‖'+yv]||0;
    rowTot[xv]=(rowTot[xv]||0)+c;
    colTot[yv]=(colTot[yv]||0)+c;
    grand+=c;
  }));

  let chi2=0;
  takeX.forEach(xv=>takeY.forEach(yv=>{
    const obs=counts[xv+'‖'+yv]||0;
    const exp=(rowTot[xv]*colTot[yv])/(grand||1);
    if(exp>0) chi2+=(obs-exp)**2/exp;
  }));
  const dof=Math.max(0,(takeX.length-1)*(takeY.length-1));
  const kMin=Math.min(takeX.length,takeY.length);
  const cramer=(grand>0&&kMin>1)?Math.sqrt(chi2/(grand*(kMin-1))):0;
  const cCls=cramer>.5?'green':cramer>.2?'amber':'';

  const maxCell=Math.max(...Object.values(counts),1);
  const safe=s=>{const t=String(s);return t.length>14?t.slice(0,12)+'…':t};

  let head=`<thead><tr><th class="mono" style="min-width:140px">${x} \\ ${y}</th>`;
  takeY.forEach(yv=>head+=`<th class="mono" title="${yv}">${safe(yv)}</th>`);
  head+=`<th class="mono">Row total</th></tr></thead>`;

  let body='<tbody>';
  takeX.forEach(xv=>{
    body+=`<tr><td class="mono" style="color:var(--t1)" title="${xv}">${safe(xv)}</td>`;
    takeY.forEach(yv=>{
      const c=counts[xv+'‖'+yv]||0;
      const t=c/maxCell;
      const bg=`rgba(29,158,117,${(0.08+t*0.75).toFixed(3)})`;
      const fg=t>0.55?'#fff':'var(--t1)';
      body+=`<td class="xtab-cell" style="background:${bg};color:${fg}">${c}</td>`;
    });
    body+=`<td class="xtab-cell" style="font-weight:500;color:var(--t1)">${rowTot[xv]||0}</td></tr>`;
  });
  body+=`<tr><td class="mono" style="font-weight:500">Col total</td>`;
  takeY.forEach(yv=>body+=`<td class="xtab-cell" style="font-weight:500;color:var(--t1)">${colTot[yv]||0}</td>`);
  body+=`<td class="xtab-cell" style="font-weight:600;color:var(--t1)">${grand}</td></tr></tbody>`;

  const truncated=(takeX.length<xVals.size)||(takeY.length<yVals.size);

  container.innerHTML=`${pairTag}
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-lbl">N (used)</div><div class="stat-val">${int(grand)}</div></div>
      <div class="stat-box"><div class="stat-lbl">Chi² statistic</div><div class="stat-val">${chi2.toFixed(2)}</div></div>
      <div class="stat-box"><div class="stat-lbl">Degrees of freedom</div><div class="stat-val">${dof}</div></div>
      <div class="stat-box"><div class="stat-lbl">Cramér's V</div><div class="stat-val ${cCls}">${cramer.toFixed(3)}</div></div>
    </div>
    ${cramer>.5?`<div class="callout">Strong association (V ≈ ${cramer.toFixed(2)}).</div>`
      :cramer>.2?`<div class="callout blue">Moderate association (V ≈ ${cramer.toFixed(2)}).</div>`
      :`<div class="callout amber">Weak association (V ≈ ${cramer.toFixed(2)}).</div>`}
    ${truncated?`<div class="callout amber">Showing top ${takeX.length}×${takeY.length} of ${xVals.size}×${yVals.size} combinations.</div>`:''}
    <div class="tbl-scroll"><table>${head}${body}</table></div>`;

  // No Chart.js canvas here — table IS the heatmap. Drop any previous chart.
  if(charts['covar-chart']){charts['covar-chart'].destroy();delete charts['covar-chart']}
}
