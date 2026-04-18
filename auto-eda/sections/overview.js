/* ============================================================
   Auto EDA — sections/overview.js
   Section 01 · Dataset Overview

   Top: compact stat grid (rows / cols / missing rate).
   Bottom: one-row-per-column table with:
     • #            — position in the CSV
     • Column       — name
     • Type         — numeric / categorical tag
     • Non-null     — populated cell count
     • Missing      — missing cell count (N)      ← added
     • Missing %    — missing / total rows
     • Unique       — distinct value count (N)    ← now shown for every column
     • Unique %     — unique / non-null           ← added (100% flags ID columns)
     • Range        — min → max for numeric; "—" for categorical

   Reads from core.js: headers, rawData, stats, colTypes, numCols,
                       catCols, MAX_ROWS, fmt, pctStr, int.
   Writes to DOM:      #overview-out
   ============================================================ */
function renderOverview(totalRows){
  const nNum=numCols.length, nCat=catCols.length;
  const totalMiss=headers.reduce((s,c)=>s+(stats[c]?.missing||0),0);
  const cells=rawData.length*headers.length;
  const missRate=cells?totalMiss/cells:0;
  const sampled=rawData.length<totalRows;

  let h=`<div class="stat-grid">
    <div class="stat-box"><div class="stat-lbl">Rows</div><div class="stat-val">${int(totalRows)}</div></div>
    <div class="stat-box"><div class="stat-lbl">Columns</div><div class="stat-val">${headers.length}</div></div>
    <div class="stat-box"><div class="stat-lbl">Numeric</div><div class="stat-val green">${nNum}</div></div>
    <div class="stat-box"><div class="stat-lbl">Categorical</div><div class="stat-val amber">${nCat}</div></div>
    <div class="stat-box"><div class="stat-lbl">Missing Rate</div><div class="stat-val ${missRate>.2?'red':missRate>.05?'amber':'green'}">${pctStr(missRate)}</div></div>
    <div class="stat-box"><div class="stat-lbl">Total Cells</div><div class="stat-val">${int(cells)}</div></div>
  </div>`;

  if(sampled) h+=`<div class="callout amber">⚠️ File has ${int(totalRows)} rows. Analysis uses first ${int(MAX_ROWS)} rows.</div>`;

  h+=`<div class="card"><div class="card-title">All Columns</div><div class="card-sub">Completeness, cardinality, and range for every column</div>
  <div class="tbl-scroll"><table><thead><tr>
    <th>#</th><th>Column</th><th>Type</th>
    <th>Non-null</th><th>Missing</th><th>Missing %</th>
    <th>Unique</th><th>Unique %</th>
    <th>Range</th>
  </tr></thead><tbody>`;

  headers.forEach((col,i)=>{
    const s=stats[col]||{};
    const nonNull=s.count||0;
    const miss=s.missing||0;
    const mp=rawData.length?miss/rawData.length:0;
    const unique=s.unique||0;
    // Unique % = distinct / populated. 100% → every value is distinct (ID-like).
    const up=nonNull?unique/nonNull:0;

    const typeTag=colTypes[col]==='numeric'
      ?'<span class="tag tag-num">numeric</span>'
      :'<span class="tag tag-cat">categorical</span>';
    const range=colTypes[col]==='numeric'?`${fmt(s.min)} → ${fmt(s.max)}`:'—';

    // Color coding
    const missColor= miss===0 ? 'var(--t2)'
                   : mp>.3     ? 'var(--red)'
                   : mp>.05    ? 'var(--amber)'
                   :             'var(--green)';
    const upColor =  up>=0.99  ? 'var(--purple-t)'
                   : up>=0.5   ? 'var(--amber)'
                   :             'var(--t2)';

    h+=`<tr>
      <td class="mono" style="opacity:.5">${i+1}</td>
      <td class="mono" style="color:var(--t1)">${col}</td>
      <td>${typeTag}</td>
      <td class="mono">${int(nonNull)}</td>
      <td class="mono" style="color:${missColor}">${int(miss)}</td>
      <td class="mono" style="color:${missColor}">${pctStr(mp)}</td>
      <td class="mono">${int(unique)}</td>
      <td class="mono" style="color:${upColor}">${pctStr(up)}</td>
      <td class="mono">${range}</td>
    </tr>`;
  });
  h+='</tbody></table></div></div>';
  document.getElementById('overview-out').innerHTML=h;
}
