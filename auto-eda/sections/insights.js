/* ============================================================
   Auto EDA — sections/insights.js
   Section 02 · Auto Insights

   Scans the already-computed stats + correlations and emits
   callouts for: high missingness, skew, outliers, strong
   correlations (potential multicollinearity), constant columns,
   and likely ID columns.

   Reads from core.js: headers, numCols, rawData, stats, colTypes,
                       corrMat, MAX_CORR_COLS, pctStr, int.
   Writes to DOM:      #insights-out
   ============================================================ */
function renderInsights(){
  const ins=[];

  // Missing
  headers.forEach(col=>{
    const mp=(stats[col]?.missing||0)/rawData.length;
    if(mp>.4) ins.push({c:'red',t:`<strong>${col}</strong> — ${pctStr(mp)} missing. Consider dropping or creating a <code>has_${col}</code> indicator flag.`});
    else if(mp>.15) ins.push({c:'amber',t:`<strong>${col}</strong> — ${pctStr(mp)} missing. Investigate MCAR / MAR / MNAR before imputing.`});
  });

  // Skew
  numCols.forEach(col=>{
    const s=stats[col]||{};
    if(Math.abs(s.skew||0)>1.5) ins.push({c:'amber',t:`<strong>${col}</strong> is highly skewed (skewness = ${(s.skew).toFixed(2)}). Consider log-transform before using in linear models.`});
  });

  // Outliers
  numCols.forEach(col=>{
    const s=stats[col]||{};
    if((s.outlierPct||0)>.05) ins.push({c:'amber',t:`<strong>${col}</strong> has ${pctStr(s.outlierPct)} outliers by IQR (${int(s.outliers)} records). Review before winsorizing.`});
  });

  // High correlation
  const cCols=numCols.slice(0,MAX_CORR_COLS);
  const hiCorr=[];
  for(let i=0;i<cCols.length;i++) for(let j=i+1;j<cCols.length;j++){
    const r=corrMat[cCols[i]]?.[cCols[j]];
    if(r!=null&&Math.abs(r)>=0.7) hiCorr.push({c1:cCols[i],c2:cCols[j],r});
  }
  hiCorr.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r)).slice(0,5).forEach(({c1,c2,r})=>{
    ins.push({c:'blue',t:`<strong>${c1}</strong> ↔ <strong>${c2}</strong> are highly correlated (r = ${r.toFixed(2)}). Check for multicollinearity in linear models.`});
  });

  // Constant columns
  headers.forEach(col=>{
    const s=stats[col]||{};
    if(colTypes[col]==='categorical'&&s.unique===1) ins.push({c:'red',t:`<strong>${col}</strong> has only 1 unique value — zero variance, no predictive power. Drop it.`});
    if(colTypes[col]==='numeric'&&s.std===0) ins.push({c:'red',t:`<strong>${col}</strong> has zero standard deviation — constant feature. Drop it.`});
  });

  // Potential IDs
  headers.forEach(col=>{
    const s=stats[col]||{};
    if(colTypes[col]==='categorical'&&s.unique===rawData.length&&rawData.length>10) ins.push({c:'amber',t:`<strong>${col}</strong> has a unique value per row — likely an ID column. Exclude from model features.`});
  });

  const html=ins.length
    ?ins.map(i=>`<div class="callout ${i.c}">⚡ ${i.t}</div>`).join('')
    :'<div class="callout">✅ No major data quality issues detected.</div>';
  document.getElementById('insights-out').innerHTML=html;
}
