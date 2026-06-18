import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = { apiKey:'AIzaSyBnd0yBKhBcEyS5XX7BO6WqT9mRET1zJio', authDomain:'flujo-de-caja-musicala.firebaseapp.com', projectId:'flujo-de-caja-musicala', storageBucket:'flujo-de-caja-musicala.firebasestorage.app', messagingSenderId:'998009800481', appId:'1:998009800481:web:3d36e4b579417657ada060' };
const ripFirebaseConfig = { apiKey:'AIzaSyCaCizVkfWdx97LROV7PYQbFXLPMpxynBg', authDomain:'rip-musicala.firebaseapp.com', projectId:'rip-musicala', storageBucket:'rip-musicala.firebasestorage.app', messagingSenderId:'401885071105', appId:'1:401885071105:web:6bb9b6867d7d81fdec3d00' };
const COLLECTION = 'flujo_caja_transacciones';
const IMPORTS = 'flujo_caja_importaciones';
const EXTRACTS = 'flujo_caja_extractos';
const ALLOWED = new Set(['alekcaballeromusic@gmail.com','catalina.medina.leal@gmail.com','musicalaasesor@gmail.com']);
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
const ripApp = initializeApp(ripFirebaseConfig, 'rip-musicala'), ripAuth = getAuth(ripApp), ripDb = getFirestore(ripApp), ripProvider = new GoogleAuthProvider();
const $=(q,el=document)=>el.querySelector(q), $$=(q,el=document)=>[...el.querySelectorAll(q)];
const fmtCOP=n=>Number(n||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const fmtNum=n=>Number(n||0).toLocaleString('es-CO');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const lower=s=>norm(s).toLowerCase();
function toExcelSerial(iso){const p=(iso||'').split('-').map(Number); if(!p[0]||!p[1]||!p[2])return 0; return Math.round((new Date(p[0],p[1]-1,p[2])-new Date(1899,11,30))/86400000);}
let allTx=[], filteredTx=[], imports=[], extractRows=[], filteredExtract=[], ripRows=[], ripDocs=[], filteredRip=[], bankTx=[], pdfTx=[], bankSource='—', calDate=new Date();
let pdfMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false};
let bankMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false};
let chMonth, chTopExpenses, chExpenseMonthCat, chCompareSources, chRipService, chRipMethod, chRipMonth, chExtractMonth;

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isMusicalaAdmin() {
      return isSignedIn() && request.auth.token.email in [
        "alekcaballeromusic@gmail.com",
        "catalina.medina.leal@gmail.com",
        "musicalaasesor@gmail.com"
      ];
    }
    match /flujo_caja_transacciones/{docId} { allow read, create, update, delete: if isMusicalaAdmin(); }
    match /flujo_caja_importaciones/{docId} { allow read, create, update, delete: if isMusicalaAdmin(); }
    match /flujo_caja_extractos/{docId} { allow read, create, update, delete: if isMusicalaAdmin(); }
    match /{document=**} { allow read, write: if false; }
  }
}`;

function toast(msg){const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.add('hidden'),3000)}
function showApp(ok){$('#app').classList.toggle('hidden',!ok); $('#blocked').classList.toggle('hidden',ok); if(ok) renderMonthBar()}
function showView(name){$$('.tab[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`)); if(name==='calendario')renderCalendar(); if(name==='rip')renderRipAll(); if(name==='extractos')renderExtractAll(); if(name==='facturacion')bilRender(); if(name==='conciliacion')renderReconciliation(filteredRip,allTx); if(name==='flujo'){renderFlowSummary(); applyTxFilters(true); if(ripRows.length)renderReconciliation(filteredRip,allTx);}}
function hash(s){let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619)} return (h>>>0).toString(36)}
function docIdFor(tx){const ref=norm(tx.ref||tx.idRef||tx.referencia); if(ref) return ref.replace(/[\/#[\]?]/g,'-').slice(0,150); const base=[tx.fecha,tx.tipo,tx.descripcion,tx.monto,tx.metodo,tx.categoria,tx.obs].map(norm).join('|').toLowerCase(); return `tx_${hash(base)}`;}
function extractIdFor(tx){const base=[tx.fecha,tx.tipo,tx.descripcion,tx.monto,tx.metodo,tx.categoria,tx.fileName].map(norm).join('|').toLowerCase(); return `ext_${hash(base)}`;}
function cleanTx(raw){const fecha=norm(raw.fecha||raw.date||raw.Fecha); const tipoRaw=norm(raw.tipo||raw.type||raw.Tipo); let monto=Number(String(raw.monto??raw.amount??raw.valor??raw.Monto??0).replace(/[^0-9.-]/g,''))||0; let tipo=(lower(tipoRaw).startsWith('egr')||lower(tipoRaw).startsWith('out')||monto<0)?'Egreso':'Ingreso'; return {fecha,tipo,descripcion:norm(raw.descripcion||raw['descripciÃ³n']||raw.description||raw['DescripciÃ³n']||raw.Descripcion),monto:Math.abs(monto),metodo:norm(raw.metodo||raw['mÃ©todo']||raw.method||raw['MÃ©todo']||raw.Metodo),categoria:norm(raw.categoria||raw['categorÃ­a']||raw.category||raw['CategorÃ­a']||raw.Categoria),obs:norm(raw.obs||raw.observacion||raw['observaciÃ³n']||raw.note||raw.Obs||raw['ObservaciÃ³n']),factura:norm(raw.factura||raw.invoice||raw.Factura),ref:norm(raw.ref||raw.idRef||raw.referencia||raw.reference||raw['ID Ref'])};}
async function loadData(){const snap=await getDocs(query(collection(db,COLLECTION),orderBy('fecha','desc'))); allTx=snap.docs.map(d=>({id:d.id,...d.data()})); filteredTx=[...allTx]; try{const si=await getDocs(query(collection(db,IMPORTS),orderBy('createdAt','desc'))); imports=si.docs.map(d=>({id:d.id,...d.data()}));}catch{imports=[]} try{const se=await getDocs(query(collection(db,EXTRACTS),orderBy('fecha','desc'))); extractRows=se.docs.map(d=>({id:d.id,...d.data()})); filteredExtract=[...extractRows];}catch{extractRows=[]; filteredExtract=[]} setBounds(); fillFcMonths(); fillTxCats(); fillTxCanales(); renderAll(); renderCalendar(); renderImports();}
function curYear(){return new Date().getFullYear()}
function setBounds(){const y=curYear(); const from=`${y}-01-01`, to=`${y}-12-31`; for(const id of ['dashFrom','txFrom']) if($('#'+id)&&!$('#'+id).value) $('#'+id).value=from; for(const id of ['dashTo','txTo']) if($('#'+id)&&!$('#'+id).value) $('#'+id).value=to}
function renderMonthBar(){const y=curYear(), prevY=y-1, meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; const html=`<button class="yearBtn monthBtn" data-year="${y}">${y}</button>`+meses.map((n,i)=>`<button class="monthBtn" data-m="${i+1}" data-year="${y}">${n}</button>`).join('')+'<span class="monthBarSep">|</span>'+`<button class="yearBtn monthBtn histYear" data-year="${prevY}">${prevY}</button>`+meses.map((n,i)=>`<button class="monthBtn histYear" data-m="${i+1}" data-year="${prevY}">${n} '25</button>`).join(''); const handler=e=>{const b=e.target.closest('.monthBtn'); if(!b)return; if(b.dataset.m)setMonthFilter(+b.dataset.year,+b.dataset.m); else setYearFilter(+b.dataset.year)}; const mb=$('#monthBar'); if(mb){mb.innerHTML=html; mb.onclick=handler;} const fmb=$('#flujoMonthBar'); if(fmb){fmb.innerHTML=html; fmb.onclick=handler;} const famb=$('#facturacionMonthBar'); if(famb){famb.innerHTML=html; famb.onclick=handler;} const rmb=$('#reconcMonthBar'); if(rmb){rmb.innerHTML=html; rmb.onclick=handler;} highlightMonthBtn(null)}
function setMonthFilter(y,m){const from=`${y}-${String(m).padStart(2,'0')}-01`; const last=new Date(y,m,0).getDate(); const to=`${y}-${String(m).padStart(2,'0')}-${last}`; for(const id of ['dashFrom','txFrom']) if($('#'+id))$('#'+id).value=from; for(const id of ['dashTo','txTo']) if($('#'+id))$('#'+id).value=to; if($('#fcMes'))$('#fcMes').value=`${y}-${String(m).padStart(2,'0')}`; renderAll(); highlightMonthBtn(m)}
function setYearFilter(y){for(const id of ['dashFrom','txFrom']) if($('#'+id))$('#'+id).value=`${y}-01-01`; for(const id of ['dashTo','txTo']) if($('#'+id))$('#'+id).value=`${y}-12-31`; if($('#fcMes'))$('#fcMes').value=''; renderAll(); highlightMonthBtn(null)}
function highlightMonthBtn(m){$$('.monthBtn').forEach(b=>b.classList.toggle('active',b.dataset.m!==undefined&&+b.dataset.m===m)); $$('.yearBtn').forEach(b=>b.classList.toggle('active',m===null))}
function inRange(tx,from,to){return (!from||tx.fecha>=from)&&(!to||tx.fecha<=to)}
function rowsDash(){return allTx.filter(tx=>inRange(tx,$('#dashFrom').value,$('#dashTo').value))}
function rowsFlowPeriod(){const from=$('#txFrom')?.value||$('#dashFrom')?.value||'', to=$('#txTo')?.value||$('#dashTo')?.value||''; return allTx.filter(tx=>inRange(tx,from,to))}
function extDash(){return extractRows.filter(tx=>inRange(tx,$('#dashFrom').value,$('#dashTo').value))}
function ripRange(){const rf=$('#ripFrom'),rt=$('#ripTo'); const from=(rf?.value)||$('#dashFrom')?.value||`${curYear()}-01-01`; const to=(rt?.value)||$('#dashTo')?.value||`${curYear()}-12-31`; return {from,to}}
function ripDash(){const {from,to}=ripRange(); return ripRows.filter(tx=>inRange(tx,from,to))}
function isTransferMusicala(tx){const t=lower([tx.categoria,tx.descripcion,tx.metodo,tx.obs].join(' ')); return t.includes('transferencia musicala')||(/bold.*bancolombia|interbanc.*bold|pago de prov bold/.test(t));}
function isRealIncome(tx){return tx.tipo==='Ingreso'&&!isTransferMusicala(tx)}
function isB2CIncome(tx){const txt=lower([tx.categoria,tx.descripcion,tx.metodo,tx.source].join(' ')); return isRealIncome(tx)&&(txt.includes('b2c')||txt.includes('clases')||txt.includes('matrÃ­cula')||txt.includes('matricula')||txt.includes('mensualidad')||txt.includes('bold')||txt.includes('nequi')||txt.includes('transferencia'))}
function monthKey(f){return String(f||'').slice(0,7)||'Sin fecha'}
function monthLabel(ym){const [y,m]=String(ym).split('-'); const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${meses[(+m||1)-1]} ${y}`}
function renderAll(){renderDashboard(); renderFlowSummary(); applyTxFilters(false); renderExtractAll(); renderRipAll(); bilRender();}
function renderDashboard(){const rows=rowsDash(), ext=extDash(), rip=ripDash(); const inc=rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0), exp=rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0), ripTotal=rip.reduce((a,x)=>a+Number(x.monto||0),0), extIn=ext.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0); $('#kpiIn').textContent=fmtCOP(inc); $('#kpiOut').textContent=fmtCOP(exp); $('#kpiNet').textContent=fmtCOP(inc-exp); $('#kpiDiff').textContent=fmtCOP((inc+extIn)-ripTotal); chartCompareSources(rows,ext,rip); chartMonths(rows); chartTopExpenses(rows); chartExpenseMonthCat(rows); listGroup('#listMethod',groupBy(rows,'metodo',true)); renderBalances(); renderAlerts(rows,ext,rip); renderCompareTable(rows,ext,rip)}
function renderCompareTable(rows,ext,rip){const months=[...new Set([...rows.map(x=>monthKey(x.fecha)),...ext.map(x=>monthKey(x.fecha)),...rip.map(x=>monthKey(x.fecha))].filter(x=>x&&x!=='Sin fecha'))].sort().reverse(); const body=$('#compareMonthBody'); if(!body)return; const totR=rip.reduce((a,x)=>a+x.monto,0), totF=rows.filter(isB2CIncome).reduce((a,x)=>a+x.monto,0), totE=ext.filter(isRealIncome).reduce((a,x)=>a+x.monto,0); body.innerHTML=months.map(m=>{const r=rip.filter(x=>monthKey(x.fecha)===m).reduce((a,x)=>a+x.monto,0); const f=rows.filter(x=>monthKey(x.fecha)===m&&isB2CIncome(x)).reduce((a,x)=>a+x.monto,0); const e=ext.filter(x=>monthKey(x.fecha)===m&&isRealIncome(x)).reduce((a,x)=>a+x.monto,0); const diff=f+e-r; return `<tr><td><b>${monthLabel(m)}</b></td><td class="num">${fmtCOP(r)}</td><td class="num">${fmtCOP(f)}</td><td class="num">${fmtCOP(e)}</td><td class="num ${Math.abs(diff)<5000?'good':diff>=0?'good':'bad'}">${diff>=0?'+':''}${fmtCOP(diff)}</td></tr>`}).join('')+(months.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${fmtCOP(totR)}</td><td class="num">${fmtCOP(totF)}</td><td class="num">${fmtCOP(totE)}</td><td class="num ${Math.abs(totF+totE-totR)<5000?'good':(totF+totE-totR)>=0?'good':'bad'}">${totF+totE-totR>=0?'+':''}${fmtCOP(totF+totE-totR)}</td></tr>`:'<tr><td colspan="5" class="muted">Sin datos en el perÃ­odo</td></tr>')}
function renderFcCategoryCloud(rows=rowsFlowPeriod()){
  const el=$('#fcCatCloud'); if(!el)return;
  const m=new Map();
  for(const r of rows){
    const cat=bilN(r.categoria);
    if(!cat) continue;
    const cur=m.get(cat)||{count:0,total:0};
    m.set(cat,{count:cur.count+1,total:cur.total+Math.abs(Number(r.monto||0))});
  }
  const cats=[...m.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,40);
  const maxCount=cats[0]?.[1]?.count||1;
  el.innerHTML=cats.length
    ?cats.map(([cat,{count,total}])=>{
        const size=Math.round(11+((count/maxCount)*16));
        const tipo=rows.find(r=>(bilN(r.categoria)||'(Sin categorÃ­a)')===cat)?.tipo;
        const color=tipo==='Ingreso'?'var(--ok,#22c55e)':tipo==='Egreso'?'var(--a3,#ef4444)':'var(--muted,#94a3b8)';
        return `<span style="font-size:${size}px;cursor:default" title="${count} movimientos · ${fmtCOP(total)}"><span style="color:${color}">${esc(cat)}</span> <b style="font-size:0.75em;color:var(--muted)">${count}</b></span>`;
      }).join('')
    :'<p class="muted">Sin datos en el perÃ­odo.</p>';
}
function renderFlowSummary(){if(!$('#fcTotalIn'))return; const rows=rowsFlowPeriod(); $('#fcTotalIn').textContent=fmtCOP(rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcTotalOut').textContent=fmtCOP(rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcInternal').textContent=fmtCOP(rows.filter(isTransferMusicala).reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcCount').textContent=fmtNum(rows.length); renderExpensesByCat(rows); renderIncomeByCanalFlujo(rows); renderFcCategoryCloud(rows);}
function renderExpensesByCat(rows){const el=$('#listExpensesByCat'); if(!el)return; const exp=expenseRows(rows); const totalExp=exp.reduce((a,x)=>a+Number(x.monto||0),0)||1; const cats=groupExpensesByCategory(exp).slice(0,15); el.innerHTML=cats.length?cats.map(({name,total:t})=>{const pct=Math.round(t/totalExp*100); return `<div class="listRow" style="flex-direction:column;align-items:stretch;gap:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px">${esc(name)}</span><strong class="bad">${fmtCOP(t)}</strong></div><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--line);border-radius:3px"><div style="width:${pct}%;height:100%;background:var(--a3,#ef4444);border-radius:3px"></div></div><span class="muted" style="font-size:11px;min-width:30px;text-align:right">${pct}%</span></div></div>`;}).join(''):'<p class="muted">Sin egresos en el perÃ­odo.</p>';}
function renderIncomeByCanalFlujo(rows){const el=$('#listIncomeByCanal'); if(!el)return; const inc=rows.filter(isRealIncome); const totalInc=inc.reduce((a,x)=>a+Number(x.monto||0),0)||1; const canals=groupBy(inc,'metodo',true).slice(0,12); el.innerHTML=canals.length?canals.map(({name,total:t})=>{const pct=Math.round(t/totalInc*100); return `<div class="listRow" style="flex-direction:column;align-items:stretch;gap:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px">${esc(name)}</span><strong class="good">${fmtCOP(t)}</strong></div><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--line);border-radius:3px"><div style="width:${pct}%;height:100%;background:var(--ok,#22c55e);border-radius:3px"></div></div><span class="muted" style="font-size:11px;min-width:30px;text-align:right">${pct}%</span></div></div>`;}).join(''):'<p class="muted">Sin ingresos en el perÃ­odo.</p>';}
function groupBy(rows,field,abs=false){const m=new Map(); for(const r of rows){const k=r[field]||'(Sin dato)'; const v=Number(r.monto||0)*(abs?1:(r.tipo==='Ingreso'?1:-1)); m.set(k,(m.get(k)||0)+v)} return [...m.entries()].map(([name,total])=>({name,total})).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))}
function listGroup(sel,rows){const el=$(sel); if(!el)return; el.innerHTML=rows.length?rows.slice(0,12).map(r=>`<div class="listRow"><span>${esc(r.name)}</span><strong>${fmtCOP(r.total)}</strong></div>`).join(''):'<p class="muted">Sin datos</p>'}
function listLatest(rows){$('#listLatest').innerHTML=rows.length?rows.map(r=>`<div class="listRow"><span><b>${esc(r.fecha)}</b><br>${esc(r.descripcion||r.categoria||'Movimiento')}</span><strong class="${r.tipo==='Egreso'?'bad':'good'}">${r.tipo==='Egreso'?'-':'+'}${fmtCOP(r.monto)}</strong></div>`).join(''):'<p class="muted">Sin datos</p>'}
function renderAlerts(rows,ext,rip){const ripTotal=rip.reduce((a,x)=>a+x.monto,0), fcB2C=rows.filter(isB2CIncome).reduce((a,x)=>a+x.monto,0), extIn=ext.filter(isRealIncome).reduce((a,x)=>a+x.monto,0), diff=fcB2C+extIn-ripTotal; const internal=rows.filter(isTransferMusicala).length; $('#listAlerts').innerHTML=`<div class="listRow"><span>RIP vs fuentes</span><strong class="${Math.abs(diff)<5000?'good':'bad'}">${fmtCOP(diff)}</strong></div><div class="listRow"><span>Transferencias Musicala excluidas</span><strong>${internal}</strong></div><div class="listRow"><span>Extractos cargados</span><strong>${fmtNum(ext.length)}</strong></div>`}
function chartCompareSources(rows,ext,rip){const months=[...new Set([...rows.map(x=>monthKey(x.fecha)),...ext.map(x=>monthKey(x.fecha)),...rip.map(x=>monthKey(x.fecha))].filter(x=>x&&x!=='Sin fecha'))].sort(); chCompareSources?.destroy(); chCompareSources=new Chart($('#chartCompareSources'),{type:'bar',data:{labels:months.map(monthLabel),datasets:[{label:'RIP B2C',data:months.map(m=>rip.filter(x=>monthKey(x.fecha)===m).reduce((a,x)=>a+x.monto,0))},{label:'Flujo B2C',data:months.map(m=>rows.filter(x=>monthKey(x.fecha)===m&&isB2CIncome(x)).reduce((a,x)=>a+x.monto,0))},{label:'Extractos',data:months.map(m=>ext.filter(x=>monthKey(x.fecha)===m&&isRealIncome(x)).reduce((a,x)=>a+x.monto,0))}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function chartMonths(rows){const m=new Map(); for(const r of rows){const ym=monthKey(r.fecha); if(!m.has(ym))m.set(ym,{in:0,out:0}); const o=m.get(ym); if(isRealIncome(r))o.in+=+r.monto||0; else if(r.tipo==='Egreso')o.out+=+r.monto||0} const labels=[...m.keys()].sort(); chMonth?.destroy(); chMonth=new Chart($('#chartMonth'),{type:'bar',data:{labels:labels.map(monthLabel),datasets:[{label:'Ingresos reales',data:labels.map(l=>m.get(l).in)},{label:'Egresos',data:labels.map(l=>m.get(l).out)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function expenseRows(rows){return rows.filter(x=>x.tipo==='Egreso')}
function normalizeCat(v){return norm(v)||'(Sin)'}
function groupExpensesByCategory(rows){const m=new Map(); for(const r of expenseRows(rows)){const k=normalizeCat(r.categoria); m.set(k,(m.get(k)||0)+Number(r.monto||0))} return [...m.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)}
function chartTopExpenses(rows){const cats=groupExpensesByCategory(rows).slice(0,10); const total=cats.reduce((a,x)=>a+x.total,0)||1; chTopExpenses?.destroy(); chTopExpenses=new Chart($('#chartTopExpenses'),{type:'bar',data:{labels:cats.map(x=>x.name),datasets:[{label:'Gasto',data:cats.map(x=>x.total)}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmtCOP(c.parsed.x||0)} (${(((c.parsed.x||0)/total)*100).toFixed(1)}%)`}}},scales:{x:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function chartExpenseMonthCat(rows){const top=groupExpensesByCategory(rows).slice(0,5).map(x=>x.name); const months=[...new Set(expenseRows(rows).map(r=>monthKey(r.fecha)).filter(Boolean))].sort(); chExpenseMonthCat?.destroy(); chExpenseMonthCat=new Chart($('#chartExpenseMonthCat'),{type:'bar',data:{labels:months.map(monthLabel),datasets:top.map(cat=>({label:cat,data:months.map(ym=>expenseRows(rows).filter(r=>monthKey(r.fecha)===ym && normalizeCat(r.categoria)===cat).reduce((a,x)=>a+Number(x.monto||0),0))}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtCOP(v)}}}}})}
function fillExpenseMonth(rows){const sel=$('#expMonth'); if(!sel)return; const months=[...new Set(expenseRows(rows).map(r=>monthKey(r.fecha)).filter(Boolean))].sort().reverse(); const cur=sel.value; sel.innerHTML=months.map(ym=>`<option value="${ym}">${monthLabel(ym)}</option>`).join(''); if(cur&&months.includes(cur))sel.value=cur; if(!sel.value&&months.length)sel.value=months[0]}
function renderExpenseMonth(rows=rowsDash()){const ym=$('#expMonth')?.value; listGroup('#listExpenseMonth',groupExpensesByCategory(expenseRows(rows).filter(r=>monthKey(r.fecha)===ym)))}
function renderBalances(){const from=$('#dashFrom')?.value||''; const to=$('#dashTo')?.value||''; const rows=allTx.filter(tx=>(!from||tx.fecha>=from)&&(!to||tx.fecha<=to)); const map=new Map(); for(const r of rows){const k=(r.metodo||'(Sin dato)').replace(/s+M$/i,'').trim()||'(Sin dato)'; const sign=isRealIncome(r)?1:(r.tipo==='Egreso'?-1:0); map.set(k,(map.get(k)||0)+sign*Number(r.monto||0))} listGroup('#listBalances',[...map.entries()].map(([name,total])=>({name,total})).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))); const getAcc=(...keys)=>{let v=0; for(const [name,total] of map){const ln=lower(name); if(keys.some(k=>ln.includes(k)))v+=total} return v;}; if($('#saldoBancolombia'))$('#saldoBancolombia').textContent=fmtCOP(getAcc('bancolombia')); if($('#saldoDavivienda'))$('#saldoDavivienda').textContent=fmtCOP(getAcc('davivienda')); if($('#saldoBold'))$('#saldoBold').textContent=fmtCOP(getAcc('bold'));}
function applyTxFilters(render=true){if(!$('#txFrom')||!$('#txTo')||!$('#txTipo')||!$('#txQ'))return; const from=$('#txFrom').value,to=$('#txTo').value,tipo=$('#txTipo').value,q=lower($('#txQ').value),cat=lower($('#txCat')?.value||''),canal=lower($('#txCanal')?.value||''),sinCat=$('#btnSinCat')?.dataset.active==='1'; filteredTx=allTx.filter(tx=>{if(!inRange(tx,from,to))return false; if(tipo==='Cambio de cuenta'&&!isTransferMusicala(tx))return false; if(tipo&&tipo!=='Cambio de cuenta'&&(tx.tipo!==tipo||isTransferMusicala(tx)))return false; if(cat&&norm(lower(tx.categoria||''))!==norm(cat))return false; if(canal&&norm(lower(tx.metodo||''))!==norm(canal))return false; if(sinCat&&norm(tx.categoria))return false; if(q&&!lower([tx.fecha,tx.tipo,tx.descripcion,tx.metodo,tx.categoria,tx.obs,tx.factura,tx.ref].join(' ')).includes(q))return false; return true}); renderFlowSummary(); if(render)renderTxTable(); else renderTxTable()}
function displayTipo(tx){if(isTransferMusicala(tx))return '<span class="statusDot" style="background:#f1f5f9;color:#475569">⇄ Cambio de cuenta</span>'; return tx.tipo==='Ingreso'?'<span class="statusDot dotOk">↑ Ingreso</span>':'<span class="statusDot dotBad">↓ Egreso</span>';}
function renderTxTable(){ if(!$('#txBody'))return; const inc=filteredTx.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0); const exp=filteredTx.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0); if($('#fcFiltIn'))$('#fcFiltIn').textContent=fmtCOP(inc); if($('#fcFiltOut'))$('#fcFiltOut').textContent=fmtCOP(exp); if($('#fcFiltCount'))$('#fcFiltCount').textContent=`${filteredTx.length} registros`; const sinCat=filteredTx.filter(tx=>!norm(tx.categoria)).length; const btnAutoCat=$('#btnAutoCat'); if(btnAutoCat)btnAutoCat.textContent=sinCat?`Auto-categorizar (${sinCat})`:'Auto-categorizar'; if(btnAutoCat)btnAutoCat.disabled=sinCat===0; const categoryChoices=txCategoryChoices(); const fcB2CWithKeys=buildReconcKeys(allTx.filter(isB2CIncome),'metodo'); const fcKeyById=new Map(fcB2CWithKeys.map(r=>[r.id,r._reconcKey])); $('#txBody').innerHTML=filteredTx.map(tx=>{const sug=!norm(tx.categoria)?suggestCategory(tx):''; const sinCatMode=$('#btnSinCat')?.dataset.active==='1'; const catCell=tx.categoria?esc(tx.categoria):sinCatMode?`<select class="catInline" data-id="${esc(tx.id)}"><option value="">â€" clasificar â€"</option>${categoryChoices.map(c=>`<option value="${esc(c)}"${sug===c?' selected':''}>${esc(c)}${sug===c?' *':''}</option>`).join('')}</select>`:(sug?`<span class="catSug" title="Sugerida">${esc(sug)}</span>`:''); const isB2C=isB2CIncome(tx); const rKey=isB2C?fcKeyById.get(tx.id):`${tx.fecha||''}-${Math.round(Number(tx.monto||0))}-${normReconcMedio(tx.metodo||'')}`; const ripOk=isB2C&&_reconcRipSet.has(rKey); const ripSugs=isB2C&&!ripOk&&filteredRip.length?findRipSuggestions(tx,filteredRip):[]; const ripSugHtml=ripSugs.length?'<div class="ripSugList">'+ripSugs.map(function(s){return '<span class="sugChip">'+esc(s.fecha)+' · '+esc(s.estudiante||'')+' · '+fmtCOP(s.monto)+' · '+esc(s.metodo||'—')+' <em>'+esc(s._reason||'')+'<\/em> <button class="mini" data-edit-rip="'+esc(s.id)+'">Editar<\/button><\/span>';}).join('')+'<\/div>':''; const ripBadge=isB2C&&_reconcRipSet.size?(ripOk?'<span class="statusDot dotOk" title="Conciliado con RIP">\u2714</span>':'<span class="statusDot dotBad" title="Sin match en RIP">\u2718</span>'):''; const ripKey=rKey?`<br><code class="reconcKey">${esc(rKey)}</code>`:''; return `<tr><td>${esc(tx.fecha)}</td><td>${displayTipo(tx)}</td><td>${esc(tx.descripcion)}</td><td class="num">${fmtCOP(tx.monto)}</td><td>${esc(tx.metodo)}</td><td>${catCell}</td><td>${esc(tx.obs)}</td><td>${esc(tx.factura)}</td><td>${ripBadge}${ripKey}${ripSugHtml}</td><td class="actions"><button class="mini" data-edit-fc="${esc(tx.id)}">Editar</button><button class="mini danger" data-del-fc="${esc(tx.id)}">Borrar</button></td></tr>`}).join('')||'<tr><td colspan="10">Sin datos</td></tr>'}
async function autoCategorize(force=false){const sinCat=allTx.filter(tx=>!norm(tx.categoria)); const pool=force?allTx:sinCat; if(!pool.length)return toast('Sin registros para procesar.'); const toUpdate=pool.map(tx=>({...tx,_newCat:suggestCategory(tx)})).filter(tx=>tx._newCat&&(force?tx._newCat!==tx.categoria:true)); if(!toUpdate.length)return toast(force?'Las categorÃ­as ya estÃ¡n al dÃ­a.':'No se encontraron sugerencias para los sin categorÃ­a.'); const msg=force?`Se van a RE-CATEGORIZAR ${toUpdate.length} registros (sobreescribe categorÃ­as existentes). Â¿Continuar?`:`Se van a categorizar ${toUpdate.length} registros sin categorÃ­a. Â¿Continuar?`; if(!confirm(msg))return; let done=0; for(let i=0;i<toUpdate.length;i+=450){const batch=writeBatch(db); for(const tx of toUpdate.slice(i,i+450))batch.update(doc(db,COLLECTION,tx.id),{categoria:tx._newCat,updatedAt:serverTimestamp()}); await batch.commit(); done+=toUpdate.slice(i,i+450).length} toast(`Actualizados ${done} registros \u2705`); await loadData()}
function exportCSV(){const head=['fecha','tipo','descripcion','monto','metodo','categoria','obs','factura','ref']; const lines=[head.join(',')]; for(const r of filteredTx)lines.push(head.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(',')); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'})); a.download=`flujo-caja-${new Date().toISOString().slice(0,10)}.csv`; a.click()}

const CATEGORIES=['','Acueducto','Arrendamiento','Aseo','CCB','ChatGPT','Clases B2B','Clases B2C','Comisiones de email','Comisiones de pago','ComisiÃ³n Bold','ComisiÃ³n Nequi','Contabilidad','Cuota de manejo Bancolombia','Cuota de manejo Davivienda','DiseÃ±o y publicidad','Docentes Musicala Hogar','DotaciÃ³n','Enel Codensa','Facebook','Google Ads','Impuesto 4x1000','Impuesto ICA','Impuesto IVA','Impuesto Retefuente','Impuesto Reteica','Instrumentos y equipos','Intereses','Internet Movistar','Keybe','Miplanilla','MusicafÃ©','NÃ³mina','Otros gastos (especifique)','Pago Proveedores','PrÃ©stamo socios','Reparaciones y mantenimiento','SG SST','Salarios Docentes prestaciÃ³n','Seguros','Tarjeta de crÃ©dito','Transferencia Musicala','Vigilancia'];
const CAT_RULES=[[/TRANSACCI[Ã"O]N\s*BOLD/i,'Clases B2C'],[/RETEICA\s*BOLD/i,'Impuesto Reteica'],[/RETEFUENTE\s*BOLD/i,'Impuesto Retefuente'],[/RETEIVA\s*BOLD/i,'Impuesto IVA'],[/COMISI[Ã"O]N\s*BOLD/i,'ComisiÃ³n Bold'],[/PAGO\s+DE\s+PROV\s+BOLD|PAGO\s+INTERBANC\s+BOLD/i,'Transferencia Musicala'],[/COMISI[Ã"O]N\s+E-?MAILS?|SERVICIO\s+E-?MAILS?|E-?MAILS?\s+ENVIADOS/i,'Comisiones de email'],[/TRANSFERENCIA\s+CTA\s+SUC\s+VIRTUAL|TRANSFERENCIA\s+DESDE\s+NEQUI/i,'Clases B2C'],[/PAGO\s+A\s+NOMIN|PAGO\s+A\s+NÃ"MIN/i,'NÃ³mina'],[/IMPTO\s+GOBIERNO\s+4X1000|\b4X1000\b|GRAVAMEN|GMF/i,'Impuesto 4x1000'],[/COBRO\s+PAGO\s+PROVEEDORES|COMISION\s+PAGO|SERVICIO\s+PAGO\s+A\s+PROVEEDORES/i,'Comisiones de pago'],[/COMISION\s+POR\s+PAGOS\s+A\s+NEQUI/i,'ComisiÃ³n Nequi'],[/MIPLANILLA|COMPENSAR/i,'Miplanilla'],[/OPENAI|CHATGPT/i,'ChatGPT'],[/GOOGLE\s+ADS/i,'Google Ads'],[/KEYBE/i,'Keybe'],[/CUOTA\s*MANEJO.*BANCOLOMBIA/i,'Cuota de manejo Bancolombia'],[/COBRO\s*SERVICIO\s*EMPRESARIAL|CUOTA\s*MANEJO.*DAVIVIENDA/i,'Cuota de manejo Davivienda'],[/\bIVA\b|IMPTOS?\s+A\s+LAS\s+VENTAS/i,'Impuesto IVA'],[/RETE\s*ICA|RETEICA|RTE\s*ICA/i,'Impuesto Reteica'],[/RETE\s*FUENTE|RETEFUENTE|RTE\s*FUENTE/i,'Impuesto Retefuente'],[/INTERESES/i,'Intereses'],[/PSE|PAYU|WOMPI|EPAYCO|MERCADOPAGO|COMISI[Ã"O]N/i,'Comisiones de pago']];
function suggestCategory(r){for(const [re,cat] of CAT_RULES){if(cat==='ComisiÃ³n Bold'&&!/BOLD/i.test(r.metodo))continue; if(cat==='Clases B2C'&&r.tipo==='Egreso')continue; if(re.test(r.descripcion||''))return cat} if(/BOLD/i.test(r.metodo)&&r.tipo==='Ingreso')return 'Clases B2C'; if(r.tipo==='Ingreso'&&Number(r.monto||0)>5000&&!isTransferMusicala(r))return 'Clases B2C'; return ''}
function parseMoneyAny(v){if(typeof v==='number')return v; let s=String(v??'').replace(/\$/g,'').replace(/\s+/g,''); if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.'); else if(s.includes(','))s=s.replace(',','.'); const n=Number(s.replace(/[^0-9.+-]/g,'')); return Number.isFinite(n)?n:NaN}
function toISODateFromDMY(d){const m=String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''}
function toISODateFromYYYYMMDD(s){const m=String(s??'').trim().match(/^(\d{4})(\d{2})(\d{2})$/); return m?`${m[1]}-${m[2]}-${m[3]}`:''}
function detectDelimiter(text){const line=(text||'').split(/\r?\n/).find(l=>l.trim()); if(!line)return ','; const c=(line.match(/,/g)||[]).length,se=(line.match(/;/g)||[]).length,t=(line.match(/\t/g)||[]).length; return t>c&&t>se?'\t':se>c?';':','}
function parseDelimited(text,delim){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(q&&next==='"'){cur+='"';i++}else q=!q;continue} if(!q&&ch===delim){row.push(cur);cur='';continue} if(!q&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&next==='\n')i++; row.push(cur); rows.push(row); row=[]; cur=''; continue} cur+=ch} if(cur.length||row.length){row.push(cur);rows.push(row)} return rows}
async function readXlsxTo2d(f,{raw=false}={}){if(!window.XLSX)throw new Error('No cargÃ³ SheetJS. Espera un segundo y recarga.'); const buf=await f.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw,defval:''}); while(rows.length&&rows[0].every(v=>String(v??'').trim()===''))rows.shift(); return rows}
function detectSource(file,rows=[]){const n=(file?.name||'').toLowerCase(); if(n.includes('bancolombia')||n.endsWith('.csv'))return 'bancolombia'; if(n.includes('davivienda'))return 'davivienda'; if(n.includes('bold')||n.includes('reporte_mensual'))return 'bold'; if(n.includes('nequi'))return 'nequi'; const flat=rows.slice(0,8).flat().map(v=>String(v??'').trim().toUpperCase()); if(flat.includes('TRANSACCIÃ"N')&&flat.includes('VALOR TOTAL'))return 'davivienda'; if(flat.includes('ESTADO ACTUAL')||flat.includes('ID TRANSACCION'))return 'bold'; return 'auto'}
function convertBancolombia(rows){let tx=[]; if(!rows.length)return tx; const looks=s=>/^\d{8}$/.test(String(s||'').trim()); let idxFecha=0,idxCuenta=1,idxDesc=6,idxMonto=8; const first=rows[0].map(v=>String(v??'').trim()); if(looks(first[3])){idxCuenta=0;idxFecha=3;idxMonto=5;idxDesc=7}else if(!looks(first[0])){const h=first.map(x=>x.toLowerCase()); const find=(arr,fb)=>{const i=h.findIndex(x=>arr.some(n=>x.includes(n))); return i>=0?i:fb}; idxFecha=find(['fecha'],idxFecha); idxCuenta=find(['cuenta'],idxCuenta); idxDesc=find(['descripcion','descripciÃ³n','concepto','detalle','motivo'],idxDesc); idxMonto=find(['valor','monto','importe'],idxMonto); rows=rows.slice(1)} for(const r of rows){const fecha=toISODateFromYYYYMMDD(norm(r[idxFecha])); const monto=parseMoneyAny(r[idxMonto]); const desc=norm(r[idxDesc]); const cuenta=norm(r[idxCuenta]); if(!fecha||!Number.isFinite(monto)||/^SALDO\b/i.test(desc))continue; tx.push({fecha,tipo:monto>=0?'Ingreso':'Egreso',descripcion:desc||'(Sin descripciÃ³n)',monto:Math.abs(Math.round(monto*100)/100),metodo:'Bancolombia',categoria:'',obs:cuenta?`Cuenta ${cuenta}`:'',factura:'',ref:''})} return tx}
function convertDavivienda(rows){const header=rows[0].map(h=>norm(h).toLowerCase()); const idxFecha=header.indexOf('fecha de movimiento'), idxTran=Math.max(header.indexOf('transacciÃ³n'),header.indexOf('transaccion')), idxMotivo=Math.max(header.indexOf('descripciÃ³n motivo'),header.indexOf('descripcion motivo')), idxValor=header.indexOf('valor total'); if(idxFecha<0||idxTran<0||idxValor<0)throw new Error('Davivienda: faltan columnas mÃ­nimas.'); const tx=[]; for(const r of rows.slice(1)){const fecha=toISODateFromDMY(r[idxFecha])||String(r[idxFecha]).slice(0,10); const valor=parseMoneyAny(r[idxValor]); if(!fecha||!Number.isFinite(valor))continue; const tran=norm(r[idxTran]), motivo=idxMotivo>=0?norm(r[idxMotivo]):''; const tipo=/nota\s*cr[eÃ©]dito/i.test(tran)?'Ingreso':(/nota\s*d[eÃ©]bito/i.test(tran)?'Egreso':(valor>=0?'Ingreso':'Egreso')); tx.push({fecha,tipo,descripcion:motivo||tran||'(Sin descripciÃ³n)',monto:Math.abs(Math.round(valor*100)/100),metodo:'Davivienda',categoria:'',obs:motivo&&tran?`TransacciÃ³n: ${tran}`:'',factura:'',ref:''})} return tx}
function findBoldHeader(rows){const want=['ID TRANSACCION','FECHA','ESTADO ACTUAL']; for(let i=0;i<Math.min(rows.length,50);i++){const row=rows[i].map(v=>String(v??'').trim().toUpperCase()); if(want.every(w=>row.includes(w)))return i} return -1}
function convertBold(rows,opts){const hr=findBoldHeader(rows); if(hr<0)throw new Error('Bold: no detectÃ© encabezados.'); const headers=rows[hr].map(h=>norm(h).toUpperCase()), data=rows.slice(hr+1), col=n=>headers.indexOf(n.toUpperCase()); const iId=col('ID TRANSACCION'),iFecha=col('FECHA'),iEstado=col('ESTADO ACTUAL'),iDesc=col('DESCRIPCIÃ"N'),iValorCompra=col('VALOR DE LA COMPRA'),iValorTotal=col('VALOR TOTAL'),iDeposito=col('DEPOSITO EN CUENTA BOLD'),iRfuente=col('VALOR RETE FUENTE'),iRiva=col('VALOR RETE IVA'),iRica=col('VALOR RETE ICA'),iDed=col('TOTAL DEDUCCIÃ"N'); const tx=[]; for(const r of data){if(!r||r.every(v=>String(v??'').trim()===''))continue; const estado=iEstado>=0?norm(r[iEstado]):''; if(opts.onlyOk&&estado&&estado.toUpperCase()!=='COBRO EXITOSO')continue; const fecha=String(r[iFecha]).slice(0,10), desc=norm(r[iDesc]), id=iId>=0?norm(r[iId]):''; let principal=iValorCompra>=0?parseMoneyAny(r[iValorCompra]):(opts.mode==='deposito'&&iDeposito>=0?parseMoneyAny(r[iDeposito]):parseMoneyAny(r[iValorTotal])); if(!fecha||!Number.isFinite(principal))continue; tx.push({fecha,tipo:principal>=0?'Ingreso':'Egreso',descripcion:desc||'(Pago Bold)',monto:Math.abs(Math.round(principal*100)/100),metodo:'Bold',categoria:'Clases B2C',obs:[id?`ID: ${id}`:'',estado?`Estado: ${estado}`:''].filter(Boolean).join(' · '),factura:'',ref:id}); if(opts.splitFees){const safe=n=>Number.isFinite(n)?n:0, rf=iRfuente>=0?safe(parseMoneyAny(r[iRfuente])):0, ri=iRiva>=0?safe(parseMoneyAny(r[iRiva])):0, rc=iRica>=0?safe(parseMoneyAny(r[iRica])):0, ded=iDed>=0?safe(parseMoneyAny(r[iDed])):0; const fee=(label,amount,cat)=>{if(!amount||Math.abs(amount)<.000001)return; tx.push({fecha,tipo:'Egreso',descripcion:`${label} Bold`,monto:Math.abs(Math.round(amount*100)/100),metodo:'Bold',categoria:cat,obs:id?`ID: ${id}`:'',factura:'',ref:id?`${id}-${label}`:''})}; fee('Retefuente',rf,'Impuesto Retefuente'); fee('ReteIVA',ri,'Impuesto IVA'); fee('ReteICA',rc,'Impuesto Reteica'); fee('ComisiÃ³n',ded-(Math.abs(rf)+Math.abs(ri)+Math.abs(rc)),'ComisiÃ³n Bold')}} return tx}
function findHeaderGeneric(rows,must){for(let i=0;i<Math.min(rows.length,40);i++){const row=rows[i].map(v=>String(v??'').trim().toLowerCase()); if(must.every(w=>row.some(c=>c.includes(w))))return i} return -1}
function convertNequi(rows,opts){const hr=findHeaderGeneric(rows,['fecha','valor']), start=hr>=0?hr:0, headers=rows[start].map(h=>norm(h).toLowerCase()), data=rows.slice(start+1); const find=arr=>headers.findIndex(h=>arr.some(s=>h.includes(s))); const iFecha=find(['fecha']), iValor=find(['valor','monto','importe','total']), iDesc=find(['descrip','concept','detalle','motivo','referencia','transac']), iRica=find(['reteica','rete ica','rte ica']), iRfu=find(['retefuente','rete fuente','rte fuente','rtefuente']), iCom=find(['comision','comisiÃ³n','fee','tarifa']); if(iFecha<0||iValor<0)throw new Error('Nequi: no detectÃ© columnas mÃ­nimas.'); const tx=[]; for(const r of data){const fecha=toISODateFromDMY(r[iFecha])||String(r[iFecha]).slice(0,10), valor=parseMoneyAny(r[iValor]); if(!fecha||!Number.isFinite(valor))continue; const desc=iDesc>=0?norm(r[iDesc]):'Movimiento Nequi'; tx.push({fecha,tipo:valor>=0?'Ingreso':'Egreso',descripcion:desc||'Movimiento Nequi',monto:Math.abs(Math.round(valor*100)/100),metodo:'Nequi',categoria:'',obs:'',factura:'',ref:''}); if(opts.splitFees){const fee=(label,amount,cat)=>{if(!amount||Math.abs(amount)<.000001)return; tx.push({fecha,tipo:'Egreso',descripcion:`${label} Nequi`,monto:Math.abs(Math.round(amount*100)/100),metodo:'Nequi',categoria:cat,obs:'',factura:'',ref:''})}; fee('ReteICA',iRica>=0?parseMoneyAny(r[iRica]):0,'Impuesto Reteica'); fee('Retefuente',iRfu>=0?parseMoneyAny(r[iRfu]):0,'Impuesto Retefuente'); fee('ComisiÃ³n',iCom>=0?parseMoneyAny(r[iCom]):0,'ComisiÃ³n Nequi')}} return tx}
async function processBankFile(file){bankTx=[]; bankMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false}; $('#bankLog').textContent='Procesando...'; if(!file)return; try{const ext=(file.name.split('.').pop()||'').toLowerCase(); let rows=[]; const selected=$('#bankSource').value; if(ext==='csv'){const txt=await file.text(); rows=parseDelimited(txt,detectDelimiter(txt)).map(r=>r.map(c=>norm(c))); bankSource=selected==='auto'?detectSource(file,rows):selected}else if(ext==='xlsx'){const preview=await readXlsxTo2d(file,{raw:false}); bankSource=selected==='auto'?detectSource(file,preview):selected; rows=bankSource==='bold'?await readXlsxTo2d(file,{raw:true}):preview}else throw new Error('Formato no soportado. Usa .csv o .xlsx'); let tx=[]; if(bankSource==='bancolombia')tx=convertBancolombia(rows); else if(bankSource==='davivienda'){const idx=rows.findIndex(r=>r.map(v=>String(v).toLowerCase()).includes('fecha de movimiento')); tx=convertDavivienda(idx>0?rows.slice(idx):rows); bankMeta=extractDaviviendaSaldos(rows)} else if(bankSource==='bold'){tx=convertBold(rows,{mode:$('#boldMode').value,onlyOk:$('#boldOnlyOk').checked,splitFees:$('#splitFees').checked}); bankMeta=extractBoldSaldos(rows,/bold\s*cf/i.test(file.name))} else if(bankSource==='nequi')tx=convertNequi(rows,{splitFees:$('#splitFees').checked}); else throw new Error('No pude determinar fuente. Elige el banco manualmente.'); tx.forEach(r=>{if(!r.categoria)r.categoria=suggestCategory(r); r.source=bankSource; r.fileName=file.name}); bankTx=tx.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); renderBankPreview(); $('#bankLog').textContent=`Convertidas ${bankTx.length} transacciones desde ${file.name}`;}catch(e){console.error(e); $('#bankLog').textContent=`ERROR: ${e.message||e}`; renderBankPreview()}}
function catSelect(i,val){return `<select class="catSel" data-idx="${i}">${CATEGORIES.map(c=>`<option value="${esc(c)}"${c===val?' selected':''}>${c||'â€"'}</option>`).join('')}</select>`}
function renderBankPreview(){const existing=new Set(allTx.map(docIdFor)); let ready=0,dup=0,bad=0; const rows=bankTx.map((r,i)=>{const id=docIdFor(r), duplicate=existing.has(id), incomplete=!(r.fecha&&r.descripcion&&r.monto); if(duplicate)dup++; else if(incomplete)bad++; else ready++; return `<tr class="${duplicate?'isDup':incomplete?'isBad':'isOk'}"><td>${duplicate?'Duplicada':incomplete?'Incompleta':'Lista'}</td><td>${esc(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td class="num">${fmtCOP(r.monto)}</td><td>${esc(r.metodo)}</td><td>${catSelect(i,r.categoria)}</td><td>${esc(r.obs)}</td></tr>`}).join(''); $('#bankBody').innerHTML=rows||'<tr><td colspan="8" class="muted">Carga un archivo para revisar transacciones.</td></tr>'; $('#readyCount').textContent=ready; $('#dupCount').textContent=dup; $('#badCount').textContent=bad; $('#bankSourcePill').textContent=bankSource; $('#btnUploadBank').disabled=ready===0; $('#btnBankCsv').disabled=bankTx.length===0; renderSaldoCheck(bankTx,bankMeta,'#saldoCheckBank');}
async function commitRows(rows,{source='Manual',fileName='',target='flow',saldoMeta=null}={}){if(!rows.length)return toast('No hay filas vÃ¡lidas.'); const coll=target==='extract'?EXTRACTS:COLLECTION; const existing=new Set((target==='extract'?extractRows:allTx).map(target==='extract'?extractIdFor:docIdFor)); const clean=rows.map(cleanTx); const valid=clean.filter(r=>r.fecha&&r.descripcion&&r.monto&&!existing.has(target==='extract'?extractIdFor(r):docIdFor(r))); if(!valid.length)return toast('Todo era duplicado o invÃ¡lido. Drama evitado.'); const batchId=`import_${Date.now()}_${hash(fileName+source+target)}`; let done=0; for(let i=0;i<valid.length;i+=450){const batch=writeBatch(db); for(const tx of valid.slice(i,i+450)){const id=target==='extract'?extractIdFor(tx):docIdFor(tx); batch.set(doc(db,coll,id),{...tx,source,fileName,importBatchId:batchId,importedBy:auth.currentUser?.email||'',importedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true})} await batch.commit(); done+=valid.slice(i,i+450).length} const saldoData=saldoMeta&&(saldoMeta.saldoInicial!=null||saldoMeta.saldoFinal!=null)?{saldoInicial:saldoMeta.saldoInicial,saldoFinal:saldoMeta.saldoFinal,saldoBanco:saldoMeta.banco||'',saldoDesde:saldoMeta.desde||'',saldoHasta:saldoMeta.hasta||''}:{}; await setDoc(doc(db,IMPORTS,batchId),{source,fileName,target,totalInput:rows.length,inserted:done,duplicates:rows.length-done,...saldoData,importedBy:auth.currentUser?.email||'',createdAt:serverTimestamp()},{merge:true}); toast(`Subidos ${done} registros \u2705`); await loadData()}
async function uploadBank(){const existing=new Set(allTx.map(docIdFor)); const valid=bankTx.filter(r=>r.fecha&&r.descripcion&&r.monto&&!existing.has(docIdFor(r))); await commitRows(valid,{source:bankSource,fileName:$('#bankFile').files[0]?.name||'',target:'flow',saldoMeta:bankMeta}); bankTx=[]; bankMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false}; renderBankPreview()}
function bankCsv(){const head=['fecha','tipo','descripcion','monto','metodo','categoria','obs','factura','ref']; const lines=[head.join(',')]; for(const r of bankTx)lines.push(head.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(',')); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'})); a.download=`bancos-convertido-${new Date().toISOString().slice(0,10)}.csv`; a.click()}

async function loadRipLegacy(){try{const coll=$('#ripCollection').value||'clientesB2C'; const snap=await getDocs(collection(ripDb,coll)); ripDocs=snap.docs.map(d=>({_id:d.id,...d.data()})); ripRows=snap.docs.flatMap(d=>{const data=d.data(); const fecha=norm(data.fecha||data.fechaClase||data.fechaPago||data.date||data.Fecha); const metodo=norm(data.medioPago||data.metodo||data.formaPago||data.canal||''); const usuarios=Array.isArray(data.usuarios)?data.usuarios:[]; if(d.id===snap.docs[0]?.id)console.log('RIP primer doc usuarios:',JSON.stringify(data.usuarios),'\nArray.isArray:',Array.isArray(data.usuarios)); if(usuarios.length){const valid=usuarios.map(u=>{const nombre=norm(u.estudiante||u.nombre||u.alumno||u.cliente||u.student||''); const precio=Number(u.precio||u.valor||u.costo||u.monto||u.pago||u.total||0); const svc=ripSvcAbr(norm(u.servicio||u.modalidad||u.plan||u.paquete||u.tipo||u.producto||u.clase||'')); return {nombre,precio,svc}}).filter(u=>u.precio>=1000&&u.nombre); if(valid.length){const total=valid.reduce((a,u)=>a+u.precio,0); const svcs=[...new Set(valid.map(u=>u.svc).filter(Boolean))].join(', ')||'Sin clasificar'; return [{id:d.id,fecha,estudiante:valid[0].nombre,servicio:svcs,metodo,monto:total,raw:data}];}} const monto=Math.abs(parseMoneyAny(data.descuento||data.total||data.valor||data.precio||data.pago||0)); if(monto>=1000)return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||''),servicio:norm(data.servicio||data.plan||data.modalidad||'')||'Sin clasificar',metodo,monto,raw:data}]; return [];}).filter(x=>x.fecha&&x.monto); filteredRip=[...ripRows]; renderRipAll(); renderDashboard(); toast(`RIP cargado: ${ripRows.length} registros`)}catch(e){console.error(e); toast('No pude cargar RIP. Revisa colecciÃ³n/reglas/login.') }}
async function loadRip(){try{const coll=$('#ripCollection').value||'clientesB2C'; const snap=await getDocs(collection(ripDb,coll)); ripDocs=snap.docs.map(d=>({_id:d.id,...d.data()})); ripRows=snap.docs.flatMap(d=>{const data=d.data(); const fecha=norm(data.fecha||data.fechaClase||data.fechaPago||data.date||data.Fecha); const metodo=norm(data.medioPago||data.metodo||data.formaPago||data.canal||''); const usuarios=Array.isArray(data.usuarios)?data.usuarios:[]; if(usuarios.length){const valid=usuarios.map(u=>{const nombre=norm(u.estudiante||u.nombre||u.alumno||u.cliente||u.student||''); const precio=Number(u.precio||u.valor||u.costo||u.monto||u.pago||u.total||0); const svc=ripSvcAbr(norm(u.servicio||u.modalidad||u.plan||u.paquete||u.tipo||u.producto||u.clase||'')); return {nombre,precio,svc}}).filter(u=>u.precio>=1000&&u.nombre); if(valid.length){const total=valid.reduce((a,u)=>a+u.precio,0); const svcs=[...new Set(valid.map(u=>u.svc).filter(Boolean))].join(', ')||'Sin clasificar'; const montoEdit=Math.abs(parseMoneyAny(data.monto||0)); return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||'')||valid[0].nombre,servicio:norm(data.servicio||data.plan||data.modalidad||'')||svcs,metodo,monto:montoEdit>=1000?montoEdit:total,raw:data}];}} const monto=Math.abs(parseMoneyAny(data.monto||data.descuento||data.total||data.valor||data.precio||data.pago||0)); if(monto>=1000)return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||''),servicio:norm(data.servicio||data.plan||data.modalidad||'')||'Sin clasificar',metodo,monto,raw:data}]; return [];}).filter(x=>x.fecha&&x.monto); filteredRip=[...ripRows]; renderRipAll(); renderDashboard(); toast(`RIP cargado: ${ripRows.length} registros`)}catch(e){console.error(e); toast('No pude cargar RIP. Revisa colecciÃ³n/reglas/login.') }}
function renderRipAll(){const base=ripDash(); const serv=$('#ripServFilter')?.value||''; const met=$('#ripMetFilter')?.value||''; const q=lower($('#ripQ')?.value||''); const rows=base.filter(r=>(!serv||r.servicio===serv)&&(!met||r.metodo===met)&&(!q||lower([r.fecha,r.estudiante,r.servicio,r.metodo,String(r.monto)].join(' ')).includes(q))); const total=rows.reduce((a,x)=>a+x.monto,0); $('#ripKpiTotal').textContent=fmtCOP(total); $('#ripKpiCount').textContent=fmtNum(rows.length); $('#ripKpiServicios').textContent=fmtNum(new Set(rows.map(x=>x.servicio).filter(Boolean)).size); $('#ripKpiMetodos').textContent=fmtNum(new Set(rows.map(x=>x.metodo).filter(Boolean)).size); const allServs=[...new Set(ripRows.map(x=>x.servicio).filter(Boolean))].sort(); const allMets=[...new Set(ripRows.map(x=>x.metodo).filter(Boolean))].sort(); const selS=$('#ripServFilter'); if(selS){const cur=selS.value; selS.innerHTML='<option value="">Todos los servicios</option>'+allServs.map(s=>`<option value="${esc(s)}"${s===cur?' selected':''}>${esc(s)}</option>`).join('')} const selM=$('#ripMetFilter'); if(selM){const cur=selM.value; selM.innerHTML='<option value="">Todos los medios</option>'+allMets.map(m=>`<option value="${esc(m)}"${m===cur?' selected':''}>${esc(m)}</option>`).join('')} renderRipCharts(rows); renderRipTables(rows,total); filteredRip=rows; renderRipTable(); renderReconciliation(rows,allTx);}
function renderRipCharts(rows){const serv=groupRip(rows,'servicio').slice(0,12), met=groupRip(rows,'metodo').slice(0,10); chRipService?.destroy(); if($('#chartRipService'))chRipService=new Chart($('#chartRipService'),{type:'bar',data:{labels:serv.map(x=>x.name),datasets:[{label:'Total',data:serv.map(x=>x.total),backgroundColor:'rgba(12,65,196,0.75)'}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>fmtCOP(v)}}}}}); chRipMethod?.destroy(); if($('#chartRipMethod'))chRipMethod=new Chart($('#chartRipMethod'),{type:'doughnut',data:{labels:met.map(x=>x.name),datasets:[{data:met.map(x=>x.total)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}}); const mMap=new Map(); for(const r of rows){const ym=monthKey(r.fecha); mMap.set(ym,(mMap.get(ym)||0)+r.monto)} const labels=[...mMap.keys()].sort(); chRipMonth?.destroy(); if($('#chartRipMonth'))chRipMonth=new Chart($('#chartRipMonth'),{type:'bar',data:{labels:labels.map(monthLabel),datasets:[{label:'Ingresos RIP B2C',data:labels.map(l=>mMap.get(l)),backgroundColor:'rgba(104,13,191,0.7)'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function renderRipTables(rows,total){const sb=$('#ripServTable'); if(sb)sb.innerHTML=groupRip(rows,'servicio').map(({name,total:t})=>{const cnt=rows.filter(r=>r.servicio===name).length; return `<tr><td>${esc(name)}</td><td class="num">${cnt}</td><td class="num">${fmtCOP(t)}</td><td class="num muted">${total?Math.round(t/total*100)+'%':'â€"'}</td></tr>`}).join('')+(rows.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${rows.length}</td><td class="num">${fmtCOP(total)}</td><td class="num">100%</td></tr>`:''); const mb=$('#ripMetTable'); if(mb)mb.innerHTML=groupRip(rows,'metodo').map(({name,total:t})=>{const cnt=rows.filter(r=>r.metodo===name).length; return `<tr><td>${esc(name)}</td><td class="num">${cnt}</td><td class="num">${fmtCOP(t)}</td><td class="num muted">${total?Math.round(t/total*100)+'%':'â€"'}</td></tr>`}).join('')+(rows.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${rows.length}</td><td class="num">${fmtCOP(total)}</td><td class="num">100%</td></tr>`:'')}
function groupRip(rows,field){const m=new Map(); for(const r of rows){const k=r[field]||'(Sin dato)'; m.set(k,(m.get(k)||0)+Number(r.monto||0))} return [...m.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)}
function filterRip(){renderRipAll()}
function ripSvcAbr(s){if(!s)return 'Sin clasificar'; const v=norm(s); if(/musifamiliar/i.test(v))return 'MF'; if(/ensamble/i.test(v))return 'Ensamble'; if(/matr[iÃ­]cula/i.test(v))return 'Pago'; if(/virtual.{0,25}personalizado|personalizado.{0,25}virtual/i.test(v))return 'MV P'; if(/hogar.{0,25}personalizado|personalizado.{0,25}hogar/i.test(v))return 'MH P'; if(/sede.{0,25}personalizado|personalizado.{0,25}sede/i.test(v))return 'MS P'; if(/sede.{0,25}grupal|grupal.{0,25}sede/i.test(v))return 'MS G'; return v||'Sin clasificar';}
function fillFcMonths(){const sel=$('#fcMes'); if(!sel)return; const months=[...new Set(allTx.map(tx=>monthKey(tx.fecha)).filter(Boolean))].sort().reverse(); sel.innerHTML='<option value="">Todos los meses</option>'+months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');}
function setFcMonth(ym){if(!ym){$('#txFrom').value='';$('#txTo').value='';applyTxFilters(true);return;} const[y,m]=ym.split('-'); const last=new Date(+y,+m,0).getDate(); $('#txFrom').value=`${ym}-01`; $('#txTo').value=`${ym}-${String(last).padStart(2,'0')}`; applyTxFilters(true);}
function txCategoryChoices(){const fromData=allTx.map(x=>norm(x.categoria)).filter(Boolean); return [...new Set([...CATEGORIES.map(norm).filter(Boolean),...fromData])].sort((a,b)=>a.localeCompare(b,'es'))}
function fillTxCats(){const sel=$('#txCat'); if(!sel)return; const cur=sel.value; const combined=txCategoryChoices(); sel.innerHTML='<option value="">Todas las categorÃ­as</option>'+combined.map(c=>`<option value="${lower(c)}">${esc(c)}</option>`).join(''); if(cur)sel.value=cur;}
function fillTxCanales(){const sel=$('#txCanal'); if(!sel)return; const cur=sel.value; const canals=[...new Set(allTx.map(x=>x.metodo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); sel.innerHTML='<option value="">Todos los canales</option>'+canals.map(c=>`<option value="${lower(c)}">${esc(c)}</option>`).join(''); if(cur)sel.value=cur;}

function normReconcMedio(s){return lower(s||'').replace(/\s+m$/i,'').replace(/\s+cf$/i,'').trim();}
function buildReconcKeys(rows,metodoKey='metodo'){const counter=new Map(); return rows.map(r=>{const base=`${r.fecha||''}-${Math.round(Number(r.monto||0))}-${normReconcMedio(r[metodoKey]||'')}`; const n=(counter.get(base)||0)+1; counter.set(base,n); return {...r,_reconcKey:`${base}-${n}`}});}
let _reconcFcSet=new Map(), _reconcRipSet=new Map(), _reconcFcKeyById=new Map();
function findFcSuggestions(ripRow,fcRows){var rDate=new Date(ripRow.fecha+'T12:00:00');var rMonto=Number(ripRow.monto||0);return fcRows.filter(function(fc){var fDate=new Date(fc.fecha+'T12:00:00');var dayDiff=Math.abs((rDate-fDate)/(1000*60*60*24));var montoPct=rMonto>0?Math.abs(Number(fc.monto||0)-rMonto)/rMonto:1;return dayDiff<=5||montoPct<=0.20;}).slice(0,3).map(function(fc){var fDate=new Date(fc.fecha+'T12:00:00');var dayDiff=Math.round(Math.abs((rDate-fDate)/(1000*60*60*24)));var montoPct=rMonto>0?Math.abs(Number(fc.monto||0)-rMonto)/rMonto:1;var reason='';if(dayDiff<=5)reason+=dayDiff===0?'mismo dia':dayDiff+'d cerca';if(montoPct<=0.20)reason+=(reason?', ':'')+'monto similar';return Object.assign({},fc,{_reason:reason});});}
function findRipSuggestions(fcRow,ripRows){var rDate=new Date(fcRow.fecha+'T12:00:00');var rMonto=Number(fcRow.monto||0);return ripRows.filter(function(r){var fDate=new Date(r.fecha+'T12:00:00');var dayDiff=Math.abs((rDate-fDate)/(1000*60*60*24));var montoPct=rMonto>0?Math.abs(Number(r.monto||0)-rMonto)/rMonto:1;return dayDiff<=5||montoPct<=0.20;}).slice(0,3).map(function(r){var fDate=new Date(r.fecha+'T12:00:00');var dayDiff=Math.round(Math.abs((rDate-fDate)/(1000*60*60*24)));var montoPct=rMonto>0?Math.abs(Number(r.monto||0)-rMonto)/rMonto:1;var reason='';if(dayDiff<=5)reason+=dayDiff===0?'mismo dia':dayDiff+'d cerca';if(montoPct<=0.20)reason+=(reason?', ':'')+'monto similar';return Object.assign({},r,{_reason:reason});});}
function renderReconciliation(ripRows,allTx){
  const {from,to}=ripRange();
  const fcB2C=allTx.filter(tx=>isB2CIncome(tx)&&tx.fecha&&tx.fecha>=from&&tx.fecha<=to);
  const ripK=buildReconcKeys(ripRows,'metodo');
  const fcK=buildReconcKeys(fcB2C,'metodo');
  _reconcFcSet=new Map(fcK.map(r=>[r._reconcKey,r]));
  _reconcRipSet=new Map(ripK.map(r=>[r._reconcKey,r]));
  _reconcFcKeyById=new Map(fcK.map(r=>[r.id,r._reconcKey]));
  const isAutoReconciled = c => {
    const val = String(c || '').toLowerCase().trim();
    return val === 'fesicol' || val === 'efectivo';
  };
  const matched=ripK.filter(r=>_reconcFcSet.has(r._reconcKey) || isAutoReconciled(r.metodo));
  const onlyRip=ripK.filter(r=>!_reconcFcSet.has(r._reconcKey) && !isAutoReconciled(r.metodo));
  const onlyFc=fcK.filter(r=>!_reconcRipSet.has(r._reconcKey) && !isAutoReconciled(r.metodo));
  const el=$('#reconcSummary'); if(!el)return;
  const total=ripK.reduce((a,x)=>a+x.monto,0);
  const mTotal=matched.reduce((a,x)=>a+x.monto,0);
  const oRipTotal=onlyRip.reduce((a,x)=>a+x.monto,0);
  const oFcTotal=onlyFc.reduce((a,x)=>a+x.monto,0);
  const pct=total?Math.round(mTotal/total*100):0;
  el.innerHTML=`
    <div class="reconcBar">
      <div class="reconcFill" style="width:${pct}%"></div>
      <span class="reconcPct">${pct}% conciliado</span>
    </div>
    <div class="kpis miniKpis" style="margin:12px 0 18px">
      <article class="reconcOk"><span>Conciliados \u2714</span><strong class="good">${fmtNum(matched.length)}</strong><small>${fmtCOP(mTotal)}</small></article>
      <article class="reconcBad"><span>Solo en RIP \u2718</span><strong class="bad">${fmtNum(onlyRip.length)}</strong><small>${fmtCOP(oRipTotal)}</small></article>
      <article class="reconcWarn"><span>Solo en FC \u2718</span><strong style="color:var(--warn)">${fmtNum(onlyFc.length)}</strong><small>${fmtCOP(oFcTotal)}</small></article>
      <article><span>Total RIP perÃ­odo</span><strong>${fmtNum(ripK.length)}</strong><small>${fmtCOP(total)}</small></article>
    </div>
    <div class="reconcTabs">
      <button class="reconcTab active" data-rt="bad">Sin conciliar RIP <span class="badge bad">${onlyRip.length}</span></button>
      <button class="reconcTab" data-rt="fc">Sin conciliar FC <span class="badge warn">${onlyFc.length}</span></button>
      <button class="reconcTab" data-rt="ok">Conciliados <span class="badge good">${matched.length}</span></button>
    </div>
    <div id="reconcTableBad" class="reconcPane">${reconcTable(onlyRip,'rip',{fcRows:onlyFc})}</div>
    <div id="reconcTableFc" class="reconcPane hidden">${reconcTable(onlyFc,'fc',{})}</div>
    <div id="reconcTableOk" class="reconcPane hidden">${reconcTable(matched,'ok',{fcMap:_reconcFcSet})}</div>`;
  el.querySelectorAll('.reconcTab').forEach(btn=>btn.onclick=()=>{el.querySelectorAll('.reconcTab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); el.querySelectorAll('.reconcPane').forEach(p=>p.classList.add('hidden')); el.querySelector(`#reconcTable${btn.dataset.rt.charAt(0).toUpperCase()+btn.dataset.rt.slice(1)}`).classList.remove('hidden')});
  el.onclick=function(e){var er=e.target.closest('[data-edit-rip]');if(er){openEdit('rip',er.dataset.editRip);return;}var ef=e.target.closest('[data-edit-fc]');if(ef){openEdit('fc',ef.dataset.editFc);return;}var vt=e.target.closest('[data-vs-toggle]');if(vt){var idx=vt.dataset.vsToggle;el.querySelectorAll('[data-vs-row]').forEach(function(row){if(row.dataset.vsRow===idx){row.classList.toggle('hidden');vt.textContent=row.classList.contains('hidden')?'Ver VS':'Cerrar VS';}});}};
  renderRipTable();
  renderTxTable();
}
function reconcTable(rows,kind,opts){
  opts=opts||{};
  if(!rows.length)return '<p class="muted" style="padding:14px">Sin registros</p>';
  var isOkTab=kind==='ok';
  var isAutoReconciled=function(c){var val=String(c||'').toLowerCase().trim();return val==='fesicol'||val==='efectivo';};
  var fcMap=opts.fcMap||new Map();
  var fcRows=opts.fcRows||[];
  var nameCol=kind==='fc'?'Descripción':'Estudiante';
  var catCol=kind==='fc'?'Categoría':'Servicio';
  var html='<div class="tableWrap"><table><thead><tr><th>Estado</th><th>Fecha</th><th>'+nameCol+'</th><th>'+catCol+'</th><th>Medio</th><th class="num">Monto</th><th>Llave</th>'+(isOkTab?'<th>VS Contraparte</th>':'')+(kind==='rip'?'<th>Sugerencias FC</th>':'')+'<th>Acciones</th></tr></thead><tbody>';
  rows.slice(0,300).forEach(function(r,i){
    var statusLabel=isOkTab?(isAutoReconciled(r.metodo)?'No Conciliable':'Conciliado'):kind==='fc'?'Solo FC':'Solo RIP';
    var dotClass=isOkTab?'dotOk':'dotBad';
    var fcCp=isOkTab?fcMap.get(r._reconcKey):null;
    var sugs=kind==='rip'?findFcSuggestions(r,fcRows):[];
    var sugHtml='';
    if(kind==='rip'){if(sugs.length){sugHtml=sugs.map(function(s){return '<span class="sugChip" title="'+esc(s.descripcion||'')+'">'+esc(s.fecha)+' · '+fmtCOP(s.monto)+' · '+esc(s.metodo||'—')+' <em>'+esc(s._reason||'')+'</em>'+(s.id?' <button class="mini" data-edit-fc="'+esc(s.id)+'">Editar</button>':'')+'</span>';}).join('');}else{sugHtml='<span class="muted" style="font-size:11px">sin sugerencias</span>';}}
    var vsHtml='';
    if(isOkTab){if(fcCp){vsHtml='<div class="vsInline"><span class="sugChip">'+esc(fcCp.fecha)+' · '+esc(fcCp.descripcion||'')+' · '+fmtCOP(fcCp.monto)+' · '+esc(fcCp.metodo||'—')+'</span> <button class="mini" data-vs-toggle="'+i+'">Ver VS</button></div>';}else{vsHtml='<span class="muted" style="font-size:11px">auto</span>';}}
    var vsRow='';
    if(isOkTab&&fcCp){vsRow='<tr class="vsRow hidden" data-vs-row="'+i+'"><td colspan="9"><div class="vsPanel"><div class="vsCol ripCol"><strong>RIP</strong><p>'+esc(r.fecha)+' • '+esc(r.estudiante||r.descripcion||'')+' • '+esc(r.servicio||'')+' • '+esc(r.metodo||'')+' • '+fmtCOP(r.monto)+'</p><button class="mini" data-edit-rip="'+esc(r.id)+'">Editar RIP</button></div><div class="vsDivider">⇔</div><div class="vsCol fcCol"><strong>FC</strong><p>'+esc(fcCp.fecha)+' • '+esc(fcCp.descripcion||'')+' • '+esc(fcCp.categoria||'')+' • '+esc(fcCp.metodo||'')+' • '+fmtCOP(fcCp.monto)+'</p><button class="mini" data-edit-fc="'+esc(fcCp.id)+'">Editar FC</button></div></div></td></tr>';}
    var editBtns='';
    if(kind==='rip'||isOkTab){editBtns+='<button class="mini" data-edit-rip="'+esc(r.id)+'">Editar RIP</button>';}
    if(kind==='fc'){editBtns+='<button class="mini" data-edit-fc="'+esc(r.id)+'">Editar FC</button>';}
    if(isOkTab&&fcCp){editBtns+=' <button class="mini" data-edit-fc="'+esc(fcCp.id)+'">Editar FC</button>';}
    html+='<tr><td><span class="statusDot '+dotClass+'">'+statusLabel+'</span></td><td>'+esc(r.fecha)+'</td><td>'+esc(r.estudiante||r.descripcion||'')+'</td><td>'+esc(r.servicio||r.categoria||'')+'</td><td>'+esc(r.metodo||'')+'</td><td class="num">'+fmtCOP(r.monto)+'</td><td><code class="reconcKey">'+esc(r._reconcKey||'')+'</code></td>'+(isOkTab?'<td>'+vsHtml+'</td>':'')+(kind==='rip'?'<td class="reconcSugCell">'+sugHtml+'</td>':'')+'<td class="actions">'+editBtns+'</td></tr>'+vsRow;
  });
  html+='</tbody></table></div>';
  return html;
}

function renderRipTable(){const rows=filteredRip.slice(0,500); const withKeys=buildReconcKeys(rows,'metodo'); const isAutoReconciled = c => { const val = String(c || '').toLowerCase().trim(); return val === 'fesicol' || val === 'efectivo'; }; $('#ripBody').innerHTML=withKeys.map(r=>{const ok=(_reconcFcSet.size&&_reconcFcSet.has(r._reconcKey)) || isAutoReconciled(r.metodo); const badge=_reconcFcSet.size?`<span class="statusDot ${ok?'dotOk':'dotBad'}">${ok?'\u2714':'\u2718'}</span>`:''; const keyHint=r._reconcKey?`<br><code class="reconcKey" title="Llave de conciliaciÃ³n">${esc(r._reconcKey)}</code>`:''; return `<tr><td>${badge}${keyHint}</td><td>${esc(r.fecha)}</td><td>${esc(r.estudiante)}</td><td>${esc(r.servicio)}</td><td>${esc(r.metodo)}</td><td class="num">${fmtCOP(r.monto)}</td><td><button class="mini" data-edit-rip="${esc(r.id)}">Editar</button></td></tr>`}).join('')||'<tr><td colspan="7" class="muted">Sin datos RIP.</td></tr>'}

function filterExtract(render=true){const q=lower($('#extQ')?.value||''); filteredExtract=extractRows.filter(r=>!q||lower([r.fecha,r.tipo,r.descripcion,r.metodo,r.categoria,r.monto].join(' ')).includes(q)); if(render)renderExtractTable(); else renderExtractTable()}
function renderExtractAll(){const rows=extDash().length?extDash():extractRows; $('#extTotalIn').textContent=fmtCOP(rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0)); $('#extTotalOut').textContent=fmtCOP(rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0)); $('#extCount').textContent=fmtNum(rows.length); $('#extMatches').textContent=fmtNum(countRipMatches(rows)); chartExtract(rows); renderWordCloud(rows); filterExtract(false)}
function countRipMatches(ext){let c=0; for(const e of ext){if(ripRows.some(r=>r.fecha===e.fecha&&Math.abs(Number(r.monto||0)-Number(e.monto||0))<5000))c++} return c}
function chartExtract(rows){const m=new Map(); for(const r of rows){const ym=monthKey(r.fecha); if(!m.has(ym))m.set(ym,{in:0,out:0}); if(r.tipo==='Ingreso')m.get(ym).in+=Number(r.monto||0); else m.get(ym).out+=Number(r.monto||0)} const labels=[...m.keys()].sort(); chExtractMonth?.destroy(); if($('#chartExtractMonth'))chExtractMonth=new Chart($('#chartExtractMonth'),{type:'bar',data:{labels:labels.map(monthLabel),datasets:[{label:'Ingresos',data:labels.map(x=>m.get(x).in)},{label:'Egresos',data:labels.map(x=>m.get(x).out)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function renderWordCloud(rows){const stop=new Set('de la el los las un una y en para por con del a al pago compra transferencia transaccion movimiento desde hasta cuenta nota debito credito'.split(' ')); const m=new Map(); for(const r of rows){for(const w of lower(r.descripcion).split(/[^a-zÃ¡Ã©Ã­Ã³ÃºÃ±0-9]+/).filter(x=>x.length>3&&!stop.has(x))){m.set(w,(m.get(w)||0)+1)}} const words=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,45); $('#wordCloud').innerHTML=words.length?words.map(([w,n])=>`<span style="font-size:${Math.min(26,12+n*2)}px">${esc(w)} <b>${n}</b></span>`).join(''):'<p class="muted">Sin palabras suficientes.</p>'}
function renderExtractTable(){const rows=filteredExtract.slice(0,500); $('#extractBody').innerHTML=rows.map(r=>`<tr><td>${esc(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td class="num">${fmtCOP(r.monto)}</td><td>${esc(r.metodo)}</td><td>${esc(r.categoria)}</td><td><button class="mini" data-edit-ext="${esc(r.id)}">Editar</button><button class="mini danger" data-del-ext="${esc(r.id)}">Borrar</button></td></tr>`).join('')||'<tr><td colspan="7" class="muted">Sin extractos.</td></tr>'}
async function readPdf(){const f=$('#pdfFile').files[0]; if(!f)return toast('Selecciona PDF o TXT primero.'); $('#pdfLog').textContent='Leyendo archivo...'; try{let text=''; if(f.name.toLowerCase().endsWith('.txt')) text=await f.text(); else {const arr=await f.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data:arr}).promise; for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p); const tc=await page.getTextContent(); text+=tc.items.map(i=>i.str).join(' ')+'\n'}} $('#pdfText').value=text; parsePdfText(); $('#pdfLog').textContent=`Texto extraÃ­do: ${text.length} caracteres`; }catch(e){console.error(e); $('#pdfLog').textContent=`ERROR leyendo PDF: ${e.message||e}`}}
function extractBancolombiaSaldos(text){
  const ant=text.match(/SALDO\s+ANTERIOR\s*:?\s*\$?\s*([\d.,]+)/i);
  const nuevo=text.match(/(?:SALDO\s+NUEVO|NUEVO\s+SALDO|SALDO\s+FINAL|SALDO\s+DISPONIBLE)\s*:?\s*\$?\s*([\d.,]+)/i);
  const desde=text.match(/DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  const hasta=text.match(/HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  return {
    saldoInicial:ant?parseMoneyAny(ant[1]):null,
    saldoFinal:nuevo?parseMoneyAny(nuevo[1]):null,
    banco:'Bancolombia',
    desde:desde?`${desde[1]}-${desde[2]}-${desde[3]}`:'',
    hasta:hasta?`${hasta[1]}-${hasta[2]}-${hasta[3]}`:'',
    esProcesadorPago:false
  };
}
function extractDaviviendaSaldos(rows){
  let saldoInicial=null,saldoFinal=null,desde='',hasta='';
  for(const row of rows.slice(0,25)){
    const flat=row.map(v=>String(v??'').trim());
    const line=flat.join(' ');
    if(/SALDO\s*(ANTERIOR|INICIAL)/i.test(line)){
      const v=flat.find(c=>/^[\d.,]+$/.test(c.replace(/[\s$]/g,'')));
      if(v)saldoInicial=parseMoneyAny(v);
    }
    if(/SALDO\s*(FINAL|NUEVO|DISPONIBLE)/i.test(line)){
      const v=flat.find(c=>/^[\d.,]+$/.test(c.replace(/[\s$]/g,'')));
      if(v)saldoFinal=parseMoneyAny(v);
    }
    const fechaM=line.match(/\d{1,2}\/\d{2}\/\d{4}/g);
    if(fechaM&&!desde)desde=toISODateFromDMY(fechaM[0]);
    if(fechaM&&fechaM.length>1)hasta=toISODateFromDMY(fechaM[1]);
  }
  return {saldoInicial,saldoFinal,banco:'Davivienda',desde,hasta,esProcesadorPago:false};
}
function extractBoldSaldos(rows,isBoldCF=false){
  let totalDeposito=null,desde='',hasta='';
  for(const row of rows.slice(0,30)){
    const flat=row.map(v=>String(v??'').trim());
    const line=flat.join(' ');
    if(/TOTAL\s*(A\s*)?DEP[OÃ"]SITO|TOTAL\s*EN\s*CUENTA|SALDO\s*BOLD/i.test(line)){
      const v=flat.find(c=>/^[\d.,]+$/.test(c.replace(/[\s$]/g,'')));
      if(v)totalDeposito=parseMoneyAny(v);
    }
    const fechaM=line.match(/\d{4}-\d{2}-\d{2}/g);
    if(fechaM&&!desde)desde=fechaM[0];
    if(fechaM&&fechaM.length>1)hasta=fechaM[1];
  }
  return {saldoInicial:null,saldoFinal:totalDeposito,banco:isBoldCF?'Bold CF':'Bold',desde,hasta,esProcesadorPago:true};
}
function extractGenericSaldos(text,banco){
  const ant=text.match(/(?:SALDO\s+ANTERIOR|SALDO\s+INICIAL)\s*:?\s*\$?\s*([\d.,]+)/i);
  const fin=text.match(/(?:SALDO\s+FINAL|SALDO\s+NUEVO|SALDO\s+ACTUAL)\s*:?\s*\$?\s*([\d.,]+)/i);
  return {
    saldoInicial:ant?parseMoneyAny(ant[1]):null,
    saldoFinal:fin?parseMoneyAny(fin[1]):null,
    banco:banco||'Extracto',
    desde:'',hasta:'',esProcesadorPago:false
  };
}
function renderSaldoCheck(rows,meta,containerId){
  const el=$(containerId); if(!el)return;
  const {saldoInicial,saldoFinal,banco,desde,hasta,esProcesadorPago}=meta||{};
  if(saldoInicial===null&&saldoFinal===null){el.innerHTML='';return;}
  const ingresos=rows.filter(r=>r.tipo==='Ingreso').reduce((a,x)=>a+Number(x.monto||0),0);
  const egresos=rows.filter(r=>r.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0);
  const calculado=(saldoInicial??0)+ingresos-egresos;
  const diff=saldoFinal!=null?Math.round(calculado-saldoFinal):null;
  const ok=diff!==null&&Math.abs(diff)<500;
  const periodo=desde?` · ${desde}${hasta?' → '+hasta:''}` :'';
  el.innerHTML=`<div class="saldoCheck ${ok?'saldoOk':diff!==null?'saldoBad':'saldoInfo'}">
    <div class="saldoTitle">${esc(banco)}${esc(periodo)} · Verificación de cuadre</div>
    <div class="saldoGrid">
      ${saldoInicial!==null?`<span>Saldo inicial extracto</span><strong>${fmtCOP(saldoInicial)}</strong>`:''}
      <span>+ Ingresos detectados (${rows.filter(r=>r.tipo==='Ingreso').length})</span><strong class="good">+${fmtCOP(ingresos)}</strong>
      <span>- Egresos detectados (${rows.filter(r=>r.tipo==='Egreso').length})</span><strong class="bad">-${fmtCOP(egresos)}</strong>
      <span>= Saldo calculado</span><strong>${fmtCOP(calculado)}</strong>
      ${saldoFinal!==null?`<span>${esProcesadorPago?'Total depositado (extracto)':'Saldo final extracto'}</span><strong>${fmtCOP(saldoFinal)}</strong>`:''}
      ${diff!==null?`<span class="saldoDiffLabel">Diferencia</span><strong class="${ok?'good':'bad'}">${ok?'✔ Cuadra perfectamente':fmtCOP(Math.abs(diff))+' de diferencia'}</strong>`:''}
    </div>
    ${!ok&&diff!==null?`<p class="saldoHint">Puede faltar un movimiento, haber uno duplicado, o el extracto no captura el periodo completo.</p>`:''}
  </div>`;
}
function parseBancolombiaPdfText(text){
  // Extraer aÃ±o y mes lÃ­mite del encabezado
  const hastaM=text.match(/HASTA:\s*(\d{4})\/(\d{2})\/\d{2}/i);
  const desdeM=text.match(/DESDE:\s*(\d{4})\/(\d{2})\/\d{2}/i);
  const endYear=hastaM?+hastaM[1]:new Date().getFullYear();
  const endMonth=hastaM?+hastaM[2]:12;
  const startYear=desdeM?+desdeM[1]:endYear;
  function resolveDate(day,month){
    const m=+month,d=+day;
    // Si el mes es mayor al mes final del extracto â†' pertenece al aÃ±o anterior
    const y=m>endMonth?startYear:endYear;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function makeTx(day,month,descripcion,amount){
    const fecha=resolveDate(day,month);
    const desc=norm(descripcion.replace(/\s+/g,' ').trim())||'MOVIMIENTO';
    const tipo=amount>=0?'Ingreso':'Egreso';
    return {fecha,tipo,descripcion:desc,monto:Math.abs(amount),metodo:'Bancolombia M',categoria:suggestCategory({descripcion:desc,metodo:'Bancolombia M',tipo}),obs:'Extracto Bancolombia',factura:'',ref:''};
  }

  const tx=[];
  // Separar en pÃ¡ginas por "PÃGINA: N"
  const pages=text.split(/P[AÃ]GINA[:\s]*\d+/i).filter(p=>p.trim().length>50);

  for(const page of pages){
    const dateMatches=[...page.matchAll(/\b(\d{1,2})\/(\d{2})\b/g)];
    if(!dateMatches.length) continue;

    // Detectar formato columnar (pÃ¡gina 2): muchas fechas agrupadas al inicio
    // HeurÃ­stica: 4+ fechas antes del primer nÃºmero con decimales
    const firstNum=page.search(/-?[\d,]+\.\d{2}/);
    const datesBeforeNums=dateMatches.filter(m=>m.index<firstNum).length;
    const isColumnar=datesBeforeNums>=4;

    if(isColumnar){
      // Separar bloques: fechas | descripciones | montos | saldos
      const lastDateEnd=dateMatches[dateMatches.length-1].index+dateMatches[dateMatches.length-1][0].length;
      const allNumMatches=[...page.matchAll(/-?[\d,]+\.\d{2}/g)];
      // Saldos son nÃºmeros grandes (>500k), montos son menores
      const SALDO_MIN=500000;
      const amountNums=allNumMatches.filter(n=>Math.abs(parseMoneyAny(n[0]))<SALDO_MIN);
      // Bloque de descripciones: entre fin de fechas y primer monto
      const firstAmtIdx=amountNums.length?amountNums[0].index:lastDateEnd;
      const descBlock=page.slice(lastDateEnd,firstAmtIdx);
      // Dividir descripciones en el bloque usando palabras clave de inicio
      const descSplitRe=/(?=(?:PAGO|ABONO|TRANSFERENCIA|IMPTO|IVA|COBRO|CUOTA|SERVICIO)\b)/gi;
      const rawDescs=descBlock.split(descSplitRe).map(s=>s.replace(/FIN\s+ESTADO.*/i,'').trim()).filter(Boolean);
      const n=Math.min(dateMatches.length,amountNums.length);
      for(let i=0;i<n;i++){
        const amount=parseMoneyAny(amountNums[i][0]);
        if(!Number.isFinite(amount)) continue;
        tx.push(makeTx(dateMatches[i][1],dateMatches[i][2],rawDescs[i]||'MOVIMIENTO',amount));
      }
    } else {
      // Formato fila por fila (pÃ¡gina 1): D/MM DESCRIPCION MONTO SALDO
      for(let i=0;i<dateMatches.length;i++){
        const m=dateMatches[i];
        const segEnd=i+1<dateMatches.length?dateMatches[i+1].index:page.length;
        const seg=page.slice(m.index+m[0].length,segEnd);
        const numMatches=[...seg.matchAll(/-?[\d,]+\.\d{2}/g)];
        if(!numMatches.length) continue;
        // PenÃºltimo nÃºmero = monto, Ãºltimo = saldo (si hay 2+); si solo hay 1 = monto
        const amtMatch=numMatches.length>=2?numMatches[numMatches.length-2]:numMatches[0];
        const amount=parseMoneyAny(amtMatch[0]);
        if(!Number.isFinite(amount)) continue;
        const descripcion=seg.slice(0,amtMatch.index);
        tx.push(makeTx(m[1],m[2],descripcion,amount));
      }
    }
  }
  const result=tx.filter((v,i,a)=>a.findIndex(x=>extractIdFor(x)===extractIdFor(v))===i)
                  .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));
  pdfMeta=extractBancolombiaSaldos(text);
  return result;
}

function parsePdfText(){
  const text=$('#pdfText').value||'';
  const bank=norm($('#pdfBank').value)||'Extracto';
  // DetecciÃ³n automÃ¡tica de extracto Bancolombia (formato D/MM sin aÃ±o)
  if(/ESTADO\s+DE\s+CUENTA/i.test(text)&&/ABONO\s+INTERESES\s+AHORROS|BANCOLOMBIA/i.test(text)&&/DESDE:|HASTA:/i.test(text)){
    pdfTx=parseBancolombiaPdfText(text); // pdfMeta se setea adentro
    renderPdfPreview();
    $('#pdfLog').textContent=`Extracto Bancolombia detectado: ${pdfTx.length} movimientos. Revisa antes de guardar.`;
    return;
  }
  pdfMeta=extractGenericSaldos(text,bank);
  const lines=text.split(/\r?\n|(?=\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/).map(norm).filter(Boolean); const tx=[]; const dateRe='(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}[\\-\\/]\\d{1,2}[\\-\\/]\\d{1,2})'; const moneyRe='([+-]?\\$?\\s?\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?|[+-]?\\d{4,})'; for(const line of lines){const m=line.match(new RegExp(dateRe+'.{0,120}?'+moneyRe,'i')); if(!m)continue; let fecha=''; const d=m[1].replaceAll('-','/'); if(/^\d{4}/.test(d)){const parts=d.split('/'); fecha=`${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`} else fecha=toISODateFromDMY(d.length===8?d.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})/,'$1/$2/20$3'):d); const amount=parseMoneyAny(m[2]); if(!fecha||!Number.isFinite(amount)||Math.abs(amount)<1000)continue; const tipo=(/abono|consignaci|transferencia recibida|credito|cr[eÃ©]dito|ingreso/i.test(line)||amount>0&&!/compra|pago|retiro|debito|d[eÃ©]bito/i.test(line))?'Ingreso':'Egreso'; const descripcion=line.replace(m[1],'').replace(m[2],'').slice(0,180); tx.push({fecha,tipo,descripcion:norm(descripcion)||line,monto:Math.abs(amount),metodo:bank,categoria:suggestCategory({descripcion:line,metodo:bank,tipo}),obs:'ExtraÃ­do de PDF/texto',factura:'',ref:''})} pdfTx=tx.filter((v,i,a)=>a.findIndex(x=>extractIdFor(x)===extractIdFor(v))===i).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); renderPdfPreview(); $('#pdfLog').textContent=`Detectados ${pdfTx.length} posibles movimientos. Revisa antes de guardar, porque PDF no es orÃ¡culo.`}
function renderPdfPreview(){
  const existing=new Set(extractRows.map(extractIdFor)); let ready=0,dup=0;
  $('#pdfBody').innerHTML=pdfTx.map(r=>{const d=existing.has(extractIdFor(r)); if(d)dup++; else ready++; return `<tr class="${d?'isDup':'isOk'}"><td>${d?'Duplicado':'Listo'}</td><td>${esc(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td class="num">${fmtCOP(r.monto)}</td><td>${esc(r.metodo)}</td><td>${esc(r.categoria)}</td></tr>`}).join('')||'<tr><td colspan="7" class="muted">Sin movimientos detectados.</td></tr>';
  $('#btnSavePdfTx').disabled=ready===0;
  renderSaldoCheck(pdfTx,pdfMeta,'#saldoCheckPdf');
}
async function savePdfTx(){
  await commitRows(pdfTx,{source:'PDF/TEXTO',fileName:$('#pdfFile').files[0]?.name||'texto-pegado',target:'extract',saldoMeta:pdfMeta});
  pdfTx=[]; pdfMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false};
  renderPdfPreview();
}

function renderCalendar(){const boxes=[['calendarBox','calTitle'],['calendarBox2','calTitle2']]; const y=calDate.getFullYear(), m=calDate.getMonth(); const first=new Date(y,m,1), last=new Date(y,m+1,0); const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']; const dates=new Set(allTx.map(x=>x.fecha)); const uploaded=[...dates].filter(d=>d.startsWith(`${y}-${String(m+1).padStart(2,'0')}-`)).length; const workdays=[...Array(last.getDate())].map((_,i)=>new Date(y,m,i+1)).filter(d=>d.getDay()!==0).length; $('#monthStats').textContent=`${uploaded} dÃ­as con datos, ${Math.max(0,workdays-uploaded)} faltan. Domingos no cuentan.`; for(const [boxId,titleId] of boxes){const box=$('#'+boxId), title=$('#'+titleId); if(!box||!title)continue; title.textContent=`${monthNames[m]} de ${y}`; let html='<div class="weekHead"><b>L</b><b>M</b><b>M</b><b>J</b><b>V</b><b>S</b><b>D</b></div><div class="days">'; const start=(first.getDay()+6)%7; for(let i=0;i<start;i++)html+='<div class="day blank"></div>'; for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m,d), iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, off=dt.getDay()===0, up=dates.has(iso), cls=off?'off':up?'uploaded':'missing'; html+=`<button class="day ${cls}" data-date="${iso}"><b>${d}</b><span>${off?'No cuenta':up?'Con datos':'Falta'}</span></button>`} html+='</div>'; box.innerHTML=html;}}
function renderImports(){const box=$('#recentImports'); if(!box)return; box.innerHTML=imports.slice(0,12).map(i=>`<div class="listRow"><span><b>${esc(i.source||'Importación')}</b><br>${esc(i.fileName||'')} · ${esc(i.target||'flow')}</span><strong>${fmtNum(i.inserted||0)}</strong></div>`).join('')||'<p class="muted">Sin importaciones.</p>'}

function openEdit(kind,id){let r=null, title='Editar'; if(kind==='fc'){r=allTx.find(x=>x.id===id)||{}; $('#editCollection').value=COLLECTION; title='Editar Flujo de Caja'} if(kind==='ext'){r=extractRows.find(x=>x.id===id)||{}; $('#editCollection').value=EXTRACTS; title='Editar Extracto'} if(kind==='rip'){r=ripRows.find(x=>x.id===id)||{}; $('#editCollection').value=$('#ripCollection').value||'clientesB2C'; title='Editar RIP'} $('#editKind').value=kind; $('#editDocId').value=id||''; $('#editTitle').textContent=title; $('#editFecha').value=r.fecha||new Date().toISOString().slice(0,10); $('#editTipo').value=r.tipo||'Ingreso'; $('#editDescripcion').value=kind==='rip'?(r.estudiante||''):(r.descripcion||''); $('#editMonto').value=r.monto||''; $('#editMetodo').value=r.metodo||''; $('#editCategoria').value=kind==='rip'?(r.servicio||''):(r.categoria||''); $('#editFactura').value=r.factura||''; $('#editRef').value=r.ref||''; $('#editObs').value=r.obs||''; $('#editDialog').showModal()}
async function saveEdit(e){e.preventDefault(); const kind=$('#editKind').value, id=$('#editDocId').value, coll=$('#editCollection').value; if(!id&&kind==='rip')return; if(kind==='rip'){const ripUpd={fecha:$('#editFecha').value,estudiante:$('#editDescripcion').value,servicio:$('#editCategoria').value,medioPago:$('#editMetodo').value,monto:Number($('#editMonto').value||0)}; await setDoc(doc(ripDb,coll,id),{...ripUpd,updatedAt:serverTimestamp()},{merge:true}); const rd=ripDocs.find(r=>r._id===id); if(rd)Object.assign(rd,ripUpd); const rr=ripRows.find(r=>r.id===id); if(rr)Object.assign(rr,{fecha:ripUpd.fecha,estudiante:ripUpd.estudiante,servicio:ripUpd.servicio,metodo:ripUpd.medioPago,monto:ripUpd.monto}); renderRipAll(); renderDashboard();} else {const data=cleanTx({fecha:$('#editFecha').value,tipo:$('#editTipo').value,descripcion:$('#editDescripcion').value,monto:$('#editMonto').value,metodo:$('#editMetodo').value,categoria:$('#editCategoria').value,factura:$('#editFactura').value,ref:$('#editRef').value,obs:$('#editObs').value}); const target=kind==='ext'?EXTRACTS:COLLECTION; const docId=id||docIdFor(data); await setDoc(doc(db,target,docId),{...data,updatedAt:serverTimestamp(),createdAt:serverTimestamp()},{merge:true}); await loadData();} $('#editDialog').close(); toast('Guardado \u2705')}
async function del(kind,id){if(!confirm('Â¿Borrar este registro?'))return; await deleteDoc(doc(db,kind==='ext'?EXTRACTS:COLLECTION,id)); await loadData(); toast('Borrado')}

function bind(){
  $('#btnLogin').onclick=()=>signInWithPopup(auth,provider); $('#btnLogout').onclick=()=>signOut(auth);
  $('#btnRipLogin').onclick=()=>signInWithPopup(ripAuth,ripProvider); $('#btnLoadRip').onclick=loadRip;
  $$('.tab[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view)); if($('#btnApplyDashboard'))$('#btnApplyDashboard').onclick=renderAll; if($('#btnApplyTx'))$('#btnApplyTx').onclick=()=>applyTxFilters(true); if($('#btnExport'))$('#btnExport').onclick=exportCSV; if($('#btnAutoCat'))$('#btnAutoCat').onclick=autoCategorize; if($('#btnReCat'))$('#btnReCat').onclick=()=>autoCategorize(true); if($('#expMonth'))$('#expMonth').onchange=()=>{}; if($('#fcMes'))$('#fcMes').onchange=e=>setFcMonth(e.target.value); ['txFrom','txTo','txTipo','txCat','txCanal'].forEach(id=>{const el=$('#'+id); if(el)el.onchange=()=>applyTxFilters(true)}); if($('#txQ'))$('#txQ').oninput=()=>applyTxFilters(true); if($('#btnSinCat'))$('#btnSinCat').onclick=()=>{const btn=$('#btnSinCat'); const active=btn.dataset.active==='1'; btn.dataset.active=active?'0':'1'; btn.classList.toggle('primary',!active); btn.classList.toggle('ghost',active); applyTxFilters(true);};
  if($('#btnNewFlow'))$('#btnNewFlow').onclick=()=>openEdit('fc',''); if($('#btnNewExtract'))$('#btnNewExtract').onclick=()=>openEdit('ext',''); if($('#editForm'))$('#editForm').onsubmit=saveEdit;
  if($('#txBody')){$('#txBody').onclick=e=>{const er=e.target.closest('[data-edit-rip]');if(er){openEdit('rip',er.dataset.editRip);return;} const ed=e.target.closest('[data-edit-fc]'), delb=e.target.closest('[data-del-fc]'); if(ed)openEdit('fc',ed.dataset.editFc); if(delb)del('fc',delb.dataset.delFc)}; $('#txBody').addEventListener('change',async e=>{const sel=e.target.closest('.catInline'); if(!sel)return; const id=sel.dataset.id; const cat=sel.value; if(!cat)return; try{await setDoc(doc(db,COLLECTION,id),{categoria:cat,updatedAt:serverTimestamp()},{merge:true}); const tx=allTx.find(x=>x.id===id); if(tx)tx.categoria=cat; applyTxFilters(true); toast('Clasificado: '+cat+' \u2705');}catch(err){console.error(err); toast('Error al guardar categorÃ­a.');}});}
  if($('#extractBody'))$('#extractBody').onclick=e=>{const ed=e.target.closest('[data-edit-ext]'), delb=e.target.closest('[data-del-ext]'); if(ed)openEdit('ext',ed.dataset.editExt); if(delb)del('ext',delb.dataset.delExt)};
  if($('#ripBody'))$('#ripBody').onclick=e=>{const ed=e.target.closest('[data-edit-rip]'); if(ed)openEdit('rip',ed.dataset.editRip)}; if($('#btnFilterRip'))$('#btnFilterRip').onclick=renderRipAll; if($('#btnFilterExt'))$('#btnFilterExt').onclick=()=>filterExtract(true); if($('#ripServFilter'))$('#ripServFilter').onchange=renderRipAll; if($('#ripMetFilter'))$('#ripMetFilter').onchange=renderRipAll; if($('#ripFrom'))$('#ripFrom').onchange=renderRipAll; if($('#ripTo'))$('#ripTo').onchange=renderRipAll;
  $('#bankFile').onchange=e=>processBankFile(e.target.files[0]); $('#bankSource').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#boldMode').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#boldOnlyOk').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#splitFees').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#bankBody').onchange=e=>{const s=e.target.closest('.catSel'); if(s&&bankTx[s.dataset.idx]){bankTx[s.dataset.idx].categoria=s.value; renderBankPreview()}}; $('#btnUploadBank').onclick=uploadBank; $('#btnBankCsv').onclick=bankCsv; $('#btnBankClear').onclick=()=>{bankTx=[]; $('#bankFile').value=''; renderBankPreview(); $('#bankLog').textContent='Esperando archivo...'};
  $('#btnReadPdf').onclick=readPdf; $('#btnParseText').onclick=parsePdfText; $('#btnSavePdfTx').onclick=savePdfTx; $('#btnClearPdf').onclick=()=>{pdfTx=[]; $('#pdfText').value=''; $('#pdfFile').value=''; renderPdfPreview()};
  $('#calPrev').onclick=$('#calPrev2').onclick=()=>{calDate.setMonth(calDate.getMonth()-1); renderCalendar()}; $('#calNext').onclick=$('#calNext2').onclick=()=>{calDate.setMonth(calDate.getMonth()+1); renderCalendar()};
}

bind(); bilBind(); $('#rulesBox').textContent=RULES;
onAuthStateChanged(auth, async user=>{const ok=!!user&&ALLOWED.has(user.email); $('#userEmail').textContent=user?.email||'Sin sesión'; $('#btnLogin').classList.toggle('hidden',!!user); $('#btnLogout').classList.toggle('hidden',!user); showApp(ok); if(ok) await loadData();});
let _ripAuthLoaded=false;
onAuthStateChanged(ripAuth,user=>{if($('#ripEmail'))$('#ripEmail').textContent=user?.email||'RIP Sin sesión'; if(user&&!_ripAuthLoaded){_ripAuthLoaded=true; loadRip();}});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

// â"€â"€â"€ FACTURACIÃ"N â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const BIL_NOTE='Para efectos del IVA esta factura se acoge a la normativa del artÃ­culo 476, numeral 18 del estatuto tributario y el artÃ­culo 6 de la Ley 1493 de 2011, la cual indica: "EstÃ¡n excluidos del IVA los espectÃ¡culos pÃºblicos de las artes escÃ©nicas, asÃ­ como los servicios artÃ­sticos prestados para la realizaciÃ³n de los espectÃ¡culos pÃºblicos de las artes escÃ©nicas definidos en el literal c) del artÃ­culo 3Â° de la presente ley."';
const bilSel=new Set();
let bilByMk=new Map();
let bilLists={pendientes:[],facturadas:[],nover:[],noverRip:[],noverFc:[],ingresos:[]};

const bilN=v=>String(v??'').replace(/\s+/g,' ').trim();
const bilL=v=>bilN(v).toLowerCase();
const bilNum=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,'')); return Number.isFinite(n)?n:0;};
const bilPick=(d,...ff)=>{for(const f of ff){const v=d[f]; if(v!==undefined&&v!==null&&v!=='')return v;} return '';};
const bilMoney=v=>{const n=Number(v); return Number.isFinite(n)?n.toLocaleString('es-CO'):String(v??'');};

function ripDocToItem(raw){
  const fecha=bilN(bilPick(raw,'fecha','fechaClase','fechaPago','date','Fecha'));
  const medio=bilN(bilPick(raw,'medioPago','metodo','formaPago','canal'));
  const fevmRaw=bilN(bilPick(raw,'fevm','FEVM'));
  const fevm=/^(0+|fevm[-\s]?0+)$/i.test(fevmRaw)?'':fevmRaw;
  const documento=bilN(bilPick(raw,'documento','cedula','documentoCliente','nit','cc'));
  const recargo=bilNum(bilPick(raw,'recargo','surcharge')||0);
  const descuentos=bilNum(bilPick(raw,'descuentos','descuento','discount')||0);
  const usuarios=Array.isArray(raw.usuarios)?raw.usuarios:[];
  const usuariosValidos=usuarios.filter(u=>Math.abs(bilNum(bilPick(u,'precio','valor','costo','monto','pago','total')||0))>=1000);
  const total=usuariosValidos.length
    ?usuariosValidos.reduce((a,u)=>a+Math.abs(bilNum(bilPick(u,'precio','valor','costo','monto','pago','total')||0)),0)
    :Math.abs(bilNum(bilPick(raw,'total','descuento','valor','precio','pago')||0));
  const inscripcion=usuariosValidos.length?bilN(bilPick(usuariosValidos[0],'estudiante','nombre','alumno','cliente','student')):bilN(bilPick(raw,'estudiante','alumno','nombre','cliente'));
  const inscripcion1=usuariosValidos.length>1?bilN(bilPick(usuariosValidos[1],'estudiante','nombre','alumno','cliente','student')):'';
  const servicios=usuariosValidos.map(u=>({
    usuario:bilN(bilPick(u,'estudiante','nombre','alumno','cliente','student')),
    servicio:bilN(bilPick(u,'servicio','modalidad','plan','paquete','tipo','producto','clase'))||'Sin clasificar',
    precio:bilNum(bilPick(u,'precio','valor','costo','monto','pago','total')||0),
  })).filter(s=>s.usuario||s.servicio||s.precio);
  return {matchKey:raw._id,fecha,total,medio,documento,inscripcion,inscripcion1,fevm,recargo,descuentos,servicios};
}

function bilLabelIns(it){return bilN(it?.inscripcion)||bilN(it?.inscripcion1)||'â€"';}

function normMedio(s){
  let v=bilN(s||'');
  v=v.replace(/\s+m$/i,'');   // "Bancolombia M" â†' "bancolombia", "Davivienda M" â†' "davivienda"
  return v;
}
function bilBuildReconcKeys(rows,fF,mF,medF){
  const counter=new Map();
  return rows.map(r=>{
    const serial=toExcelSerial(r[fF]);
    const base=`${serial}-${Math.round(Number(r[mF]||0))}-${normMedio(r[medF]||'')}`;
    const n=(counter.get(base)||0)+1; counter.set(base,n);
    return {...r,_rk:`${base}${n}`};
  });
}

function isFesicolDoc(raw){
  const parts=[raw.servicio,raw.modalidad,raw.plan,raw.fuente,raw.evento,raw.descripcion,...(Array.isArray(raw.usuarios)?raw.usuarios.map(u=>u.servicio||u.modalidad||''):[])];
  return lower(parts.filter(Boolean).join(' ')).includes('fesicol');
}
function bilBuildLists(){
  const from = $('#dashFrom')?.value || `${curYear()}-01-01`;
  const to = $('#dashTo')?.value || `${curYear()}-12-31`;
  const isExcludedBillingChannel = c => {
    const val = String(c || '').toLowerCase().trim();
    return val === 'fesicol';
  };
  const isAutoReconciledBillingChannel = c => {
    const val = String(c || '').toLowerCase().trim();
    return val === 'efectivo';
  };
  // Fesicol is completely excluded from Billing.
  const ripItems=ripDocs.filter(raw=>!isFesicolDoc(raw)).map(ripDocToItem).filter(r=>r.fecha&&r.total>=1000&&r.fecha>=from&&r.fecha<=to&&!isExcludedBillingChannel(r.medio));
  const fcIngresos=allTx.filter(tx=>isB2CIncome(tx)&&tx.fecha&&tx.fecha>=from&&tx.fecha<=to&&!isExcludedBillingChannel(tx.metodo));
  // Ambos lados usan la misma fÃ³rmula: excelSerial-monto-medioN
  // matchKey (doc ID de Firestore) sigue siendo el identificador para guardar FEVM
  const ripK=bilBuildReconcKeys(ripItems,'fecha','total','medio');
  const fcK=bilBuildReconcKeys(fcIngresos,'fecha','monto','metodo');
  const fcSet=new Set(fcK.map(r=>r._rk));
  const ripSet=new Set(ripK.map(r=>r._rk));
  // A RIP item is "conciliado" if it matches in fcSet OR is Efectivo
  const isMatched = r => fcSet.has(r._rk) || isAutoReconciledBillingChannel(r.medio);
  // Pendientes = "conciliados" (matched/auto) that DO NOT have FEVM
  bilLists.pendientes=ripK.filter(r=>!r.fevm&&isMatched(r)).map(({_rk,...r})=>r);
  bilLists.facturadas=ripK.filter(r=>r.fevm).map(({_rk,...r})=>r);
  // No verificadas RIP = todos los RIP sin match en FC (con o sin FEVM) que no tienen FEVM o tienen FEVM menor de 10
  const getFevmNum = (fevmStr) => {
    if (!fevmStr) return 0;
    const m = fevmStr.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };
  const noverRip=ripK.filter(r=>!isMatched(r) && (!r.fevm || getFevmNum(r.fevm) < 10)).map(r=>({...r,_src:'RIP'}));
  const noverFc=fcK.filter(r=>!ripSet.has(r._rk)).map(r=>({matchKey:r.id,_rk:r._rk,fecha:r.fecha||'',total:r.monto||0,medio:r.metodo||'',categoria:r.categoria||'',factura:r.factura||'',_src:'FC'}));
  bilLists.noverRip=noverRip.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));
  bilLists.noverFc=noverFc.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));
  bilLists.nover=[...noverRip,...noverFc];
  bilLists.ingresos=[];
  bilByMk.clear();
  [...bilLists.pendientes,...bilLists.facturadas,...bilLists.nover].forEach(it=>{if(it.matchKey)bilByMk.set(it.matchKey,it);});
}

function bilSetKpis(){
  $('#bilKpiPend').textContent=bilLists.pendientes.length;
  $('#bilKpiFact').textContent=bilLists.facturadas.length;
  $('#bilKpiNover').textContent=bilLists.nover.length;
  $('#bilKpiIng').textContent=bilLists.ingresos.length;
  $('#bilKpiSel').textContent=bilSel.size;
}

function bilSetTab(name){
  $$('[data-bil]').forEach(b=>b.classList.toggle('active',b.dataset.bil===name));
  $$('[id^="bilPane-"]').forEach(p=>p.classList.toggle('hidden',p.id!==`bilPane-${name}`));
}

function bilFillMedios(){
  const sel=$('#bilFMedio'); if(!sel)return;
  const cur=sel.value;
  const medios=[...new Set(bilLists.pendientes.map(r=>bilN(r.medio)).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los medios</option>'+medios.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  sel.value=cur||'';
}

function bilRenderPendientes(){
  const q=bilL($('#bilQPend')?.value||'');
  const medio=bilN($('#bilFMedio')?.value||'');
  let rows=bilLists.pendientes.slice();
  if(medio)rows=rows.filter(r=>bilN(r.medio)===medio);
  if(q)rows=rows.filter(r=>bilL(r.matchKey).includes(q)||bilL(r.medio).includes(q)||bilL(r.inscripcion).includes(q)||bilL(r.inscripcion1).includes(q)||bilL(r.documento).includes(q));
  const tbody=$('#bilBodyPend'); if(!tbody)return;
  $('#bilEmptyPend').hidden=rows.length!==0;
  tbody.innerHTML=rows.map(it=>`<tr data-mk="${esc(it.matchKey)}" class="bilRow">
    <td style="text-align:center"><input type="checkbox" data-bchk="${esc(it.matchKey)}" ${bilSel.has(it.matchKey)?'checked':''}></td>
    <td>${esc(it.fecha)}</td><td>${esc(bilLabelIns(it))}</td>
    <td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td><td>${esc(bilN(it.documento))}</td>
    <td><span class="statusDot ${it._enFC?'dotOk':'dotBad'}">${it._enFC?'\u2714 FC':'Sin FC'}</span></td>
    <td><code>${esc(bilN(it.matchKey))}</code></td>
  </tr>`).join('');
  tbody.querySelectorAll('[data-bchk]').forEach(ch=>ch.addEventListener('change',e=>{
    const mk=e.target.getAttribute('data-bchk');
    if(e.target.checked)bilSel.add(mk); else bilSel.delete(mk);
    bilSetKpis();
  }));
}

function bilRenderFacturadas(){
  const q=bilL($('#bilQFact')?.value||'');
  let rows=bilLists.facturadas.slice();
  if(q)rows=rows.filter(r=>bilL(r.fevm).includes(q)||bilL(r.matchKey).includes(q)||bilL(r.inscripcion).includes(q)||bilL(r.inscripcion1).includes(q)||bilL(r.documento).includes(q));
  const tbody=$('#bilBodyFact'); if(!tbody)return;
  $('#bilEmptyFact').hidden=rows.length!==0;
  tbody.innerHTML=rows.map(it=>`<tr data-mk="${esc(it.matchKey)}" class="bilRow">
    <td>${esc(it.fecha)}</td><td>${esc(bilLabelIns(it))}</td>
    <td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td><td>${esc(bilN(it.documento))}</td>
    <td><code>${esc(bilN(it.matchKey))}</code></td><td>${esc(bilN(it.fevm))}</td>
  </tr>`).join('');
}

function bilRenderNover(){
  const q=bilL($('#bilQNover')?.value||'');
  const matchQ=r=>!q||bilL(r.medio).includes(q)||bilL(r.inscripcion||'').includes(q)||bilL(r.categoria||'').includes(q)||bilL(r.documento||'').includes(q)||bilL(r._rk||'').includes(q);
  const ripRows=(bilLists.noverRip||[]).filter(matchQ);
  const fcRows=(bilLists.noverFc||[]).filter(matchQ);
  const empty=ripRows.length===0&&fcRows.length===0;
  $('#bilEmptyNover').hidden=!empty;
  const tbodyRip=$('#bilBodyNoverRip');
  const tbodyFc=$('#bilBodyNoverFc');
  $('#bilBadgeNoverRip').textContent=ripRows.length;
  $('#bilBadgeNoverFc').textContent=fcRows.length;
  if(tbodyRip) tbodyRip.innerHTML=ripRows.map(it=>`<tr data-mk="${esc(it.matchKey)}" class="bilRow">
    <td>${esc(it.fecha)}</td>
    <td>${esc(bilLabelIns(it))}</td>
    <td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td>
    <td>${esc(bilN(it.documento))}</td>
    <td>${it.fevm?`<span class="statusDot dotOk" style="font-size:0.75em">${esc(bilN(it.fevm))}</span>`:'<span class="statusDot dotBad" style="font-size:0.75em">Sin FEVM</span>'}</td>
    <td><code style="color:var(--accent,#6c63ff);font-size:0.78em">${esc(bilN(it._rk))}</code></td>
  </tr>`).join('');
  if(tbodyFc) tbodyFc.innerHTML=fcRows.map(it=>`<tr data-mk="${esc(it.matchKey)}" class="bilRow">
    <td>${esc(it.fecha)}</td>
    <td>${esc(bilN(it.categoria))}</td>
    <td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td>
    <td><code style="color:var(--accent,#6c63ff);font-size:0.78em">${esc(bilN(it._rk))}</code></td>
  </tr>`).join('');
}

function bilRenderIngresos(){
  const q=bilL($('#bilQIng')?.value||'');
  let rows=bilLists.ingresos.slice();
  if(q)rows=rows.filter(r=>bilL(r.matchKey).includes(q)||bilL(r.medio).includes(q)||bilL(r.fecha).includes(q)||bilL(r.factura).includes(q));
  const tbody=$('#bilBodyIng'); if(!tbody)return;
  $('#bilEmptyIng').hidden=rows.length!==0;
  tbody.innerHTML=rows.map(it=>`<tr>
    <td>${esc(it.fecha)}</td><td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td><td>${esc(bilN(it.categoria))}</td><td>${esc(bilN(it.factura))}</td>
    <td><code>${esc(bilN(it.matchKey))}</code></td>
  </tr>`).join('');
}

function bilRenderSearch(results){
  const tbody=$('#bilBodySearch'); if(!tbody)return;
  $('#bilEmptySearch').hidden=!!(results&&results.length);
  tbody.innerHTML=(results||[]).map(it=>`<tr data-mk="${esc(it.matchKey)}" class="bilRow">
    <td>${esc(it.fecha)}</td><td>${esc(bilLabelIns(it))}</td>
    <td class="num">${esc(bilMoney(it.total))}</td>
    <td>${esc(bilN(it.medio))}</td><td>${esc(bilN(it.documento))}</td>
    <td><code>${esc(bilN(it.matchKey))}</code></td><td>${esc(bilN(it.fevm))}</td>
  </tr>`).join('');
}

function bilSearch(){
  const q=bilL($('#bilQSearch')?.value||'');
  const type=bilN($('#bilSearchType')?.value)||'text';
  if(!q){bilRenderSearch([]);return;}
  const pool=[...bilLists.pendientes,...bilLists.facturadas,...bilLists.nover];
  let results;
  if(type==='factura')results=pool.filter(r=>bilL(r.fevm).includes(q));
  else if(type==='matchkey')results=pool.filter(r=>bilL(r.matchKey).includes(q));
  else results=pool.filter(r=>bilL(r.fevm).includes(q)||bilL(r.matchKey).includes(q)||bilL(r.inscripcion).includes(q)||bilL(r.inscripcion1).includes(q)||bilL(r.documento).includes(q)||bilL(r.medio).includes(q)||bilL(r.fecha).includes(q));
  bilRenderSearch(results);
}

function bilStatus(msg,kind){
  const el=$('#bilStatus'); if(!el)return;
  el.textContent=msg||(ripDocs.length?`${ripDocs.length} docs RIP cargados.`:'Sin datos RIP. Conecta RIP primero.');
  el.style.color=kind==='error'?'var(--a3)':kind==='ok'?'var(--ok)':'var(--muted)';
}

function bilRender(){
  bilBuildLists();
  bilFillMedios();
  bilRenderPendientes();
  bilRenderFacturadas();
  bilRenderNover();
  bilRenderIngresos();
  bilSetKpis();
  bilStatus('');
}

function bilOpenDetail(item){
  if(!item)return;
  const dlg=$('#bilDetailDlg'); if(!dlg)return;
  $('#bilDetailSub').textContent=[bilN(item.fecha)||'â€"',bilN(item.fevm)?`FEVM: ${bilN(item.fevm)}`:'Sin FEVM'].join(' · ');
  $('#bilDIns').textContent=bilLabelIns(item);
  $('#bilDDoc').textContent=bilN(item.documento)||'â€"';
  $('#bilDTot').textContent=bilMoney(item.total)||'â€"';
  $('#bilDMed').textContent=bilN(item.medio)||'â€"';
  $('#bilDRec').textContent=item.recargo?bilMoney(item.recargo):'â€"';
  $('#bilDDes').textContent=item.descuentos?bilMoney(item.descuentos):'â€"';
  $('#bilDetailMK').textContent=bilN(item.matchKey)||'â€"';
  const svBody=$('#bilDetailSvBody');
  if(svBody){
    const svs=(item.servicios||[]).filter(s=>s.usuario||s.servicio||s.precio);
    $('#bilDetailSvEmpty').hidden=svs.length!==0;
    svBody.innerHTML=svs.map(s=>`<tr><td>${esc(s.usuario||'â€"')}</td><td>${esc(s.servicio||'â€"')}</td><td class="num">${esc(bilMoney(s.precio)||'')}</td></tr>`).join('');
  }
  const inpFevm=$('#bilDetailFEVM');
  const btnSave=$('#bilDetailBtnSave');
  const stEl=$('#bilDetailStatus');
  if(inpFevm)inpFevm.value=bilN(item.fevm)||'';
  if(stEl)stEl.textContent='';
  if(btnSave){
    btnSave.textContent=item.fevm?'Actualizar factura':'Guardar factura';
    btnSave.disabled=false;
    btnSave.onclick=async()=>{
      const fevm=bilN(inpFevm?.value);
      if(!fevm){toast('Escribe el nÃºmero de factura.');return;}
      btnSave.disabled=true; btnSave.textContent='Guardando...';
      if(stEl)stEl.textContent='';
      try{
        await bilSaveFEVM([item.matchKey],fevm);
        if(stEl)stEl.textContent=`Factura ${fevm} guardada \u2705`;
        toast(`Factura ${fevm} guardada \u2705`);
        bilRender();
      }catch(e){
        console.error('[BilDetail]',e);
        if(stEl)stEl.textContent=e.message||'Error al guardar.';
        toast(e.message||'Error al guardar.');
        btnSave.disabled=false; btnSave.textContent='Reintentar';
      }
    };
  }
  dlg.showModal();
}

async function bilSaveFEVM(matchKeys,fevm){
  const coll=$('#ripCollection')?.value||'clientesB2C';
  const b=writeBatch(ripDb);
  for(const mk of matchKeys){
    if(!mk)continue;
    b.update(doc(ripDb,coll,mk),{fevm,facturado:true,estadoFacturacion:'facturada',fechaFacturacion:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  await b.commit();
  // Actualizar en memoria para no releer toda la colecciÃ³n
  for(const mk of matchKeys){
    const d=ripDocs.find(r=>r._id===mk);
    if(d){d.fevm=fevm; d.facturado=true; d.estadoFacturacion='facturada';}
  }
}

async function bilMarkInvoice(){
  const fevm=bilN($('#bilFEVM')?.value);
  if(!fevm){toast('Escribe FEVM primero.');return;}
  const keys=[...bilSel];
  if(!keys.length){toast('Selecciona al menos una fila.');return;}
  const btn=$('#bilBtnMark');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  bilStatus(`Guardando ${keys.length} fila(s) con ${fevm}...`,'');
  try{
    await bilSaveFEVM(keys,fevm);
    bilSel.clear();
    const inp=$('#bilFEVM'); if(inp)inp.value='';
    bilRender();
    bilStatus(`Factura ${fevm} guardada ✅ (${keys.length} pago(s))`,'ok');
    toast('Facturado ✅');
  }catch(e){
    console.error('[BilMark]',e);
    bilStatus(e.message||'No se pudo guardar.','error');
    toast(e.message||String(e));
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Marcar facturado';}
  }
}

function bilBindRowClicks(tbodyId){
  const tbody=$(`#${tbodyId}`); if(!tbody)return;
  tbody.onclick=e=>{
    if(e.target?.closest?.('input[type="checkbox"]'))return;
    const tr=e.target?.closest?.('tr[data-mk]'); if(!tr)return;
    const item=bilByMk.get(tr.getAttribute('data-mk'));
    if(item)bilOpenDetail(item);
  };
}

function bilBind(){
  $$('[data-bil]').forEach(b=>b.addEventListener('click',()=>bilSetTab(b.dataset.bil)));
  $('#bilBtnRefresh')?.addEventListener('click',async()=>{bilStatus('Actualizando...',''); await loadRip(); bilRender();});
  $('#bilBtnMark')?.addEventListener('click',bilMarkInvoice);
  $('#bilBtnSelectAll')?.addEventListener('click',()=>{bilLists.pendientes.forEach(it=>{if(it.matchKey)bilSel.add(it.matchKey);}); bilRenderPendientes(); bilSetKpis();});
  $('#bilBtnClearSel')?.addEventListener('click',()=>{bilSel.clear(); bilRenderPendientes(); bilSetKpis();});
  $('#bilBtnCopyNote')?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(BIL_NOTE);}catch(_){const ta=document.createElement('textarea');ta.value=BIL_NOTE;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
    toast('Nota copiada ✅');
  });
  $('#bilBtnSearch')?.addEventListener('click',bilSearch);
  $('#bilQSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')bilSearch();});
  $('#bilQPend')?.addEventListener('input',()=>bilRenderPendientes());
  $('#bilFMedio')?.addEventListener('change',()=>bilRenderPendientes());
  $('#bilQFact')?.addEventListener('input',()=>bilRenderFacturadas());
  $('#bilQNover')?.addEventListener('input',()=>bilRenderNover());
  $('#bilQIng')?.addEventListener('input',()=>bilRenderIngresos());
  bilBindRowClicks('bilBodyPend');
  bilBindRowClicks('bilBodyFact');
  bilBindRowClicks('bilBodyNoverRip');
  bilBindRowClicks('bilBodyNoverFc');
  bilBindRowClicks('bilBodySearch');
  $('#bilBtnCopyDetail')?.addEventListener('click',async()=>{
    const mk=$('#bilDetailMK')?.textContent;
    const item=bilByMk.get(mk); if(!item){toast('No hay detalle para copiar.');return;}
    const svs=(item.servicios||[]).filter(s=>s.usuario||s.servicio||s.precio);
    const lines=['FACTURACIÓN · Musicala',bilN(item.fevm)?`FEVM: ${bilN(item.fevm)}`:'',`Fecha: ${bilN(item.fecha)||'—'}`,`Inscripción: ${bilLabelIns(item)}`,bilN(item.documento)?`Documento: ${bilN(item.documento)}`:'',`Total: ${bilMoney(item.total)||'—'}` , `Medio: ${bilN(item.medio)||'—'}` , `MatchKey: ${bilN(item.matchKey)||'—'}`].filter(Boolean);
    if(svs.length){lines.push('--- Servicios ---');svs.forEach((x,i)=>lines.push(`${i+1}) ${x.usuario?x.usuario+' · ':''}${x.servicio}${x.precio?' · '+bilMoney(x.precio):''}`))}
    const txt=lines.join('\n');
    try{await navigator.clipboard.writeText(txt);}catch(_){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
    toast('Copiado ✅');
  });
}
