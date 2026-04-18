/* ============================================================
   Auto EDA — core.js
   Shared by every section file.

   Lives here:
     • Global state & tunable constants
     • Dark-mode init + toggle
     • Upload / drop-zone / reset / navigation helpers
     • CSV parsing pipeline (Papa.parse → detect → stats → corr → render)
     • Type detection
     • Summary statistics (numeric + categorical)
     • Pearson correlation utilities
     • Formatting helpers (fmt, pctStr, int, sid)
     • Chart.js color helpers + dark-mode chart refresh
     • renderAll() — orchestrates every section
     • setupScrollSpy() — keeps the sidebar in sync with the viewport

   Each section file in ./sections/*.js reads from this state
   and contributes a render<Section>() function. Load order
   does not matter for the section files themselves — they
   are only called after an upload has already finished.
   ============================================================ */

// ── STATE ─────────────────────────────────────────────
const MAX_ROWS      = 50000;
const MAX_BINS      = 40;
const MAX_CORR_COLS = 16;
const MAX_NUM_SHOW  = 24;
const MAX_CAT_SHOW  = 24;

let rawData = [], headers = [], colTypes = {};
let numCols = [], catCols = [];
let stats   = {};
let corrMat = {};
let charts  = {};   // Chart.js instances keyed by canvas id

// ── DARK MODE ─────────────────────────────────────────
(function initDark(){
  if(localStorage.getItem('theme')==='dark'){
    document.body.classList.add('dark');
    const b=document.getElementById('dark-btn');
    if(b) b.textContent='☀️ Light';
  }
})();

function toggleDark(){
  const dark=document.body.classList.toggle('dark');
  document.getElementById('dark-btn').textContent=dark?'☀️ Light':'🌙 Dark';
  localStorage.setItem('theme',dark?'dark':'light');
  updateChartColors();
  if(typeof renderCorrHeatmap==='function') renderCorrHeatmap(); // redraw corr canvas with correct bg
}

// ── UPLOAD / RESET / NAV ──────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('dragover',  e=>{e.preventDefault();dropZone.classList.add('drag-over')});
dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e=>{
  e.preventDefault();dropZone.classList.remove('drag-over');
  const f=e.dataTransfer.files[0];if(f)processFile(f);
});
fileInput.addEventListener('change', e=>{if(e.target.files[0])processFile(e.target.files[0])});

function resetTool(){
  document.getElementById('upload-screen').style.display='flex';
  document.getElementById('eda-screen').style.display='none';
  fileInput.value='';
  Object.values(charts).forEach(c=>c.destroy());
  charts={};rawData=[];headers=[];
}

function navTo(id){
  document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
}

function setLoading(on,txt){
  const row=document.getElementById('loading-row');
  row.style.display=on?'flex':'none';
  if(txt) document.getElementById('loading-txt').textContent=txt;
}

// ── FILE PROCESSING ───────────────────────────────────
function processFile(file){
  document.getElementById('upload-screen').style.display='none';
  document.getElementById('eda-screen').style.display='block';
  document.getElementById('hdr-file').textContent=file.name;
  setLoading(true,'Parsing CSV…');

  Papa.parse(file,{
    header:true, skipEmptyLines:true, dynamicTyping:false,
    complete(res){
      let data=res.data;
      const totalRows=data.length;
      if(data.length>MAX_ROWS) data=data.slice(0,MAX_ROWS);
      rawData=data; headers=res.meta.fields||[];

      setLoading(true,'Detecting types…');
      delay(()=>{
        detectTypes();
        setLoading(true,'Computing statistics…');
        delay(()=>{
          computeAllStats();
          setLoading(true,'Computing correlations…');
          delay(()=>{
            computeCorrelations();
            setLoading(true,'Rendering…');
            delay(()=>{
              renderAll(totalRows,file.name);
              setLoading(false);
            });
          });
        });
      });
    },
    error(err){ alert('Parse error: '+err.message); resetTool(); }
  });
}

const delay = fn => setTimeout(fn, 30);

// ── TYPE DETECTION ────────────────────────────────────
function detectTypes(){
  colTypes={}; numCols=[]; catCols=[];
  headers.forEach(col=>{
    const vals=rawData.map(r=>r[col]).filter(v=>v!==''&&v!=null);
    const numN=vals.filter(v=>!isNaN(parseFloat(v))&&isFinite(v)).length;
    if(vals.length>0&&numN/vals.length>=0.8){
      colTypes[col]='numeric'; numCols.push(col);
    } else {
      colTypes[col]='categorical'; catCols.push(col);
    }
  });
}

// ── STATISTICS ────────────────────────────────────────
function numVals(col){
  return rawData.map(r=>parseFloat(r[col])).filter(v=>!isNaN(v)&&isFinite(v));
}

function pct(sorted,p){
  const i=(p/100)*(sorted.length-1);
  const lo=Math.floor(i),hi=Math.ceil(i);
  return lo===hi?sorted[lo]:sorted[lo]*(hi-i)+sorted[hi]*(i-lo);
}

function numericStats(col){
  const vals=numVals(col);
  const missing=rawData.filter(r=>{const v=r[col];return v===''||v==null||isNaN(parseFloat(v))}).length;
  if(!vals.length) return {count:0,missing,unique:0};
  const unique=new Set(vals).size;
  const sorted=[...vals].sort((a,b)=>a-b), n=vals.length;
  const mean=vals.reduce((s,v)=>s+v,0)/n;
  const variance=vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/Math.max(n-1,1);
  const std=Math.sqrt(variance);
  const q1=pct(sorted,25),median=pct(sorted,50),q3=pct(sorted,75);
  const iqr=q3-q1, min=sorted[0], max=sorted[n-1];
  const skew=std>0?3*(mean-median)/std:0;
  const lf=q1-1.5*iqr, uf=q3+1.5*iqr;
  const outliers=vals.filter(v=>v<lf||v>uf).length;

  // Histogram
  const bins=Math.min(MAX_BINS,Math.max(10,Math.ceil(Math.sqrt(n))));
  const span=max-min||1, bw=span/bins;
  const counts=new Array(bins).fill(0);
  const labels=[];
  for(let i=0;i<bins;i++){
    labels.push(fmt(min+i*bw));
    const lo2=min+i*bw, hi2=min+(i+1)*bw;
    vals.forEach(v=>{ if(v>=lo2&&(i===bins-1?v<=hi2:v<hi2)) counts[i]++; });
  }
  return {count:n,missing,unique,mean,std,min,max,q1,median,q3,iqr,skew,outliers,outlierPct:outliers/n,histCounts:counts,histLabels:labels};
}

function catStats(col){
  const all=rawData.map(r=>r[col]);
  const missing=all.filter(v=>v===''||v==null).length;
  const nonNull=all.filter(v=>v!==''&&v!=null);
  const counts={};
  nonNull.forEach(v=>{counts[v]=(counts[v]||0)+1});
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return {count:nonNull.length,missing,unique:sorted.length,topValues:sorted.slice(0,10),mode:sorted[0]?.[0],modeCount:sorted[0]?.[1]};
}

function computeAllStats(){
  stats={};
  headers.forEach(col=>{
    stats[col]=colTypes[col]==='numeric'?numericStats(col):catStats(col);
  });
}

// ── CORRELATIONS ──────────────────────────────────────
function pearson(x,y){
  const n=x.length; if(n<2) return 0;
  const mx=x.reduce((s,v)=>s+v,0)/n, my=y.reduce((s,v)=>s+v,0)/n;
  let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){num+=(x[i]-mx)*(y[i]-my);dx+=Math.pow(x[i]-mx,2);dy+=Math.pow(y[i]-my,2)}
  const den=Math.sqrt(dx*dy); return den===0?0:num/den;
}

// Pure helper: build a Pearson matrix for any subset of columns.
// Used by computeCorrelations (default precompute) and by
// sections/correlations.js (on-demand for user's picker selection).
function corrMatFor(cols){
  const m={};
  cols.forEach(c1=>{
    m[c1]={};
    cols.forEach(c2=>{
      if(c1===c2){m[c1][c2]=1;return}
      const pairs=rawData.map(r=>[parseFloat(r[c1]),parseFloat(r[c2])]).filter(([a,b])=>!isNaN(a)&&!isNaN(b)&&isFinite(a)&&isFinite(b));
      m[c1][c2]=pairs.length<2?0:pearson(pairs.map(p=>p[0]),pairs.map(p=>p[1]));
    });
  });
  return m;
}

function computeCorrelations(){
  // Precompute for the first MAX_CORR_COLS numerics so Auto Insights
  // can flag multicollinearity without doing its own matrix pass.
  corrMat = corrMatFor(numCols.slice(0,MAX_CORR_COLS));
}

// ── FORMATTING HELPERS ────────────────────────────────
function fmt(n){
  if(n==null||isNaN(n)) return '—';
  const a=Math.abs(n);
  if(a>=1e9) return (n/1e9).toFixed(2)+'B';
  if(a>=1e6) return (n/1e6).toFixed(2)+'M';
  if(a>=1e3) return (n/1e3).toFixed(1)+'K';
  if(a<0.001&&n!==0) return n.toExponential(2);
  return n.toFixed(a<1?3:2);
}
function pctStr(n){return(n*100).toFixed(1)+'%'}
function int(n){return n.toLocaleString()}
function sid(s){return s.replace(/[^a-zA-Z0-9]/g,'_')}

// ── CHART THEMING ─────────────────────────────────────
function chartColors(){
  const dark=document.body.classList.contains('dark');
  return {
    grid:dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)',
    tick:dark?'#888780':'#6b6b67',
  };
}

function updateChartColors(){
  const c=chartColors();
  Object.values(charts).forEach(ch=>{
    if(!ch.options?.scales) return;
    ['x','y'].forEach(ax=>{
      if(ch.options.scales[ax]){
        ch.options.scales[ax].grid.color=c.grid;
        ch.options.scales[ax].ticks.color=c.tick;
      }
    });
    ch.update();
  });
}

// ── RENDER ORCHESTRATOR ───────────────────────────────
// Each renderXxx() lives in its own file under sections/.
// If a section hasn't been loaded (e.g. the user dropped a file before
// all scripts finished) we skip it silently rather than crash.
function renderAll(totalRows,fname){
  if(typeof renderOverview    ==='function') renderOverview(totalRows);
  if(typeof renderNumeric     ==='function') renderNumeric();
  if(typeof renderCategorical ==='function') renderCategorical();
  if(typeof renderCorrelation ==='function') renderCorrelation();
  if(typeof renderCovar       ==='function') renderCovar();
  if(typeof renderSample      ==='function') renderSample();
  if(typeof renderInsights    ==='function') renderInsights();
  setupScrollSpy();
}

// ── SCROLL SPY ────────────────────────────────────────
function setupScrollSpy(){
  const sections=['s-overview','s-numeric','s-categorical','s-corr','s-covar','s-sample','s-insights'];
  const links=document.querySelectorAll('.sb-link');
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        links.forEach(l=>l.classList.remove('active'));
        const idx=sections.indexOf(e.target.id);
        if(idx>=0) links[idx]?.classList.add('active');
      }
    });
  },{rootMargin:'-15% 0px -65% 0px'});
  sections.forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el)});
}
