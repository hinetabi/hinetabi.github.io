/* ============================================================
   Auto EDA — sections/sample.js
   Section 08 · Sample Data

   Dumps the first 10 rows of the loaded CSV into a table.
   Null / empty values are highlighted with the .null-cell class.

   Reads from core.js: headers, rawData.
   Writes to DOM:      #sample-out
   ============================================================ */
function renderSample(){
  const rows=rawData.slice(0,10);
  let h='<div class="tbl-scroll"><table><thead><tr>';
  headers.forEach(col=>{ h+=`<th>${col}</th>`; });
  h+='</tr></thead><tbody>';
  rows.forEach(row=>{
    h+='<tr>';
    headers.forEach(col=>{
      const v=row[col];
      const d=(v===''||v==null)?'<span class="null-cell">null</span>':String(v).slice(0,50);
      h+=`<td>${d}</td>`;
    });
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  document.getElementById('sample-out').innerHTML=h;
}
