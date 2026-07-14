import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = { apiKey:'AIzaSyBnd0yBKhBcEyS5XX7BO6WqT9mRET1zJio', authDomain:'flujo-de-caja-musicala.firebaseapp.com', projectId:'flujo-de-caja-musicala', storageBucket:'flujo-de-caja-musicala.firebasestorage.app', messagingSenderId:'998009800481', appId:'1:998009800481:web:3d36e4b579417657ada060' };
const ripFirebaseConfig = { apiKey:'AIzaSyCaCizVkfWdx97LROV7PYQbFXLPMpxynBg', authDomain:'rip-musicala.firebaseapp.com', projectId:'rip-musicala', storageBucket:'rip-musicala.firebasestorage.app', messagingSenderId:'401885071105', appId:'1:401885071105:web:6bb9b6867d7d81fdec3d00' };
const COLLECTION = 'flujo_caja_transacciones';
const IMPORTS = 'flujo_caja_importaciones';
const EXTRACTS = 'flujo_caja_extractos';
const EXPECTED_EXPENSES = 'flujo_caja_egresos_esperados';
const CONFIG = 'flujo_caja_config';
const REPORT_YEAR = 2026;
const INITIAL_BALANCES = {
  bancolombia: 0,
  davivienda: 0,
  bold: 0
};
const CONFIG_ADMINS = new Set(['alekcaballeromusic@gmail.com','catalina.medina.leal@gmail.com']);
const DEFAULT_ACCESS_USERS={
  'alekcaballeromusic@gmail.com':{name:'Alek Caballero',role:'admin',active:true,pages:['all']},
  'catalina.medina.leal@gmail.com':{name:'Catalina Medina',role:'admin',active:true,pages:['all']},
  'cpsoraya@gmail.com':{name:'Soraya',role:'accountant',active:true,pages:['flujo','facturacion','conciliacion']},
  'cpsoraya@inplementar.com':{name:'Soraya Implementar',role:'accountant',active:true,pages:['flujo','facturacion','conciliacion']},
  'espana.carlos@inplementar.com':{name:'Carlos España',role:'accountant',active:true,pages:['flujo','facturacion','conciliacion']},
  'mateo.munoz@inplementar.com':{name:'Mateo Muñoz',role:'accountant',active:true,pages:['flujo','facturacion','conciliacion']},
  'sonia.pineda@inplementar.com':{name:'Sonia Pineda',role:'accountant',active:true,pages:['flujo','facturacion','conciliacion']}
};
const PAGE_LABELS={inicio:'Inicio visual',flujo:'Flujo de Caja',rip:'RIP',extractos:'Extractos',egresos:'Egresos','subir-bancos':'Subir bancos','subir-extractos':'Subir extractos',calendario:'Calendario',reglas:'Reglas',facturacion:'Facturación',conciliacion:'Conciliación'};
const ACCESS_PAGES=Object.keys(PAGE_LABELS).filter(p=>p!=='reglas');
const VIEW_KEY='flujo_caja_active_view';
let accessUsers={...DEFAULT_ACCESS_USERS};
let currentRole='blocked';
let currentPages=new Set();
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
const ripApp = initializeApp(ripFirebaseConfig, 'rip-musicala'), ripAuth = getAuth(ripApp), ripDb = getFirestore(ripApp), ripProvider = new GoogleAuthProvider();
const $=(q,el=document)=>el.querySelector(q), $$=(q,el=document)=>[...el.querySelectorAll(q)];
const fmtCOP=n=>Number(n||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const fmtNum=n=>Number(n||0).toLocaleString('es-CO');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const plain=s=>norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const lower=s=>norm(s).toLowerCase();
function toExcelSerial(iso){const p=(iso||'').split('-').map(Number); if(!p[0]||!p[1]||!p[2])return 0; return Math.round((new Date(p[0],p[1]-1,p[2])-new Date(1899,11,30))/86400000);}
let allTx=[], filteredTx=[], imports=[], extractRows=[], filteredExtract=[], expectedExpenses=[], filteredExpectedExpenses=[], ripRows=[], ripDocs=[], filteredRip=[], bankTx=[], pdfTx=[], bankSource='—', calDate=new Date();
let pdfMeta={saldoInicial:null,saldoFinal:null,ingresos:null,egresos:null,movimientos:null,cuenta:'',banco:'',desde:'',hasta:'',esProcesadorPago:false};
let bankMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false};
let chMonth, chTopExpenses, chExpenseMonthCat, chCompareSources, chRipService, chRipMethod, chRipMonth, chExtractMonth;

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isConfigAdmin() {
      return isSignedIn() && request.auth.token.email in [
        "alekcaballeromusic@gmail.com",
        "catalina.medina.leal@gmail.com"
      ];
    }
    function accessDoc() {
      return get(/databases/$(database)/documents/flujo_caja_config/access);
    }
    function hasAccess() {
      return isConfigAdmin()
        || (
          isSignedIn()
          && accessDoc().data.users[request.auth.token.email].active == true
        );
    }
    function isAdmin() {
      return isConfigAdmin()
        || (
          isSignedIn()
          && accessDoc().data.users[request.auth.token.email].active == true
          && accessDoc().data.users[request.auth.token.email].role == "admin"
        );
    }
    match /flujo_caja_transacciones/{docId} {
      allow read: if hasAccess();
      allow create, update, delete: if isAdmin();
    }
    match /flujo_caja_importaciones/{docId} { allow read, create, update, delete: if isAdmin(); }
    match /flujo_caja_extractos/{docId} { allow read, create, update, delete: if isAdmin(); }
    match /flujo_caja_egresos_esperados/{docId} { allow read, create, update, delete: if isAdmin(); }
    match /flujo_caja_config/{docId} {
      allow read: if hasAccess();
      allow create, update, delete: if isConfigAdmin();
    }
    match /{document=**} { allow read, write: if false; }
  }
}`;

function toast(msg){const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.add('hidden'),3000)}
function accessFor(email){return accessUsers[email]||null}
function isConfigAdminEmail(email=auth.currentUser?.email||''){return CONFIG_ADMINS.has(email)}
function userCanSee(page){return currentRole==='admin'||currentPages.has('all')||currentPages.has(page)}
async function loadAccessConfig(){try{const snap=await getDoc(doc(db,CONFIG,'access')); accessUsers=snap.exists()?{...DEFAULT_ACCESS_USERS,...(snap.data().users||{})}:{...DEFAULT_ACCESS_USERS};}catch(e){console.warn('No pude leer configuración de accesos, usando defaults.',e); accessUsers={...DEFAULT_ACCESS_USERS};}}
async function saveAccessConfig(){if(!isConfigAdminEmail())return toast('Solo Alek y Catalina pueden modificar accesos.'); const users={}; $$('.accessCard').forEach(card=>{const email=lower(card.querySelector('[data-access-email]')?.value||''); if(!email)return; users[email]={name:norm(card.querySelector('[data-access-name]')?.value||email),role:card.querySelector('[data-access-role]')?.value||'accountant',active:!!card.querySelector('[data-access-active]')?.checked,pages:[...card.querySelectorAll('.accessChip.active')].map(b=>b.dataset.page)};}); accessUsers=users; await setDoc(doc(db,CONFIG,'access'),{users,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.email||''},{merge:true}); toast('Accesos guardados ✅'); renderAccessConfig(); applyRoleUi();}
function setCurrentAccess(email){const cfg=accessFor(email); currentRole=CONFIG_ADMINS.has(email)?'admin':cfg?.active?cfg.role||'accountant':'blocked'; currentPages=new Set(currentRole==='admin'?['all']:(cfg?.pages||[]));}
function applyRoleUi(){const readOnly=currentRole!=='admin'; $$('.tab[data-view]').forEach(b=>b.classList.toggle('hidden',!userCanSee(b.dataset.view))); ['btnAutoCat','btnReCat','btnSinCat'].forEach(id=>$('#'+id)?.classList.toggle('hidden',readOnly));}
function showApp(ok){$('#app').classList.toggle('hidden',!ok); $('#blocked').classList.toggle('hidden',ok); if(ok){applyRoleUi(); renderMonthBar();}}
function showView(name){if(!userCanSee(name))name=[...currentPages][0]||'flujo'; try{localStorage.setItem(VIEW_KEY,name)}catch{} $$('.tab[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`)); if(name==='calendario')renderCalendar(); if(name==='rip')renderRipAll(); if(name==='extractos')renderExtractAll(); if(name==='egresos')renderExpectedExpenses(); if(name==='facturacion')bilRender(); if(name==='conciliacion')renderReconciliation(filteredRip,allTx); if(name==='reglas')renderAccessConfig(); if(name==='flujo'){renderFlowSummary(); applyTxFilters(true); if(ripRows.length)renderReconciliation(filteredRip,allTx);}}
function restoreView(){let view='inicio'; try{view=localStorage.getItem(VIEW_KEY)||view}catch{} showView(view)}
function pageChip(page,pages,disabled){return `<button class="accessChip ${pages.includes(page)||pages.includes('all')?'active':''}" data-page="${esc(page)}" type="button"${disabled?' disabled':''}>${esc(PAGE_LABELS[page])}</button>`}
function renderAccessConfig(){const body=$('#accessBody'), canEdit=isConfigAdminEmail(); if(body)body.innerHTML=Object.entries(accessUsers).sort(([a],[b])=>a.localeCompare(b)).map(([email,u])=>{const pages=u.pages||[]; return `<div class="accessCard"><div class="accessTop"><div class="accessName"><label>Nombre<input data-access-name value="${esc(u.name||'')}"></label><label>Correo<input data-access-email value="${esc(email)}"></label><label>Rol<select data-access-role><option value="admin"${u.role==='admin'?' selected':''}>Admin</option><option value="accountant"${u.role!=='admin'?' selected':''}>Contabilidad</option></select></label></div><label class="accessActive"><input type="checkbox" data-access-active ${u.active!==false?'checked':''}> Activo</label></div><div class="accessTools"><button class="mini" data-mark-all type="button">Marcar todos</button><button class="mini" data-clear-pages type="button">Quitar todos</button><button class="mini" data-invert-pages type="button">Invertir</button></div><div class="accessPages">${ACCESS_PAGES.map(p=>pageChip(p,pages,!canEdit)).join('')}</div><span class="accessMeta">${u.role==='admin'?'Puede leer y escribir según reglas.':'Lectura en Flujo; edición solo si reglas/rol lo permiten.'}</span></div>`}).join(''); if($('#rulesBox'))$('#rulesBox').textContent=RULES; $('#btnSaveAccess')?.classList.toggle('hidden',!canEdit); $('#btnAddAccessUser')?.classList.toggle('hidden',!canEdit);}
function hash(s){let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619)} return (h>>>0).toString(36)}
function docIdFor(tx){const ref=norm(tx.ref||tx.idRef||tx.referencia); if(ref) return ref.replace(/[\/#[\]?]/g,'-').slice(0,150); const base=[tx.fecha,tx.tipo,tx.descripcion,tx.monto,tx.metodo,tx.categoria,tx.obs].map(norm).join('|').toLowerCase(); return `tx_${hash(base)}`;}
function extractIdFor(tx){const base=[tx.fecha,tx.tipo,tx.descripcion,tx.monto,tx.metodo,tx.categoria,tx.fileName].map(norm).join('|').toLowerCase(); return `ext_${hash(base)}`;}
function cleanTx(raw){const fecha=norm(raw.fecha||raw.date||raw.Fecha); const tipoRaw=norm(raw.tipo||raw.type||raw.Tipo); let monto=Number(String(raw.monto??raw.amount??raw.valor??raw.Monto??0).replace(/[^0-9.-]/g,''))||0; let tipo=(lower(tipoRaw).startsWith('egr')||lower(tipoRaw).startsWith('out')||monto<0)?'Egreso':'Ingreso'; return {fecha,tipo,descripcion:norm(raw.descripcion||raw['descripción']||raw.description||raw['Descripción']||raw.Descripcion),monto:Math.abs(monto),metodo:norm(raw.metodo||raw['método']||raw.method||raw['Método']||raw.Metodo),categoria:norm(raw.categoria||raw['categoría']||raw.category||raw['Categoría']||raw.Categoria),obs:norm(raw.obs||raw.observacion||raw['observación']||raw.note||raw.Obs||raw['Observación']),factura:norm(raw.factura||raw.invoice||raw.Factura),ref:norm(raw.ref||raw.idRef||raw.referencia||raw.reference||raw['ID Ref'])};}
async function loadData(){const snap=await getDocs(query(collection(db,COLLECTION),orderBy('fecha','desc'))); allTx=snap.docs.map(d=>({id:d.id,...d.data()})); filteredTx=[...allTx]; if(currentRole==='accountant'){imports=[]; extractRows=[]; filteredExtract=[]; expectedExpenses=[]; filteredExpectedExpenses=[]; ripRows=[]; filteredRip=[]; setBounds(); fillFcMonths(); fillTxCats(); fillTxCanales(); renderFlowSummary(); applyTxFilters(true); showView('flujo'); return;} try{const si=await getDocs(query(collection(db,IMPORTS),orderBy('createdAt','desc'))); imports=si.docs.map(d=>({id:d.id,...d.data()}));}catch{imports=[]} try{const se=await getDocs(query(collection(db,EXTRACTS),orderBy('fecha','desc'))); extractRows=se.docs.map(d=>({id:d.id,...d.data()})); filteredExtract=[...extractRows];}catch{extractRows=[]; filteredExtract=[]} try{const sp=await getDocs(query(collection(db,EXPECTED_EXPENSES),orderBy('vencimiento','desc'))); expectedExpenses=sp.docs.map(d=>({id:d.id,...d.data()})); filteredExpectedExpenses=[...expectedExpenses];}catch{expectedExpenses=[]; filteredExpectedExpenses=[]} setBounds(); fillFcMonths(); fillTxCats(); fillTxCanales(); fillExpectedFilters(); renderAll(); renderCalendar(); renderImports();}
function curYear(){return REPORT_YEAR}
function setBounds(){const y=curYear(); const from=`${y}-01-01`, to=`${y}-12-31`; for(const id of ['dashFrom','txFrom','egFrom']) if($('#'+id)&&!$('#'+id).value) $('#'+id).value=from; for(const id of ['dashTo','txTo','egTo']) if($('#'+id)&&!$('#'+id).value) $('#'+id).value=to}
function renderMonthBar(){const y=curYear(), meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; const html=`<button class="yearBtn monthBtn" data-year="${y}">${y}</button>`+meses.map((n,i)=>`<button class="monthBtn" data-m="${i+1}" data-year="${y}">${n}</button>`).join(''); const handler=e=>{const b=e.target.closest('.monthBtn'); if(!b)return; if(b.dataset.m)setMonthFilter(+b.dataset.year,+b.dataset.m); else setYearFilter(+b.dataset.year)}; const mb=$('#monthBar'); if(mb){mb.innerHTML=html; mb.onclick=handler;} const fmb=$('#flujoMonthBar'); if(fmb){fmb.innerHTML=html; fmb.onclick=handler;} const famb=$('#facturacionMonthBar'); if(famb){famb.innerHTML=html; famb.onclick=handler;} const rmb=$('#reconcMonthBar'); if(rmb){rmb.innerHTML=html; rmb.onclick=handler;} highlightMonthBtn(null)}
function setMonthFilter(y,m){const from=`${y}-${String(m).padStart(2,'0')}-01`; const last=new Date(y,m,0).getDate(); const to=`${y}-${String(m).padStart(2,'0')}-${last}`; for(const id of ['dashFrom','txFrom','egFrom']) if($('#'+id))$('#'+id).value=from; for(const id of ['dashTo','txTo','egTo']) if($('#'+id))$('#'+id).value=to; if($('#fcMes'))$('#fcMes').value=`${y}-${String(m).padStart(2,'0')}`; renderAll(); highlightMonthBtn(m)}
function setYearFilter(y){for(const id of ['dashFrom','txFrom','egFrom']) if($('#'+id))$('#'+id).value=`${y}-01-01`; for(const id of ['dashTo','txTo','egTo']) if($('#'+id))$('#'+id).value=`${y}-12-31`; if($('#fcMes'))$('#fcMes').value=''; renderAll(); highlightMonthBtn(null)}
function highlightMonthBtn(m){$$('.monthBtn').forEach(b=>b.classList.toggle('active',b.dataset.m!==undefined&&+b.dataset.m===m)); $$('.yearBtn').forEach(b=>b.classList.toggle('active',m===null))}
function inRange(tx,from,to){return (!from||tx.fecha>=from)&&(!to||tx.fecha<=to)}
function rowsDash(){return allTx.filter(tx=>inRange(tx,$('#dashFrom').value,$('#dashTo').value))}
function rowsFlowPeriod(){const from=$('#txFrom')?.value||$('#dashFrom')?.value||'', to=$('#txTo')?.value||$('#dashTo')?.value||''; return allTx.filter(tx=>inRange(tx,from,to))}
function extDash(){return extractRows.filter(tx=>inRange(tx,$('#dashFrom').value,$('#dashTo').value))}
function ripRange(){const rf=$('#ripFrom'),rt=$('#ripTo'); const from=(rf?.value)||$('#dashFrom')?.value||`${curYear()}-01-01`; const to=(rt?.value)||$('#dashTo')?.value||`${curYear()}-12-31`; return {from,to}}
function ripDash(){const {from,to}=ripRange(); return ripRows.filter(tx=>inRange(tx,from,to))}
function isTransferMusicala(tx){const t=lower([tx.categoria,tx.descripcion,tx.metodo,tx.obs].join(' ')); return t.includes('transferencia musicala')||(/bold.*bancolombia|interbanc.*bold|pago de prov bold|transferencia\s+bold|bold\.co/.test(t));}
function isRealIncome(tx){return tx.tipo==='Ingreso'&&!isTransferMusicala(tx)}
function isB2CIncome(tx){const txt=lower([tx.categoria,tx.descripcion,tx.metodo,tx.source].join(' ')); return isRealIncome(tx)&&(txt.includes('b2c')||txt.includes('clases')||txt.includes('matrícula')||txt.includes('matricula')||txt.includes('mensualidad')||txt.includes('bold')||txt.includes('nequi')||txt.includes('transferencia'))}
function monthKey(f){return String(f||'').slice(0,7)||'Sin fecha'}
function monthLabel(ym){const [y,m]=String(ym).split('-'); const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${meses[(+m||1)-1]} ${y}`}
function renderAll(){renderDashboard(); renderFlowSummary(); applyTxFilters(false); renderExtractAll(); renderRipAll(); renderExpectedExpenses(); bilRender();}
function renderDashboard(){const rows=rowsDash(), ext=extDash(), rip=ripDash(); const inc=rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0), exp=rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0), ripTotal=rip.reduce((a,x)=>a+Number(x.monto||0),0), extIn=ext.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0); $('#kpiIn').textContent=fmtCOP(inc); $('#kpiOut').textContent=fmtCOP(exp); $('#kpiNet').textContent=fmtCOP(inc-exp); $('#kpiDiff').textContent=fmtCOP((inc+extIn)-ripTotal); chartCompareSources(rows,ext,rip); chartMonths(rows); chartTopExpenses(rows); chartExpenseMonthCat(rows); listGroup('#listMethod',groupBy(rows,'metodo',true)); renderBalances(); renderAlerts(rows,ext,rip); renderCompareTable(rows,ext,rip)}
function renderCompareTable(rows,ext,rip){const months=[...new Set([...rows.map(x=>monthKey(x.fecha)),...ext.map(x=>monthKey(x.fecha)),...rip.map(x=>monthKey(x.fecha))].filter(x=>x&&x!=='Sin fecha'))].sort().reverse(); const body=$('#compareMonthBody'); if(!body)return; const totR=rip.reduce((a,x)=>a+x.monto,0), totF=rows.filter(isB2CIncome).reduce((a,x)=>a+x.monto,0), totE=ext.filter(isRealIncome).reduce((a,x)=>a+x.monto,0); body.innerHTML=months.map(m=>{const r=rip.filter(x=>monthKey(x.fecha)===m).reduce((a,x)=>a+x.monto,0); const f=rows.filter(x=>monthKey(x.fecha)===m&&isB2CIncome(x)).reduce((a,x)=>a+x.monto,0); const e=ext.filter(x=>monthKey(x.fecha)===m&&isRealIncome(x)).reduce((a,x)=>a+x.monto,0); const diff=f+e-r; return `<tr><td><b>${monthLabel(m)}</b></td><td class="num">${fmtCOP(r)}</td><td class="num">${fmtCOP(f)}</td><td class="num">${fmtCOP(e)}</td><td class="num ${Math.abs(diff)<5000?'good':diff>=0?'good':'bad'}">${diff>=0?'+':''}${fmtCOP(diff)}</td></tr>`}).join('')+(months.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${fmtCOP(totR)}</td><td class="num">${fmtCOP(totF)}</td><td class="num">${fmtCOP(totE)}</td><td class="num ${Math.abs(totF+totE-totR)<5000?'good':(totF+totE-totR)>=0?'good':'bad'}">${totF+totE-totR>=0?'+':''}${fmtCOP(totF+totE-totR)}</td></tr>`:'<tr><td colspan="5" class="muted">Sin datos en el período</td></tr>')}
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
        const tipo=rows.find(r=>(bilN(r.categoria)||'(Sin categoría)')===cat)?.tipo;
        const color=tipo==='Ingreso'?'var(--ok,#22c55e)':tipo==='Egreso'?'var(--a3,#ef4444)':'var(--muted,#94a3b8)';
        return `<span style="font-size:${size}px;cursor:default" title="${count} movimientos · ${fmtCOP(total)}"><span style="color:${color}">${esc(cat)}</span> <b style="font-size:0.75em;color:var(--muted)">${count}</b></span>`;
      }).join('')
    :'<p class="muted">Sin datos en el período.</p>';
}
function renderFlowSummary(){if(!$('#fcTotalIn'))return; const rows=rowsFlowPeriod(); $('#fcTotalIn').textContent=fmtCOP(rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcTotalOut').textContent=fmtCOP(rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcInternal').textContent=fmtCOP(rows.filter(isTransferMusicala).reduce((a,x)=>a+Number(x.monto||0),0)); $('#fcCount').textContent=fmtNum(rows.length); renderExpensesByCat(rows); renderIncomeByCanalFlujo(rows); renderFcCategoryCloud(rows);}
function renderExpensesByCat(rows){const el=$('#listExpensesByCat'); if(!el)return; const exp=expenseRows(rows); const totalExp=exp.reduce((a,x)=>a+Number(x.monto||0),0)||1; const cats=groupExpensesByCategory(exp).slice(0,15); el.innerHTML=cats.length?cats.map(({name,total:t})=>{const pct=Math.round(t/totalExp*100); return `<div class="listRow" style="flex-direction:column;align-items:stretch;gap:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px">${esc(name)}</span><strong class="bad">${fmtCOP(t)}</strong></div><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--line);border-radius:3px"><div style="width:${pct}%;height:100%;background:var(--a3,#ef4444);border-radius:3px"></div></div><span class="muted" style="font-size:11px;min-width:30px;text-align:right">${pct}%</span></div></div>`;}).join(''):'<p class="muted">Sin egresos en el período.</p>';}
function renderIncomeByCanalFlujo(rows){const el=$('#listIncomeByCanal'); if(!el)return; const inc=rows.filter(isRealIncome); const totalInc=inc.reduce((a,x)=>a+Number(x.monto||0),0)||1; const canals=groupBy(inc,'metodo',true).slice(0,12); el.innerHTML=canals.length?canals.map(({name,total:t})=>{const pct=Math.round(t/totalInc*100); return `<div class="listRow" style="flex-direction:column;align-items:stretch;gap:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px">${esc(name)}</span><strong class="good">${fmtCOP(t)}</strong></div><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--line);border-radius:3px"><div style="width:${pct}%;height:100%;background:var(--ok,#22c55e);border-radius:3px"></div></div><span class="muted" style="font-size:11px;min-width:30px;text-align:right">${pct}%</span></div></div>`;}).join(''):'<p class="muted">Sin ingresos en el período.</p>';}
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
function renderBalances(){const from=`${REPORT_YEAR}-01-01`; const to=$('#dashTo')?.value||`${REPORT_YEAR}-12-31`; const rows=allTx.filter(tx=>tx.fecha>=from&&tx.fecha<=to); const map=new Map(); for(const r of rows){const k=(r.metodo||'(Sin dato)').replace(/s+M$/i,'').trim()||'(Sin dato)'; const sign=isRealIncome(r)?1:(r.tipo==='Egreso'?-1:0); map.set(k,(map.get(k)||0)+sign*Number(r.monto||0))} const getAcc=(...keys)=>{let v=0; for(const [name,total] of map){const ln=lower(name); if(keys.some(k=>ln.includes(k)))v+=total} return v;}; const balances=[{name:'Bancolombia',total:INITIAL_BALANCES.bancolombia+getAcc('bancolombia')},{name:'Davivienda',total:INITIAL_BALANCES.davivienda+getAcc('davivienda')},{name:'Bold CF',total:INITIAL_BALANCES.bold+getAcc('bold')}]; listGroup('#listBalances',balances.sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))); if($('#saldoBancolombia'))$('#saldoBancolombia').textContent=fmtCOP(balances.find(x=>x.name==='Bancolombia')?.total||0); if($('#saldoDavivienda'))$('#saldoDavivienda').textContent=fmtCOP(balances.find(x=>x.name==='Davivienda')?.total||0); if($('#saldoBold'))$('#saldoBold').textContent=fmtCOP(balances.find(x=>x.name==='Bold CF')?.total||0);}
function txFilterState(prefix='tx'){return {from:$('#'+prefix+'From')?.value||'',to:$('#'+prefix+'To')?.value||'',tipo:$('#'+prefix+'Tipo')?.value||'',fact:$('#'+prefix+'Fact')?.value||'',cat:lower($('#'+prefix+'Cat')?.value||''),canal:lower($('#'+prefix+'Canal')?.value||''),q:lower($('#'+prefix+'Q')?.value||''),sinCat:$('#btnSinCat')?.dataset.active==='1'&&prefix==='tx'};}
function effectiveTxInvoice(tx){return norm(tx.factura||tx._ripFevm)}
function syncRipInvoicesToFlow(){const ripById=new Map(ripDocs.map(r=>[r._id,r])); const ripK=buildReconcKeys(ripRows,'metodo'); const fevmByKey=new Map(ripK.map(r=>[r._reconcKey,norm(ripById.get(r.id)?.fevm||ripById.get(r.id)?.FEVM||r.raw?.fevm||r.raw?.FEVM)]).filter(([,fevm])=>fevm)); const fcK=buildReconcKeys(allTx.filter(isB2CIncome),'metodo'); const fevmByFcId=new Map(fcK.map(r=>[r.id,fevmByKey.get(r._reconcKey)||''])); allTx.forEach(tx=>{tx._ripFevm=fevmByFcId.get(tx.id)||''})}
function txMatchesFilters(tx,state,{skipCat=false,skipCanal=false}={}){const factura=effectiveTxInvoice(tx); if(!inRange(tx,state.from,state.to))return false; if(state.tipo==='Cambio de cuenta'&&!isTransferMusicala(tx))return false; if(state.tipo&&state.tipo!=='Cambio de cuenta'&&(tx.tipo!==state.tipo||isTransferMusicala(tx)))return false; if(state.fact==='facturados'&&!factura)return false; if(state.fact==='por-facturar'&&(!isRealIncome(tx)||factura))return false; if(!skipCat&&state.cat&&norm(lower(tx.categoria||''))!==norm(state.cat))return false; if(!skipCanal&&state.canal&&norm(lower(tx.metodo||''))!==norm(state.canal))return false; if(state.sinCat&&norm(tx.categoria))return false; if(state.q&&!lower([tx.fecha,tx.tipo,tx.descripcion,tx.metodo,tx.categoria,tx.obs,factura,tx.ref].join(' ')).includes(state.q))return false; return true}
function refreshTxFilterOptions(prefix='tx'){const state=txFilterState(prefix); const catSel=$('#'+prefix+'Cat'), canalSel=$('#'+prefix+'Canal'); if(catSel){const cur=catSel.value; const cats=[...new Set(allTx.filter(tx=>txMatchesFilters(tx,state,{skipCat:true})).map(x=>norm(x.categoria)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); catSel.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>`<option value="${esc(c)}"${lower(c)===lower(cur)?' selected':''}>${esc(c)}</option>`).join(''); if(cur&&!cats.some(c=>lower(c)===lower(cur)))catSel.value='';} if(canalSel){const cur=canalSel.value; const canals=[...new Set(allTx.filter(tx=>txMatchesFilters(tx,state,{skipCanal:true})).map(x=>norm(x.metodo)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); canalSel.innerHTML='<option value="">Todos los canales</option>'+canals.map(c=>`<option value="${esc(c)}"${lower(c)===lower(cur)?' selected':''}>${esc(c)}</option>`).join(''); if(cur&&!canals.some(c=>lower(c)===lower(cur)))canalSel.value='';}}
function applyTxFilters(render=true){if(!$('#txFrom')||!$('#txTo')||!$('#txTipo')||!$('#txQ'))return; refreshTxFilterOptions('tx'); const state=txFilterState('tx'); filteredTx=allTx.filter(tx=>txMatchesFilters(tx,state)); renderFlowSummary(); if(render)renderTxTable(); else renderTxTable()}
function displayTipo(tx){if(isTransferMusicala(tx))return '<span class="statusDot" style="background:#f1f5f9;color:#475569">⇄ Cambio de cuenta</span>'; return tx.tipo==='Ingreso'?'<span class="statusDot dotOk">↑ Ingreso</span>':'<span class="statusDot dotBad">↓ Egreso</span>';}
function renderTxTable(){ if(!$('#txBody'))return; const readOnly=currentRole==='accountant'; const inc=filteredTx.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0); const exp=filteredTx.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0); if($('#fcFiltIn'))$('#fcFiltIn').textContent=fmtCOP(inc); if($('#fcFiltOut'))$('#fcFiltOut').textContent=fmtCOP(exp); if($('#fcFiltCount'))$('#fcFiltCount').textContent=`${filteredTx.length} registros`; const sinCat=filteredTx.filter(tx=>!norm(tx.categoria)).length; const btnAutoCat=$('#btnAutoCat'); if(btnAutoCat)btnAutoCat.textContent=sinCat?`Auto-categorizar (${sinCat})`:'Auto-categorizar'; if(btnAutoCat)btnAutoCat.disabled=sinCat===0; const categoryChoices=txCategoryChoices(); const fcB2CWithKeys=buildReconcKeys(allTx.filter(isB2CIncome),'metodo'); const fcKeyById=new Map(fcB2CWithKeys.map(r=>[r.id,r._reconcKey])); $('#txBody').innerHTML=filteredTx.map(tx=>{const sug=!norm(tx.categoria)?suggestCategory(tx):''; const sinCatMode=$('#btnSinCat')?.dataset.active==='1'; const catCell=tx.categoria?esc(tx.categoria):(!readOnly&&sinCatMode)?`<select class="catInline" data-id="${esc(tx.id)}"><option value="">— clasificar —</option>${categoryChoices.map(c=>`<option value="${esc(c)}"${sug===c?' selected':''}>${esc(c)}${sug===c?' *':''}</option>`).join('')}</select>`:(sug&&!readOnly?`<span class="catSug" title="Sugerida">${esc(sug)}</span>`:''); const isB2C=isB2CIncome(tx); const rKey=isB2C?fcKeyById.get(tx.id):`${tx.fecha||''}-${Math.round(Number(tx.monto||0))}-${normReconcMedio(tx.metodo||'')}`; const ripOk=isB2C&&_reconcRipSet.has(rKey); const ripSugs=isB2C&&!ripOk&&filteredRip.length&&!readOnly?findRipSuggestions(tx,filteredRip):[]; const ripSugHtml=ripSugs.length?'<div class="ripSugList">'+ripSugs.map(function(s){return '<span class="sugChip">'+esc(s.fecha)+' · '+esc(s.estudiante||'')+' · '+fmtCOP(s.monto)+' · '+esc(s.metodo||'—')+' <em>'+esc(s._reason||'')+'<\/em> <button class="mini" data-edit-rip="'+esc(s.id)+'">Editar<\/button><\/span>';}).join('')+'<\/div>':''; const ripBadge=!readOnly&&isB2C&&_reconcRipSet.size?(ripOk?'<span class="statusDot dotOk" title="Conciliado con RIP">\u2714</span>':'<span class="statusDot dotBad" title="Sin match en RIP">\u2718</span>'):''; const ripKey=!readOnly&&rKey?`<br><code class="reconcKey">${esc(rKey)}</code>`:''; const factura=effectiveTxInvoice(tx); const facturaCell=factura?`${esc(factura)}${!norm(tx.factura)&&tx._ripFevm?' <span class="muted tiny" title="Factura registrada en RIP">(RIP)</span>':''}`:''; return `<tr><td>${esc(tx.fecha)}</td><td>${displayTipo(tx)}</td><td>${esc(tx.descripcion)}</td><td class="num">${fmtCOP(tx.monto)}</td><td>${esc(tx.metodo)}</td><td>${catCell}</td><td>${esc(tx.obs)}</td><td>${facturaCell}</td><td>${ripBadge}${ripKey}${ripSugHtml}</td><td class="actions">${readOnly?'':`<button class="mini" data-edit-fc="${esc(tx.id)}">Editar</button><button class="mini danger" data-del-fc="${esc(tx.id)}">Borrar</button>`}</td></tr>`}).join('')||'<tr><td colspan="10">Sin datos</td></tr>'}
async function autoCategorize(force=false){const sinCat=allTx.filter(tx=>!norm(tx.categoria)); const pool=force?allTx:sinCat; if(!pool.length)return toast('Sin registros para procesar.'); const toUpdate=pool.map(tx=>({...tx,_newCat:suggestCategory(tx)})).filter(tx=>tx._newCat&&(force?tx._newCat!==tx.categoria:true)); if(!toUpdate.length)return toast(force?'Las categorías ya están al día.':'No se encontraron sugerencias para los sin categoría.'); const msg=force?`Se van a RE-CATEGORIZAR ${toUpdate.length} registros (sobreescribe categorías existentes). Â¿Continuar?`:`Se van a categorizar ${toUpdate.length} registros sin categoría. Â¿Continuar?`; if(!confirm(msg))return; let done=0; for(let i=0;i<toUpdate.length;i+=450){const batch=writeBatch(db); for(const tx of toUpdate.slice(i,i+450))batch.update(doc(db,COLLECTION,tx.id),{categoria:tx._newCat,updatedAt:serverTimestamp()}); await batch.commit(); done+=toUpdate.slice(i,i+450).length} toast(`Actualizados ${done} registros \u2705`); await loadData()}
function exportCSV(){const head=['fecha','tipo','descripcion','monto','metodo','categoria','obs','factura','ref']; const lines=[head.join(',')]; for(const r of filteredTx)lines.push(head.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(',')); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'})); a.download=`flujo-caja-${new Date().toISOString().slice(0,10)}.csv`; a.click()}
const CATEGORIES=['','Acueducto','Arrendamiento','Aseo','CCB','ChatGPT','Clases B2B','Clases B2C','Comisiones de email','Comisiones de pago','Comisión Bold','Comisión Nequi','Contabilidad','Cuota de manejo Bancolombia','Cuota de manejo Davivienda','Diseño y publicidad','Docentes Musicala Hogar','Dotación','Enel Codensa','Facebook','Google Ads','Impuesto 4x1000','Impuesto ICA','Impuesto IVA','Impuesto Retefuente','Impuesto Reteica','Instrumentos y equipos','Intereses','Internet Movistar','Keybe','Miplanilla','Musicafé','Nómina','Otros gastos (especifique)','Pago Proveedores','Préstamo socios','Reparaciones y mantenimiento','SG SST','Salarios Docentes prestación','Seguros','Tarjeta de crédito','Transferencia Musicala','Vigilancia'];
const CAT_RULES=[[/TRANSACCI[Ã"O]N\s*BOLD/i,'Clases B2C'],[/RETEICA\s*BOLD/i,'Impuesto Reteica'],[/RETEFUENTE\s*BOLD/i,'Impuesto Retefuente'],[/RETEIVA\s*BOLD/i,'Impuesto IVA'],[/COMISI[Ã"O]N\s*BOLD/i,'Comisión Bold'],[/PAGO\s+DE\s+PROV\s+BOLD|PAGO\s+INTERBANC\s+BOLD/i,'Transferencia Musicala'],[/COMISI[Ã"O]N\s+E-?MAILS?|SERVICIO\s+E-?MAILS?|E-?MAILS?\s+ENVIADOS/i,'Comisiones de email'],[/TRANSFERENCIA\s+CTA\s+SUC\s+VIRTUAL|TRANSFERENCIA\s+DESDE\s+NEQUI/i,'Clases B2C'],[/PAGO\s+A\s+NOMIN|PAGO\s+A\s+NÃ"MIN/i,'Nómina'],[/IMPTO\s+GOBIERNO\s+4X1000|\b4X1000\b|GRAVAMEN|GMF/i,'Impuesto 4x1000'],[/COBRO\s+PAGO\s+PROVEEDORES|COMISION\s+PAGO|SERVICIO\s+PAGO\s+A\s+PROVEEDORES/i,'Comisiones de pago'],[/COMISION\s+POR\s+PAGOS\s+A\s+NEQUI/i,'Comisión Nequi'],[/MIPLANILLA|COMPENSAR/i,'Miplanilla'],[/OPENAI|CHATGPT/i,'ChatGPT'],[/GOOGLE\s+ADS/i,'Google Ads'],[/KEYBE/i,'Keybe'],[/CUOTA\s*MANEJO.*BANCOLOMBIA/i,'Cuota de manejo Bancolombia'],[/COBRO\s*SERVICIO\s*EMPRESARIAL|CUOTA\s*MANEJO.*DAVIVIENDA/i,'Cuota de manejo Davivienda'],[/\bIVA\b|IMPTOS?\s+A\s+LAS\s+VENTAS/i,'Impuesto IVA'],[/RETE\s*ICA|RETEICA|RTE\s*ICA/i,'Impuesto Reteica'],[/RETE\s*FUENTE|RETEFUENTE|RTE\s*FUENTE/i,'Impuesto Retefuente'],[/INTERESES/i,'Intereses'],[/PSE|PAYU|WOMPI|EPAYCO|MERCADOPAGO|COMISI[Ã"O]N/i,'Comisiones de pago']];
function suggestCategory(r){for(const [re,cat] of CAT_RULES){if(cat==='Comisión Bold'&&!/BOLD/i.test(r.metodo))continue; if(cat==='Clases B2C'&&r.tipo==='Egreso')continue; if(re.test(r.descripcion||''))return cat} if(/BOLD/i.test(r.metodo)&&r.tipo==='Ingreso')return 'Clases B2C'; if(r.tipo==='Ingreso'&&Number(r.monto||0)>5000&&!isTransferMusicala(r))return 'Clases B2C'; return ''}
function parseMoneyAny(v){if(typeof v==='number')return v; let s=String(v??'').replace(/\$/g,'').replace(/\s+/g,''); if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.'); else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,''); else if(s.includes(','))s=s.replace(',','.'); const n=Number(s.replace(/[^0-9.+-]/g,'')); return Number.isFinite(n)?n:NaN}
function toISODateFromDMY(d){const m=String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''}
function toISODateFromYYYYMMDD(s){const m=String(s??'').trim().match(/^(\d{4})(\d{2})(\d{2})$/); return m?`${m[1]}-${m[2]}-${m[3]}`:''}
function detectDelimiter(text){const line=(text||'').split(/\r?\n/).find(l=>l.trim()); if(!line)return ','; const c=(line.match(/,/g)||[]).length,se=(line.match(/;/g)||[]).length,t=(line.match(/\t/g)||[]).length; return t>c&&t>se?'\t':se>c?';':','}
function parseDelimited(text,delim){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(q&&next==='"'){cur+='"';i++}else q=!q;continue} if(!q&&ch===delim){row.push(cur);cur='';continue} if(!q&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&next==='\n')i++; row.push(cur); rows.push(row); row=[]; cur=''; continue} cur+=ch} if(cur.length||row.length){row.push(cur);rows.push(row)} return rows}
async function readXlsxTo2d(f,{raw=false}={}){if(!window.XLSX)throw new Error('No cargó SheetJS. Espera un segundo y recarga.'); const buf=await f.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw,defval:''}); while(rows.length&&rows[0].every(v=>String(v??'').trim()===''))rows.shift(); return rows}
function detectSource(file,rows=[]){const n=plain(file?.name||''); if(n.includes('davivienda'))return 'davivienda'; if(n.includes('bold')||n.includes('reporte_mensual'))return 'bold'; if(n.includes('nequi'))return 'nequi'; if(n.includes('bancolombia'))return 'bancolombia'; const flat=rows.slice(0,8).flat().map(v=>plain(v)); if(flat.includes('transaccion')&&flat.includes('valor total'))return 'davivienda'; if(flat.includes('estado actual')||flat.includes('id transaccion'))return 'bold'; if(flat.includes('fecha')&&flat.includes('identificador')&&flat.includes('descripcion')&&flat.includes('valor')&&flat.includes('saldo'))return 'bold'; if(n.endsWith('.csv'))return 'bancolombia'; return 'auto'}
function convertBancolombia(rows){let tx=[]; if(!rows.length)return tx; const looks=s=>/^\d{8}$/.test(String(s||'').trim()); let idxFecha=0,idxCuenta=1,idxDesc=6,idxMonto=8; const first=rows[0].map(v=>String(v??'').trim()); if(looks(first[3])){idxCuenta=0;idxFecha=3;idxMonto=5;idxDesc=7}else if(!looks(first[0])){const h=first.map(x=>x.toLowerCase()); const find=(arr,fb)=>{const i=h.findIndex(x=>arr.some(n=>x.includes(n))); return i>=0?i:fb}; idxFecha=find(['fecha'],idxFecha); idxCuenta=find(['cuenta'],idxCuenta); idxDesc=find(['descripcion','descripción','concepto','detalle','motivo'],idxDesc); idxMonto=find(['valor','monto','importe'],idxMonto); rows=rows.slice(1)} for(const r of rows){const fecha=toISODateFromYYYYMMDD(norm(r[idxFecha])); const monto=parseMoneyAny(r[idxMonto]); const desc=norm(r[idxDesc]); const cuenta=norm(r[idxCuenta]); if(!fecha||!Number.isFinite(monto)||/^SALDO\b/i.test(desc))continue; tx.push({fecha,tipo:monto>=0?'Ingreso':'Egreso',descripcion:desc||'(Sin descripción)',monto:Math.abs(Math.round(monto*100)/100),metodo:'Bancolombia',categoria:'',obs:cuenta?`Cuenta ${cuenta}`:'',factura:'',ref:''})} return tx}
function convertDavivienda(rows){const header=rows[0].map(plain); const find=names=>header.findIndex(h=>names.some(n=>h===n||h.includes(n))); const idxFecha=find(['fecha de movimiento','fecha']), idxTran=find(['transaccion']), idxMotivo=find(['descripcion motivo','descripcion','motivo']), idxValor=find(['valor total','valor']); if(idxFecha<0||idxTran<0||idxValor<0)throw new Error('Davivienda: faltan columnas mínimas.'); const tx=[]; for(const r of rows.slice(1)){const fecha=toISODateFromDMY(r[idxFecha])||String(r[idxFecha]).slice(0,10); const valor=parseMoneyAny(r[idxValor]); if(!fecha||!Number.isFinite(valor))continue; const tran=norm(r[idxTran]), motivo=idxMotivo>=0?norm(r[idxMotivo]):''; const tipo=/nota\s*cr[eé]dito/i.test(tran)?'Ingreso':(/nota\s*d[eé]bito/i.test(tran)?'Egreso':(valor>=0?'Ingreso':'Egreso')); tx.push({fecha,tipo,descripcion:motivo||tran||'(Sin descripción)',monto:Math.abs(Math.round(valor*100)/100),metodo:'Davivienda',categoria:'',obs:motivo&&tran?`Transacción: ${tran}`:'',factura:'',ref:''})} return tx}
function findBoldHeader(rows){const want=['ID TRANSACCION','FECHA','ESTADO ACTUAL']; for(let i=0;i<Math.min(rows.length,50);i++){const row=rows[i].map(v=>String(v??'').trim().toUpperCase()); if(want.every(w=>row.includes(w)))return i} return -1}
function isBoldAccountExtract(rows){const h=(rows[0]||[]).map(plain); return ['fecha','identificador','descripcion','valor','saldo'].every(x=>h.includes(x))}
function convertBoldAccountExtract(rows){const headers=rows[0].map(plain), col=n=>headers.indexOf(n); const iFecha=col('fecha'),iId=col('identificador'),iDesc=col('descripcion'),iValor=col('valor'),iSaldo=col('saldo'); if(iFecha<0||iDesc<0||iValor<0)throw new Error('Bold CF: faltan columnas mínimas.'); const tx=[]; for(const r of rows.slice(1)){if(!r||r.every(v=>String(v??'').trim()===''))continue; const fecha=toISODateFromDMY(r[iFecha])||String(r[iFecha]).slice(0,10), valor=parseMoneyAny(r[iValor]); if(!fecha||!Number.isFinite(valor))continue; const desc=norm(r[iDesc])||'Movimiento Bold CF', id=iId>=0?norm(r[iId]):'', saldo=iSaldo>=0?parseMoneyAny(r[iSaldo]):NaN; const isBoldTransfer=/\bbold\b|bold\.co/i.test(desc); tx.push({fecha,tipo:valor>=0?'Ingreso':'Egreso',descripcion:desc,monto:Math.abs(Math.round(valor*100)/100),metodo:'Bold CF',categoria:isBoldTransfer?'Transferencia Musicala':'',obs:[id?`ID: ${id}`:'',Number.isFinite(saldo)?`Saldo: ${fmtCOP(saldo)}`:''].filter(Boolean).join(' · '),factura:'',ref:id?`boldcf-${id}`:''})} return tx}
function convertBold(rows,opts){if(isBoldAccountExtract(rows))return convertBoldAccountExtract(rows); const hr=findBoldHeader(rows); if(hr<0)throw new Error('Bold: no detecté encabezados.'); const headers=rows[hr].map(h=>norm(h).toUpperCase()), data=rows.slice(hr+1), col=n=>headers.indexOf(n.toUpperCase()); const iId=col('ID TRANSACCION'),iFecha=col('FECHA'),iEstado=col('ESTADO ACTUAL'),iDesc=col('DESCRIPCIÃ"N'),iValorCompra=col('VALOR DE LA COMPRA'),iValorTotal=col('VALOR TOTAL'),iDeposito=col('DEPOSITO EN CUENTA BOLD'),iRfuente=col('VALOR RETE FUENTE'),iRiva=col('VALOR RETE IVA'),iRica=col('VALOR RETE ICA'),iDed=col('TOTAL DEDUCCIÃ"N'); const tx=[]; for(const r of data){if(!r||r.every(v=>String(v??'').trim()===''))continue; const estado=iEstado>=0?norm(r[iEstado]):''; if(opts.onlyOk&&estado&&estado.toUpperCase()!=='COBRO EXITOSO')continue; const fecha=String(r[iFecha]).slice(0,10), desc=norm(r[iDesc]), id=iId>=0?norm(r[iId]):''; let principal=iValorCompra>=0?parseMoneyAny(r[iValorCompra]):(opts.mode==='deposito'&&iDeposito>=0?parseMoneyAny(r[iDeposito]):parseMoneyAny(r[iValorTotal])); if(!fecha||!Number.isFinite(principal))continue; tx.push({fecha,tipo:principal>=0?'Ingreso':'Egreso',descripcion:desc||'(Pago Bold)',monto:Math.abs(Math.round(principal*100)/100),metodo:'Bold',categoria:'Clases B2C',obs:[id?`ID: ${id}`:'',estado?`Estado: ${estado}`:''].filter(Boolean).join(' · '),factura:'',ref:id}); if(opts.splitFees){const safe=n=>Number.isFinite(n)?n:0, rf=iRfuente>=0?safe(parseMoneyAny(r[iRfuente])):0, ri=iRiva>=0?safe(parseMoneyAny(r[iRiva])):0, rc=iRica>=0?safe(parseMoneyAny(r[iRica])):0, ded=iDed>=0?safe(parseMoneyAny(r[iDed])):0; const fee=(label,amount,cat)=>{if(!amount||Math.abs(amount)<.000001)return; tx.push({fecha,tipo:'Egreso',descripcion:`${label} Bold`,monto:Math.abs(Math.round(amount*100)/100),metodo:'Bold',categoria:cat,obs:id?`ID: ${id}`:'',factura:'',ref:id?`${id}-${label}`:''})}; fee('Retefuente',rf,'Impuesto Retefuente'); fee('ReteIVA',ri,'Impuesto IVA'); fee('ReteICA',rc,'Impuesto Reteica'); fee('Comisión',ded-(Math.abs(rf)+Math.abs(ri)+Math.abs(rc)),'Comisión Bold')}} return tx}
function findHeaderGeneric(rows,must){for(let i=0;i<Math.min(rows.length,40);i++){const row=rows[i].map(v=>String(v??'').trim().toLowerCase()); if(must.every(w=>row.some(c=>c.includes(w))))return i} return -1}
function convertNequi(rows,opts){const hr=findHeaderGeneric(rows,['fecha','valor']), start=hr>=0?hr:0, headers=rows[start].map(h=>norm(h).toLowerCase()), data=rows.slice(start+1); const find=arr=>headers.findIndex(h=>arr.some(s=>h.includes(s))); const iFecha=find(['fecha']), iValor=find(['valor','monto','importe','total']), iDesc=find(['descrip','concept','detalle','motivo','referencia','transac']), iRica=find(['reteica','rete ica','rte ica']), iRfu=find(['retefuente','rete fuente','rte fuente','rtefuente']), iCom=find(['comision','comisión','fee','tarifa']); if(iFecha<0||iValor<0)throw new Error('Nequi: no detecté columnas mínimas.'); const tx=[]; for(const r of data){const fecha=toISODateFromDMY(r[iFecha])||String(r[iFecha]).slice(0,10), valor=parseMoneyAny(r[iValor]); if(!fecha||!Number.isFinite(valor))continue; const desc=iDesc>=0?norm(r[iDesc]):'Movimiento Nequi'; tx.push({fecha,tipo:valor>=0?'Ingreso':'Egreso',descripcion:desc||'Movimiento Nequi',monto:Math.abs(Math.round(valor*100)/100),metodo:'Nequi',categoria:'',obs:'',factura:'',ref:''}); if(opts.splitFees){const fee=(label,amount,cat)=>{if(!amount||Math.abs(amount)<.000001)return; tx.push({fecha,tipo:'Egreso',descripcion:`${label} Nequi`,monto:Math.abs(Math.round(amount*100)/100),metodo:'Nequi',categoria:cat,obs:'',factura:'',ref:''})}; fee('ReteICA',iRica>=0?parseMoneyAny(r[iRica]):0,'Impuesto Reteica'); fee('Retefuente',iRfu>=0?parseMoneyAny(r[iRfu]):0,'Impuesto Retefuente'); fee('Comisión',iCom>=0?parseMoneyAny(r[iCom]):0,'Comisión Nequi')}} return tx}
async function processBankFile(file){bankTx=[]; bankMeta={saldoInicial:null,saldoFinal:null,banco:'',desde:'',hasta:'',esProcesadorPago:false}; $('#bankLog').textContent='Procesando...'; if(!file)return; try{const ext=(file.name.split('.').pop()||'').toLowerCase(); let rows=[]; const selected=$('#bankSource').value; if(ext==='csv'){const txt=await file.text(); rows=parseDelimited(txt,detectDelimiter(txt)).map(r=>r.map(c=>norm(c))); bankSource=selected==='auto'?detectSource(file,rows):selected}else if(ext==='xlsx'){const preview=await readXlsxTo2d(file,{raw:false}); bankSource=selected==='auto'?detectSource(file,preview):selected; rows=bankSource==='bold'?await readXlsxTo2d(file,{raw:true}):preview}else throw new Error('Formato no soportado. Usa .csv o .xlsx'); let tx=[]; if(bankSource==='bancolombia')tx=convertBancolombia(rows); else if(bankSource==='davivienda'){const idx=rows.findIndex(r=>r.map(plain).includes('fecha de movimiento')); tx=convertDavivienda(idx>0?rows.slice(idx):rows); bankMeta=extractDaviviendaSaldos(rows)} else if(bankSource==='bold'){tx=convertBold(rows,{mode:$('#boldMode').value,onlyOk:$('#boldOnlyOk').checked,splitFees:$('#splitFees').checked}); bankMeta=extractBoldSaldos(rows,/bold\s*cf|extracto de cuenta bold/i.test(file.name))} else if(bankSource==='nequi')tx=convertNequi(rows,{splitFees:$('#splitFees').checked}); else throw new Error('No pude determinar fuente. Elige el banco manualmente.'); tx.forEach(r=>{if(!r.categoria)r.categoria=suggestCategory(r); r.source=bankSource; r.fileName=file.name}); bankTx=tx.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); renderBankPreview(); $('#bankLog').textContent=`Convertidas ${bankTx.length} transacciones desde ${file.name}`;}catch(e){console.error(e); $('#bankLog').textContent=`ERROR: ${e.message||e}`; renderBankPreview()}}
function catSelect(i,val){return `<select class="catSel" data-idx="${i}">${CATEGORIES.map(c=>`<option value="${esc(c)}"${c===val?' selected':''}>${c||'—'}</option>`).join('')}</select>`}
function renderBankPreview(){const existing=new Set(allTx.map(docIdFor)), seen=new Set(); let ready=0,dup=0,bad=0; const rows=bankTx.map((r,i)=>{const id=docIdFor(r), alreadyExists=existing.has(id), repeatedInFile=seen.has(id), duplicate=alreadyExists||repeatedInFile, incomplete=!(r.fecha&&r.descripcion&&r.monto); seen.add(id); if(duplicate)dup++; else if(incomplete)bad++; else ready++; const status=alreadyExists?'Ya existe':repeatedInFile?'Repetida en archivo':incomplete?'Incompleta':'Lista'; const note=alreadyExists?'Esta transacción ya está en Flujo de Caja y no se volverá a subir.':repeatedInFile?'Esta transacción está repetida en el archivo y solo se subirá una vez.':r.obs; return `<tr class="${duplicate?'isDup':incomplete?'isBad':'isOk'}"><td><strong>${status}</strong></td><td>${esc(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td class="num">${fmtCOP(r.monto)}</td><td>${esc(r.metodo)}</td><td>${catSelect(i,r.categoria)}</td><td>${esc(note)}</td></tr>`}).join(''); $('#bankBody').innerHTML=rows||'<tr><td colspan="8" class="muted">Carga un archivo para revisar transacciones.</td></tr>'; $('#readyCount').textContent=ready; $('#dupCount').textContent=dup; $('#badCount').textContent=bad; $('#bankSourcePill').textContent=bankSource; $('#btnUploadBank').disabled=ready===0; $('#btnBankCsv').disabled=bankTx.length===0; renderSaldoCheck(bankTx,bankMeta,'#saldoCheckBank');}
async function commitRows(rows,{source='Manual',fileName='',target='flow',saldoMeta=null,onProgress=null}={}){
  if(!rows.length)return toast('No hay filas válidas.');
  const coll=target==='extract'?EXTRACTS:COLLECTION;
  const existing=new Set((target==='extract'?extractRows:allTx).map(target==='extract'?extractIdFor:docIdFor));
  const clean=rows.map(cleanTx);
  const idFor=target==='extract'?extractIdFor:docIdFor;
  const valid=clean.filter(r=>r.fecha&&r.descripcion&&r.monto&&!existing.has(idFor(r)));
  if(!valid.length)return toast('Todo era duplicado o inválido. Drama evitado.');
  const batchId=`import_${Date.now()}_${hash(fileName+source+target)}`;
  let done=0;
  onProgress?.({stage:'start',done,total:valid.length,coll});
  try{
    for(let i=0;i<valid.length;i+=450){
      const batch=writeBatch(db);
      for(const tx of valid.slice(i,i+450)){
        const id=idFor(tx);
        batch.set(doc(db,coll,id),{...tx,source,fileName,importBatchId:batchId,importedBy:auth.currentUser?.email||'',importedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
      }
      await batch.commit();
      done+=valid.slice(i,i+450).length;
      onProgress?.({stage:'batch',done,total:valid.length,coll});
    }
  }catch(e){
    console.error(`Error guardando en ${coll}`,e);
    toast(`Firebase bloqueó ${coll}. Revisa reglas/permisos.`);
    throw e;
  }
  const saldoData=saldoMeta&&(saldoMeta.saldoInicial!=null||saldoMeta.saldoFinal!=null)?{saldoInicial:saldoMeta.saldoInicial,saldoFinal:saldoMeta.saldoFinal,totalIngresos:saldoMeta.ingresos??null,totalEgresos:saldoMeta.egresos??null,totalMovimientos:saldoMeta.movimientos??rows.length,saldoCuenta:saldoMeta.cuenta||'',saldoBanco:saldoMeta.banco||'',saldoDesde:saldoMeta.desde||'',saldoHasta:saldoMeta.hasta||''}:{};
  try{
    onProgress?.({stage:'history',done,total:valid.length,coll:IMPORTS});
    await setDoc(doc(db,IMPORTS,batchId),{source,fileName,target,totalInput:rows.length,inserted:done,duplicates:rows.length-done,...saldoData,importedBy:auth.currentUser?.email||'',createdAt:serverTimestamp()},{merge:true});
  }catch(e){
    console.warn(`No pude guardar historial en ${IMPORTS}`,e);
    toast(`Subidos ${done} registros. El historial quedó bloqueado por reglas.`);
    await loadData();
    onProgress?.({stage:'done',done,total:valid.length,coll});
    return;
  }
  toast(`Subidos ${done} registros ✅`);
  await loadData();
  onProgress?.({stage:'done',done,total:valid.length,coll});
  return {inserted:done,totalInput:rows.length,duplicates:rows.length-done};
}
async function uploadBank(){const btn=$('#btnUploadBank'), oldText=btn.textContent; const existing=new Set(allTx.map(docIdFor)), seen=new Set(); const valid=bankTx.filter(r=>{const id=docIdFor(r), ok=r.fecha&&r.descripcion&&r.monto&&!existing.has(id)&&!seen.has(id); seen.add(id); return ok;}); if(!valid.length){$('#bankLog').textContent='No hay transacciones nuevas para subir. Las filas marcadas como “Ya existe” no se suben.'; renderBankPreview(); return;} btn.disabled=true; btn.textContent='Subiendo...'; $('#bankLog').textContent=`Subiendo 0/${valid.length} transacciones a Flujo de Caja...`; try{const result=await commitRows(valid,{source:bankSource,fileName:$('#bankFile').files[0]?.name||'',target:'flow',saldoMeta:bankMeta,onProgress:({stage,done,total})=>{if(stage==='history')$('#bankLog').textContent=`Transacciones guardadas (${done}/${total}). Registrando historial de importación...`; else if(stage==='done')$('#bankLog').textContent=`Subida completa: ${done}/${total} transacciones guardadas en Flujo de Caja.`; else $('#bankLog').textContent=`Subiendo ${done}/${total} transacciones a Flujo de Caja...`;}}); renderBankPreview(); if(result)$('#bankLog').textContent=`Subida completa: ${result.inserted} nuevas. ${result.duplicates} ya existían o no se subieron.`;}catch(e){console.error(e); $('#bankLog').textContent=`ERROR subiendo a Flujo: ${e.message||e}`;}finally{btn.textContent=oldText; renderBankPreview();}}
function bankCsv(){const head=['fecha','tipo','descripcion','monto','metodo','categoria','obs','factura','ref']; const lines=[head.join(',')]; for(const r of bankTx)lines.push(head.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(',')); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'})); a.download=`bancos-convertido-${new Date().toISOString().slice(0,10)}.csv`; a.click()}

async function loadRipLegacy(){try{const coll=$('#ripCollection').value||'clientesB2C'; const snap=await getDocs(collection(ripDb,coll)); ripDocs=snap.docs.map(d=>({_id:d.id,...d.data()})); ripRows=snap.docs.flatMap(d=>{const data=d.data(); const fecha=norm(data.fecha||data.fechaClase||data.fechaPago||data.date||data.Fecha); const metodo=norm(data.medioPago||data.metodo||data.formaPago||data.canal||''); const usuarios=Array.isArray(data.usuarios)?data.usuarios:[]; if(d.id===snap.docs[0]?.id)console.log('RIP primer doc usuarios:',JSON.stringify(data.usuarios),'\nArray.isArray:',Array.isArray(data.usuarios)); if(usuarios.length){const valid=usuarios.map(u=>{const nombre=norm(u.estudiante||u.nombre||u.alumno||u.cliente||u.student||''); const precio=Number(u.precio||u.valor||u.costo||u.monto||u.pago||u.total||0); const svc=ripSvcAbr(norm(u.servicio||u.modalidad||u.plan||u.paquete||u.tipo||u.producto||u.clase||'')); return {nombre,precio,svc}}).filter(u=>u.precio>=1000&&u.nombre); if(valid.length){const total=valid.reduce((a,u)=>a+u.precio,0); const svcs=[...new Set(valid.map(u=>u.svc).filter(Boolean))].join(', ')||'Sin clasificar'; return [{id:d.id,fecha,estudiante:valid[0].nombre,servicio:svcs,metodo,monto:total,raw:data}];}} const monto=Math.abs(parseMoneyAny(data.descuento||data.total||data.valor||data.precio||data.pago||0)); if(monto>=1000)return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||''),servicio:norm(data.servicio||data.plan||data.modalidad||'')||'Sin clasificar',metodo,monto,raw:data}]; return [];}).filter(x=>x.fecha&&x.monto); filteredRip=[...ripRows]; renderRipAll(); renderDashboard(); toast(`RIP cargado: ${ripRows.length} registros`)}catch(e){console.error(e); toast('No pude cargar RIP. Revisa colección/reglas/login.') }}
async function loadRip(){try{const coll=$('#ripCollection').value||'clientesB2C'; const snap=await getDocs(collection(ripDb,coll)); ripDocs=snap.docs.map(d=>({_id:d.id,...d.data()})); ripRows=snap.docs.flatMap(d=>{const data=d.data(); const fecha=norm(data.fecha||data.fechaClase||data.fechaPago||data.date||data.Fecha); const metodo=norm(data.medioPago||data.metodo||data.formaPago||data.canal||''); const usuarios=Array.isArray(data.usuarios)?data.usuarios:[]; if(usuarios.length){const valid=usuarios.map(u=>{const nombre=norm(u.estudiante||u.nombre||u.alumno||u.cliente||u.student||''); const precio=Number(u.precio||u.valor||u.costo||u.monto||u.pago||u.total||0); const svc=ripSvcAbr(norm(u.servicio||u.modalidad||u.plan||u.paquete||u.tipo||u.producto||u.clase||'')); return {nombre,precio,svc}}).filter(u=>u.precio>=1000&&u.nombre); if(valid.length){const total=valid.reduce((a,u)=>a+u.precio,0); const svcs=[...new Set(valid.map(u=>u.svc).filter(Boolean))].join(', ')||'Sin clasificar'; const montoEdit=Math.abs(parseMoneyAny(data.monto||0)); return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||'')||valid[0].nombre,servicio:norm(data.servicio||data.plan||data.modalidad||'')||svcs,metodo,monto:montoEdit>=1000?montoEdit:total,raw:data}];}} const monto=Math.abs(parseMoneyAny(data.monto||data.descuento||data.total||data.valor||data.precio||data.pago||0)); if(monto>=1000)return [{id:d.id,fecha,estudiante:norm(data.estudiante||data.alumno||data.nombre||''),servicio:norm(data.servicio||data.plan||data.modalidad||'')||'Sin clasificar',metodo,monto,raw:data}]; return [];}).filter(x=>x.fecha&&x.monto); filteredRip=[...ripRows]; syncRipInvoicesToFlow(); renderRipAll(); applyTxFilters(true); renderDashboard(); toast(`RIP cargado: ${ripRows.length} registros`)}catch(e){console.error(e); toast('No pude cargar RIP. Revisa colección/reglas/login.') }}
function renderRipAll(){const base=ripDash(); const serv=$('#ripServFilter')?.value||''; const met=$('#ripMetFilter')?.value||''; const q=lower($('#ripQ')?.value||''); const rows=base.filter(r=>(!serv||r.servicio===serv)&&(!met||r.metodo===met)&&(!q||lower([r.fecha,r.estudiante,r.servicio,r.metodo,String(r.monto)].join(' ')).includes(q))); const total=rows.reduce((a,x)=>a+x.monto,0); $('#ripKpiTotal').textContent=fmtCOP(total); $('#ripKpiCount').textContent=fmtNum(rows.length); $('#ripKpiServicios').textContent=fmtNum(new Set(rows.map(x=>x.servicio).filter(Boolean)).size); $('#ripKpiMetodos').textContent=fmtNum(new Set(rows.map(x=>x.metodo).filter(Boolean)).size); const allServs=[...new Set(ripRows.map(x=>x.servicio).filter(Boolean))].sort(); const allMets=[...new Set(ripRows.map(x=>x.metodo).filter(Boolean))].sort(); const selS=$('#ripServFilter'); if(selS){const cur=selS.value; selS.innerHTML='<option value="">Todos los servicios</option>'+allServs.map(s=>`<option value="${esc(s)}"${s===cur?' selected':''}>${esc(s)}</option>`).join('')} const selM=$('#ripMetFilter'); if(selM){const cur=selM.value; selM.innerHTML='<option value="">Todos los medios</option>'+allMets.map(m=>`<option value="${esc(m)}"${m===cur?' selected':''}>${esc(m)}</option>`).join('')} renderRipCharts(rows); renderRipTables(rows,total); filteredRip=rows; renderRipTable(); renderReconciliation(rows,allTx);}
function renderRipCharts(rows){const serv=groupRip(rows,'servicio').slice(0,12), met=groupRip(rows,'metodo').slice(0,10); chRipService?.destroy(); if($('#chartRipService'))chRipService=new Chart($('#chartRipService'),{type:'bar',data:{labels:serv.map(x=>x.name),datasets:[{label:'Total',data:serv.map(x=>x.total),backgroundColor:'rgba(12,65,196,0.75)'}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>fmtCOP(v)}}}}}); chRipMethod?.destroy(); if($('#chartRipMethod'))chRipMethod=new Chart($('#chartRipMethod'),{type:'doughnut',data:{labels:met.map(x=>x.name),datasets:[{data:met.map(x=>x.total)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}}); const mMap=new Map(); for(const r of rows){const ym=monthKey(r.fecha); mMap.set(ym,(mMap.get(ym)||0)+r.monto)} const labels=[...mMap.keys()].sort(); chRipMonth?.destroy(); if($('#chartRipMonth'))chRipMonth=new Chart($('#chartRipMonth'),{type:'bar',data:{labels:labels.map(monthLabel),datasets:[{label:'Ingresos RIP B2C',data:labels.map(l=>mMap.get(l)),backgroundColor:'rgba(104,13,191,0.7)'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function renderRipTables(rows,total){const sb=$('#ripServTable'); if(sb)sb.innerHTML=groupRip(rows,'servicio').map(({name,total:t})=>{const cnt=rows.filter(r=>r.servicio===name).length; return `<tr><td>${esc(name)}</td><td class="num">${cnt}</td><td class="num">${fmtCOP(t)}</td><td class="num muted">${total?Math.round(t/total*100)+'%':'—'}</td></tr>`}).join('')+(rows.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${rows.length}</td><td class="num">${fmtCOP(total)}</td><td class="num">100%</td></tr>`:''); const mb=$('#ripMetTable'); if(mb)mb.innerHTML=groupRip(rows,'metodo').map(({name,total:t})=>{const cnt=rows.filter(r=>r.metodo===name).length; return `<tr><td>${esc(name)}</td><td class="num">${cnt}</td><td class="num">${fmtCOP(t)}</td><td class="num muted">${total?Math.round(t/total*100)+'%':'—'}</td></tr>`}).join('')+(rows.length?`<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td><td class="num">${rows.length}</td><td class="num">${fmtCOP(total)}</td><td class="num">100%</td></tr>`:'')}
function groupRip(rows,field){const m=new Map(); for(const r of rows){const k=r[field]||'(Sin dato)'; m.set(k,(m.get(k)||0)+Number(r.monto||0))} return [...m.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)}
function filterRip(){renderRipAll()}
function ripSvcAbr(s){if(!s)return 'Sin clasificar'; const v=norm(s); if(/musifamiliar/i.test(v))return 'MF'; if(/ensamble/i.test(v))return 'Ensamble'; if(/matr[ií]cula/i.test(v))return 'Pago'; if(/virtual.{0,25}personalizado|personalizado.{0,25}virtual/i.test(v))return 'MV P'; if(/hogar.{0,25}personalizado|personalizado.{0,25}hogar/i.test(v))return 'MH P'; if(/sede.{0,25}personalizado|personalizado.{0,25}sede/i.test(v))return 'MS P'; if(/sede.{0,25}grupal|grupal.{0,25}sede/i.test(v))return 'MS G'; return v||'Sin clasificar';}
function fillFcMonths(){const sel=$('#fcMes'); if(!sel)return; const months=[...new Set(allTx.map(tx=>monthKey(tx.fecha)).filter(Boolean))].sort().reverse(); sel.innerHTML='<option value="">Todos los meses</option>'+months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');}
function setFcMonth(ym){if(!ym){$('#txFrom').value='';$('#txTo').value='';applyTxFilters(true);return;} const[y,m]=ym.split('-'); const last=new Date(+y,+m,0).getDate(); $('#txFrom').value=`${ym}-01`; $('#txTo').value=`${ym}-${String(last).padStart(2,'0')}`; applyTxFilters(true);}
function txCategoryChoices(){return [...new Set(allTx.map(x=>norm(x.categoria)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))}
function fillTxCats(){refreshTxFilterOptions('tx'); refreshTxFilterOptions('acc');}
function fillTxCanales(){refreshTxFilterOptions('tx'); refreshTxFilterOptions('acc');}

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
      <article><span>Total RIP período</span><strong>${fmtNum(ripK.length)}</strong><small>${fmtCOP(total)}</small></article>
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

function renderRipTable(){const rows=filteredRip.slice(0,500); const withKeys=buildReconcKeys(rows,'metodo'); const isAutoReconciled = c => { const val = String(c || '').toLowerCase().trim(); return val === 'fesicol' || val === 'efectivo'; }; $('#ripBody').innerHTML=withKeys.map(r=>{const ok=(_reconcFcSet.size&&_reconcFcSet.has(r._reconcKey)) || isAutoReconciled(r.metodo); const badge=_reconcFcSet.size?`<span class="statusDot ${ok?'dotOk':'dotBad'}">${ok?'\u2714':'\u2718'}</span>`:''; const keyHint=r._reconcKey?`<br><code class="reconcKey" title="Llave de conciliación">${esc(r._reconcKey)}</code>`:''; return `<tr><td>${badge}${keyHint}</td><td>${esc(r.fecha)}</td><td>${esc(r.estudiante)}</td><td>${esc(r.servicio)}</td><td>${esc(r.metodo)}</td><td class="num">${fmtCOP(r.monto)}</td><td><button class="mini" data-edit-rip="${esc(r.id)}">Editar</button></td></tr>`}).join('')||'<tr><td colspan="7" class="muted">Sin datos RIP.</td></tr>'}

function filterExtract(render=true){const q=lower($('#extQ')?.value||''); filteredExtract=extractRows.filter(r=>!q||lower([r.fecha,r.tipo,r.descripcion,r.metodo,r.categoria,r.monto].join(' ')).includes(q)); if(render)renderExtractTable(); else renderExtractTable()}
function renderExtractAll(){const rows=extDash().length?extDash():extractRows; $('#extTotalIn').textContent=fmtCOP(rows.filter(isRealIncome).reduce((a,x)=>a+Number(x.monto||0),0)); $('#extTotalOut').textContent=fmtCOP(rows.filter(x=>x.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0)); $('#extCount').textContent=fmtNum(rows.length); $('#extMatches').textContent=fmtNum(countRipMatches(rows)); chartExtract(rows); renderWordCloud(rows); filterExtract(false)}
function countRipMatches(ext){let c=0; for(const e of ext){if(ripRows.some(r=>r.fecha===e.fecha&&Math.abs(Number(r.monto||0)-Number(e.monto||0))<5000))c++} return c}
function chartExtract(rows){const m=new Map(); for(const r of rows){const ym=monthKey(r.fecha); if(!m.has(ym))m.set(ym,{in:0,out:0}); if(r.tipo==='Ingreso')m.get(ym).in+=Number(r.monto||0); else m.get(ym).out+=Number(r.monto||0)} const labels=[...m.keys()].sort(); chExtractMonth?.destroy(); if($('#chartExtractMonth'))chExtractMonth=new Chart($('#chartExtractMonth'),{type:'bar',data:{labels:labels.map(monthLabel),datasets:[{label:'Ingresos',data:labels.map(x=>m.get(x).in)},{label:'Egresos',data:labels.map(x=>m.get(x).out)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmtCOP(v)}}}}})}
function renderWordCloud(rows){const stop=new Set('de la el los las un una y en para por con del a al pago compra transferencia transaccion movimiento desde hasta cuenta nota debito credito'.split(' ')); const m=new Map(); for(const r of rows){for(const w of lower(r.descripcion).split(/[^a-záéíóúñ0-9]+/).filter(x=>x.length>3&&!stop.has(x))){m.set(w,(m.get(w)||0)+1)}} const words=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,45); $('#wordCloud').innerHTML=words.length?words.map(([w,n])=>`<span style="font-size:${Math.min(26,12+n*2)}px">${esc(w)} <b>${n}</b></span>`).join(''):'<p class="muted">Sin palabras suficientes.</p>'}
function renderExtractTable(){const rows=filteredExtract.slice(0,500); $('#extractBody').innerHTML=rows.map(r=>`<tr><td>${esc(r.fecha)}</td><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td class="num">${fmtCOP(r.monto)}</td><td>${esc(r.metodo)}</td><td>${esc(r.categoria)}</td><td><button class="mini" data-edit-ext="${esc(r.id)}">Editar</button><button class="mini danger" data-del-ext="${esc(r.id)}">Borrar</button></td></tr>`).join('')||'<tr><td colspan="7" class="muted">Sin extractos.</td></tr>'}
async function readPdf(){const f=$('#pdfFile').files[0]; if(!f)return toast('Selecciona PDF o TXT primero.'); $('#pdfLog').textContent='Leyendo archivo...'; try{let text=''; if(f.name.toLowerCase().endsWith('.txt')) text=await f.text(); else {const arr=await f.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data:arr}).promise; for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p); const tc=await page.getTextContent(); text+=tc.items.map(i=>i.str).join(' ')+'\n'}} $('#pdfText').value=text; parsePdfText(); $('#pdfLog').textContent=`Texto extraído: ${text.length} caracteres`; }catch(e){console.error(e); $('#pdfLog').textContent=`ERROR leyendo PDF: ${e.message||e}`}}
function extractBancolombiaSaldos(text){
  const ant=text.match(/SALDO\s+ANTERIOR\s*:?\s*\$?\s*([\d.,]+)/i);
  const nuevo=text.match(/(?:SALDO\s+NUEVO|NUEVO\s+SALDO|SALDO\s+FINAL|SALDO\s+DISPONIBLE|SALDO\s+ACTUAL)\s*:?\s*\$?\s*([\d.,]+)/i);
  const ingresos=text.match(/TOTAL\s+ABONOS\s*:?\s*\$?\s*([\d.,]+)/i);
  const egresos=text.match(/TOTAL\s+CARGOS\s*:?\s*\$?\s*([\d.,]+)/i);
  const cuenta=text.match(/N[ÚU]MERO\s+(\d{7,})/i);
  const desde=text.match(/DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  const hasta=text.match(/HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  return {
    saldoInicial:ant?parseMoneyAny(ant[1]):null,
    saldoFinal:nuevo?parseMoneyAny(nuevo[1]):null,
    ingresos:ingresos?parseMoneyAny(ingresos[1]):null,
    egresos:egresos?parseMoneyAny(egresos[1]):null,
    movimientos:null,
    cuenta:cuenta?cuenta[1]:'',
    banco:'Bancolombia',
    desde:desde?`${desde[1]}-${desde[2]}-${desde[3]}`:'',
    hasta:hasta?`${hasta[1]}-${hasta[2]}-${hasta[3]}`:'',
    esProcesadorPago:false
  };
}
function extractDaviviendaPdfMeta(text){
  const inicial=text.match(/Saldo\s*Anterior\s*\$?\s*([\d.,]+)/i), ingresos=text.match(/M[aá]s\s*Cr[eé]ditos\s*\$?\s*([\d.,]+)/i), egresos=text.match(/Menos\s*D[eé]bitos\s*\$?\s*([\d.,]+)/i), final=text.match(/Nuevo\s*Saldo\s*\$?\s*([\d.,]+)/i);
  const cuenta=text.match(/CUENTA\s+DE\s+AHORROS\s+(\d{7,})/i), periodo=text.match(/INFORME\s*DEL\s*MES\s*:?\s*([A-ZÁÉÍÓÚ]+)\/(\d{4})/i);
  const meses={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
  const month=periodo?meses[plain(periodo[1])]:0, year=periodo?Number(periodo[2]):0, last=month&&year?new Date(year,month,0).getDate():0;
  return {saldoInicial:inicial?parseMoneyAny(inicial[1]):null,saldoFinal:final?parseMoneyAny(final[1]):null,ingresos:ingresos?parseMoneyAny(ingresos[1]):null,egresos:egresos?parseMoneyAny(egresos[1]):null,movimientos:null,cuenta:cuenta?cuenta[1]:'',banco:'Davivienda',desde:month?`${year}-${String(month).padStart(2,'0')}-01`:'',hasta:last?`${year}-${String(month).padStart(2,'0')}-${last}`:'',esProcesadorPago:false};
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
  if(isBoldCF&&isBoldAccountExtract(rows)){
    const headers=rows[0].map(plain), iFecha=headers.indexOf('fecha'), iValor=headers.indexOf('valor'), iSaldo=headers.indexOf('saldo');
    const data=rows.slice(1).filter(r=>r&&r.some(v=>String(v??'').trim()!==''));
    const first=data[0], last=data[data.length-1];
    const firstSaldo=first&&iSaldo>=0?parseMoneyAny(first[iSaldo]):NaN, firstValor=first&&iValor>=0?parseMoneyAny(first[iValor]):NaN;
    const saldoInicial=Number.isFinite(firstSaldo)&&Number.isFinite(firstValor)?firstSaldo-firstValor:null;
    const saldoFinal=last&&iSaldo>=0?parseMoneyAny(last[iSaldo]):null;
    desde=first&&iFecha>=0?toISODateFromDMY(first[iFecha]):'';
    hasta=last&&iFecha>=0?toISODateFromDMY(last[iFecha]):'';
    return {saldoInicial,saldoFinal:Number.isFinite(saldoFinal)?saldoFinal:null,banco:'Bold CF',desde,hasta,esProcesadorPago:false};
  }
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
  const ingresos=text.match(/(?:TOTAL\s+)?(?:INGRESOS|ABONOS|CREDITOS|CR[EÉ]DITOS)\s*:?\s*\$?\s*([\d.,]+)/i);
  const egresos=text.match(/(?:TOTAL\s+)?(?:EGRESOS|CARGOS|DEBITOS|D[EÉ]BITOS|RETIROS)\s*:?\s*\$?\s*([\d.,]+)/i);
  const movimientos=text.match(/(?:N[UÚ]MERO|CANTIDAD|TOTAL)\s+(?:DE\s+)?MOVIMIENTOS\s*:?\s*(\d+)/i);
  return {
    saldoInicial:ant?parseMoneyAny(ant[1]):null,
    saldoFinal:fin?parseMoneyAny(fin[1]):null,ingresos:ingresos?parseMoneyAny(ingresos[1]):null,egresos:egresos?parseMoneyAny(egresos[1]):null,movimientos:movimientos?Number(movimientos[1]):null,cuenta:'',
    banco:banco||'Extracto',
    desde:'',hasta:'',esProcesadorPago:false
  };
}
function renderSaldoCheck(rows,meta,containerId){
  const el=$(containerId); if(!el)return;
  const {saldoInicial,saldoFinal,banco,desde,hasta,esProcesadorPago}=meta||{};
  if(saldoInicial===null&&saldoFinal===null){el.innerHTML='';return;}
  const ingresosDetectados=rows.filter(r=>r.tipo==='Ingreso').reduce((a,x)=>a+Number(x.monto||0),0);
  const egresosDetectados=rows.filter(r=>r.tipo==='Egreso').reduce((a,x)=>a+Number(x.monto||0),0);
  const ingresos=meta.ingresos??ingresosDetectados, egresos=meta.egresos??egresosDetectados;
  const calculado=(saldoInicial??0)+ingresos-egresos;
  const diff=saldoFinal!=null?Math.round(calculado-saldoFinal):null;
  const ok=diff!==null&&Math.abs(diff)<500;
  const periodo=desde?` · ${desde}${hasta?' → '+hasta:''}` :'';
  el.innerHTML=`<div class="saldoCheck ${ok?'saldoOk':diff!==null?'saldoBad':'saldoInfo'}">
    <div class="saldoTitle">${esc(banco)}${esc(periodo)} · Verificación de cuadre</div>
    <div class="saldoGrid">
      ${saldoInicial!==null?`<span>Saldo inicial extracto</span><strong>${fmtCOP(saldoInicial)}</strong>`:''}
      <span>+ Ingresos ${meta.ingresos!=null?'del extracto':'detectados'}</span><strong class="good">+${fmtCOP(ingresos)}</strong>
      <span>- Egresos ${meta.egresos!=null?'del extracto':'detectados'}</span><strong class="bad">-${fmtCOP(egresos)}</strong>
      <span># Movimientos ${meta.movimientos!=null?'del extracto':'detectados'}</span><strong>${fmtNum(meta.movimientos??rows.length)}</strong>
      <span>= Saldo calculado</span><strong>${fmtCOP(calculado)}</strong>
      ${saldoFinal!==null?`<span>${esProcesadorPago?'Total depositado (extracto)':'Saldo final extracto'}</span><strong>${fmtCOP(saldoFinal)}</strong>`:''}
      ${diff!==null?`<span class="saldoDiffLabel">Diferencia</span><strong class="${ok?'good':'bad'}">${ok?'✔ Cuadra perfectamente':fmtCOP(Math.abs(diff))+' de diferencia'}</strong>`:''}
    </div>
    ${!ok&&diff!==null?`<p class="saldoHint">Puede faltar un movimiento, haber uno duplicado, o el extracto no captura el periodo completo.</p>`:''}
  </div>`;
}
function parseBancolombiaPdfText(text){
  // Extraer año y mes límite del encabezado
  const hastaM=text.match(/HASTA:\s*(\d{4})\/(\d{2})\/\d{2}/i);
  const desdeM=text.match(/DESDE:\s*(\d{4})\/(\d{2})\/\d{2}/i);
  const endYear=hastaM?+hastaM[1]:new Date().getFullYear();
  const endMonth=hastaM?+hastaM[2]:12;
  const startYear=desdeM?+desdeM[1]:endYear;
  function resolveDate(day,month){
    const m=+month,d=+day;
    // Si el mes es mayor al mes final del extracto â†' pertenece al año anterior
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
  // Separar en páginas por "PÃGINA: N"
  const pages=text.split(/P[AÃ]GINA[:\s]*\d+/i).filter(p=>p.trim().length>50);

  for(const page of pages){
    const dateMatches=[...page.matchAll(/\b(\d{1,2})\/(\d{2})\b/g)];
    if(!dateMatches.length) continue;

    // Detectar formato columnar (página 2): muchas fechas agrupadas al inicio
    // Heurística: 4+ fechas antes del primer número con decimales
    const firstNum=page.search(/-?[\d,]+\.\d{2}/);
    const datesBeforeNums=dateMatches.filter(m=>m.index<firstNum).length;
    const isColumnar=datesBeforeNums>=4;

    if(isColumnar){
      // Separar bloques: fechas | descripciones | montos | saldos
      const lastDateEnd=dateMatches[dateMatches.length-1].index+dateMatches[dateMatches.length-1][0].length;
      const allNumMatches=[...page.matchAll(/-?[\d,]+\.\d{2}/g)];
      // Saldos son números grandes (>500k), montos son menores
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
      // Formato fila por fila (página 1): D/MM DESCRIPCION MONTO SALDO
      for(let i=0;i<dateMatches.length;i++){
        const m=dateMatches[i];
        const segEnd=i+1<dateMatches.length?dateMatches[i+1].index:page.length;
        const seg=page.slice(m.index+m[0].length,segEnd);
        const numMatches=[...seg.matchAll(/-?[\d,]+\.\d{2}/g)];
        if(!numMatches.length) continue;
        // Penúltimo número = monto, último = saldo (si hay 2+); si solo hay 1 = monto
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

const PDF_ACCOUNTS=['Bold CF','Davivienda','Bancolombia'];
function resetPdfMeta(){pdfTx=[]; pdfMeta={saldoInicial:null,saldoFinal:null,ingresos:null,egresos:null,movimientos:null,cuenta:'',banco:'',desde:'',hasta:'',esProcesadorPago:false};}
function detectPdfAccount(text,manual=''){
  if(PDF_ACCOUNTS.includes(manual))return manual;
  const t=plain(text||'');
  if(/\bbold\s+cf\b/i.test(text||'')||/\bbold\s+cf\b/i.test(t))return 'Bold CF';
  if(/davivienda/i.test(text||''))return 'Davivienda';
  if(/bancolombia/i.test(text||''))return 'Bancolombia';
  return '';
}
function inferMonthFromMeta(meta){
  if(meta?.desde)return monthKey(meta.desde);
  if(meta?.hasta)return monthKey(meta.hasta);
  return '';
}
function normalizePdfMetaFromInputs(){
  const account=$('#pdfAccount')?.value||pdfMeta.banco||'';
  const month=$('#pdfMonth')?.value||inferMonthFromMeta(pdfMeta);
  const last=month?new Date(+month.slice(0,4),+month.slice(5,7),0).getDate():0;
  const moneyInput=id=>{const v=$('#'+id)?.value; if(v===''||v==null)return null; const n=parseMoneyAny(v); return Number.isFinite(n)?Math.abs(n):null;};
  const intInput=id=>{const v=$('#'+id)?.value; if(v===''||v==null)return null; const n=parseInt(String(v).replace(/[^\d-]/g,''),10); return Number.isFinite(n)?Math.max(0,n):null;};
  pdfMeta={...pdfMeta,
    banco:account,
    saldoInicial:moneyInput('pdfSaldoInicial'),
    ingresos:moneyInput('pdfIngresos'),
    egresos:moneyInput('pdfEgresos'),
    saldoFinal:moneyInput('pdfSaldoFinal'),
    movimientos:intInput('pdfMovimientos'),
    desde:month?`${month}-01`:pdfMeta.desde||'',
    hasta:month&&last?`${month}-${String(last).padStart(2,'0')}`:pdfMeta.hasta||''
  };
  return pdfMeta;
}
function fillPdfSummaryForm(){
  const account=detectPdfAccount($('#pdfText')?.value||'',pdfMeta.banco);
  if($('#pdfAccount'))$('#pdfAccount').value=PDF_ACCOUNTS.includes(account)?account:'';
  if($('#pdfMonth'))$('#pdfMonth').value=inferMonthFromMeta(pdfMeta)||'';
  const setMoney=(id,v)=>{const el=$('#'+id); if(el)el.value=v==null?'':Math.round(Number(v));};
  setMoney('pdfSaldoInicial',pdfMeta.saldoInicial);
  setMoney('pdfIngresos',pdfMeta.ingresos);
  setMoney('pdfEgresos',pdfMeta.egresos);
  setMoney('pdfSaldoFinal',pdfMeta.saldoFinal);
  if($('#pdfMovimientos'))$('#pdfMovimientos').value=pdfMeta.movimientos??'';
  normalizePdfMetaFromInputs();
}
function extractPdfSummary(text){
  const manual=$('#pdfAccount')?.value||'';
  const account=detectPdfAccount(text,manual);
  let meta;
  if(account==='Bancolombia')meta=extractBancolombiaSaldos(text);
  else if(account==='Davivienda'||/Saldo\s*Anterior/i.test(text)&&/M[aá]s\s*Cr[eé]ditos/i.test(text))meta=extractDaviviendaPdfMeta(text);
  else meta=extractGenericSaldos(text,account||manual||'');
  const movimientos=text.match(/(?:n[uú]mero|cantidad|total)\s+(?:de\s+)?movimientos\s*:?\s*(\d+)/i)||text.match(/movimientos\s*:?\s*(\d+)/i);
  if(movimientos)meta.movimientos=Number(movimientos[1]);
  meta.banco=account||meta.banco||manual||'';
  if(meta.banco==='Bold')meta.banco='';
  return meta;
}
function parsePdfText(){
  const text=$('#pdfText').value||'';
  resetPdfMeta();
  pdfMeta=extractPdfSummary(text);
  fillPdfSummaryForm();
  renderPdfPreview();
  const missing=['banco','desde','saldoInicial','ingresos','egresos','saldoFinal','movimientos'].filter(k=>pdfMeta[k]===''||pdfMeta[k]==null);
  $('#pdfLog').textContent=missing.length?`Resumen detectado parcialmente. Completa manualmente: ${missing.join(', ')}.`:`Resumen detectado para ${pdfMeta.banco} (${monthLabel(monthKey(pdfMeta.desde))}).`;
}
function renderPdfPreview(){
  normalizePdfMetaFromInputs();
  const accountOk=PDF_ACCOUNTS.includes(pdfMeta.banco);
  const month=monthKey(pdfMeta.desde);
  const completeValues=[pdfMeta.saldoInicial,pdfMeta.ingresos,pdfMeta.egresos,pdfMeta.saldoFinal,pdfMeta.movimientos].every(v=>v!=null);
  const ready=accountOk&&month&&completeValues;
  const state=!accountOk?'Elige cuenta':!month?'Falta mes':!completeValues?'Completa valores':'Listo';
  $('#pdfBody').innerHTML=`<tr class="${ready?'isOk':'isBad'}"><td><strong>${state}</strong></td><td>${esc(month?monthLabel(month):'')}</td><td>${esc(pdfMeta.banco||'')}</td><td class="num">${pdfMeta.saldoInicial==null?'':fmtCOP(pdfMeta.saldoInicial)}</td><td class="num good">${pdfMeta.ingresos==null?'':fmtCOP(pdfMeta.ingresos)}</td><td class="num bad">${pdfMeta.egresos==null?'':fmtCOP(pdfMeta.egresos)}</td><td class="num">${pdfMeta.saldoFinal==null?'':fmtCOP(pdfMeta.saldoFinal)}</td><td class="num">${pdfMeta.movimientos??''}</td></tr>`;
  $('#btnSavePdfTx').disabled=!ready;
  renderSaldoCheck([],pdfMeta,'#saldoCheckPdf');
}
async function savePdfTx(){
  const fileName=$('#pdfFile').files[0]?.name||'texto-pegado';
  normalizePdfMetaFromInputs();
  if(!PDF_ACCOUNTS.includes(pdfMeta.banco))return toast('Elige una cuenta valida: Bold CF, Davivienda o Bancolombia.');
  const id=`extract_summary_${monthKey(pdfMeta.desde)}_${pdfMeta.banco.replace(/\s+/g,'_').toLowerCase()}_${hash(fileName)}`;
  const calculado=(pdfMeta.saldoInicial??0)+(pdfMeta.ingresos??0)-(pdfMeta.egresos??0);
  await setDoc(doc(db,IMPORTS,id),{source:'PDF/TEXTO',fileName,target:'extract-summary',inserted:1,totalInput:1,duplicates:0,saldoInicial:pdfMeta.saldoInicial,saldoFinal:pdfMeta.saldoFinal,totalIngresos:pdfMeta.ingresos,totalEgresos:pdfMeta.egresos,totalMovimientos:pdfMeta.movimientos??0,saldoCuenta:pdfMeta.cuenta||pdfMeta.banco,saldoBanco:pdfMeta.banco,saldoDesde:pdfMeta.desde||'',saldoHasta:pdfMeta.hasta||'',diferencia:pdfMeta.saldoFinal==null?null:Math.round(calculado-pdfMeta.saldoFinal),importedBy:auth.currentUser?.email||'',createdAt:serverTimestamp()},{merge:true});
  toast('Resumen del extracto guardado');
  await loadData();
  resetPdfMeta();
  renderPdfPreview();
}

function pickField(row,names){for(const n of names){if(row[n]!==undefined&&row[n]!==null&&row[n]!=='')return row[n]; const k=Object.keys(row).find(x=>lower(x)===lower(n)); if(k&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];} return '';}
function cleanExpectedExpense(raw,source='Manual'){
  const vencimiento=norm(pickField(raw,['vencimiento','fecha','fecha vencimiento','Fecha','Fecha de pago','fecha_pago']));
  const proveedor=norm(pickField(raw,['proveedor','docente','personal','beneficiario','tercero','nombre']));
  const categoria=norm(pickField(raw,['categoria','categoría','tipo','concepto']))||(source==='Nómina'?'Nómina':'Pago Proveedores');
  const detalle=norm(pickField(raw,['detalle','descripcion','descripción','concepto','observacion','observación']))||proveedor||categoria;
  const valor=Math.abs(parseMoneyAny(pickField(raw,['valor','monto','total','pago','Pago Nómina','Pago Nomina','neto'])));
  const medio=norm(pickField(raw,['medio','medioPago','medio de pago','banco','metodo','método']));
  const origen=norm(pickField(raw,['origen','fuente','source']))||source;
  const periodo=norm(pickField(raw,['periodo','mes','month']))||monthKey(vencimiento);
  const estadoManual=norm(pickField(raw,['estado','Estado']));
  const ref=norm(pickField(raw,['ref','referencia','id','documento','cedula','cédula']));
  return {vencimiento,proveedor,categoria,detalle,valor,medio,origen,periodo,estadoManual,ref};
}
function expectedExpenseIdFor(row){const ref=norm(row.ref); if(ref)return `eg_${ref.replace(/[\/#[\]?]/g,'-').slice(0,140)}`; return `eg_${hash([row.periodo,row.vencimiento,row.proveedor,row.categoria,row.detalle,row.valor,row.origen].map(norm).join('|').toLowerCase())}`;}
function expectedExpenseKey(row,medioKey='medio'){return `${row.vencimiento||''}-${Math.round(Number(row.valor||0))}-${normReconcMedio(row[medioKey]||'')}`;}
function buildExpenseMatches(){
  const fcEgresos=buildReconcKeys(allTx.filter(tx=>tx.tipo==='Egreso'),'metodo');
  const fcByExact=new Map(fcEgresos.map(tx=>[tx._reconcKey,tx]));
  return expectedExpenses.map(raw=>{
    const row={...raw};
    const exactKey=expectedExpenseKey(row);
    let match=fcByExact.get(`${exactKey}-1`)||null;
    if(!match){
      const rDate=new Date((row.vencimiento||row.fecha||'')+'T12:00:00');
      const rMonto=Number(row.valor||0);
      match=fcEgresos.find(tx=>{
        const fDate=new Date((tx.fecha||'')+'T12:00:00');
        const dayDiff=Math.abs((rDate-fDate)/(1000*60*60*24));
        const montoDiff=Math.abs(Number(tx.monto||0)-rMonto);
        const text=lower([tx.descripcion,tx.categoria,tx.obs].join(' '));
        const provider=lower(row.proveedor);
        return dayDiff<=5&&montoDiff<=Math.max(2000,rMonto*0.02)&&(!provider||text.includes(provider.split(' ')[0]||provider));
      })||null;
    }
    const estado=lower(row.estadoManual)==='no aplica'||lower(row.estadoManual)==='inactivo'?'No aplica':(lower(row.estadoManual)==='pagado'||match?'Pagado':'Pendiente');
    return {...row,_match:match,_estado:estado,_key:exactKey};
  });
}
function expectedRowsInPeriod(){
  const from=$('#egFrom')?.value||$('#dashFrom')?.value||'', to=$('#egTo')?.value||$('#dashTo')?.value||'';
  const origen=$('#egOrigen')?.value||'', estado=$('#egEstado')?.value||'', q=lower($('#egQ')?.value||'');
  return buildExpenseMatches().filter(r=>{
    const fecha=r.vencimiento||r.fecha||'';
    if(from&&fecha<from)return false; if(to&&fecha>to)return false;
    if(origen&&r.origen!==origen)return false; if(estado&&r._estado!==estado)return false;
    if(q&&!lower([r.proveedor,r.categoria,r.detalle,r.medio,r.valor,r._match?.descripcion].join(' ')).includes(q))return false;
    return true;
  });
}
function fillExpectedFilters(){
  const sel=$('#egOrigen'); if(!sel)return;
  const cur=sel.value;
  const origins=[...new Set(expectedExpenses.map(r=>r.origen).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los orígenes</option>'+origins.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
  if(cur)sel.value=cur;
}
function renderExpectedExpenses(){
  const tbody=$('#egBody'); if(!tbody)return;
  const rows=expectedRowsInPeriod();
  filteredExpectedExpenses=rows;
  const pending=rows.filter(r=>r._estado==='Pendiente');
  const paid=rows.filter(r=>r._estado==='Pagado');
  $('#egKpiTotal').textContent=fmtCOP(rows.reduce((a,x)=>a+Number(x.valor||0),0));
  $('#egKpiPending').textContent=fmtCOP(pending.reduce((a,x)=>a+Number(x.valor||0),0));
  $('#egKpiPaid').textContent=fmtCOP(paid.reduce((a,x)=>a+Number(x.valor||0),0));
  $('#egKpiCount').textContent=fmtNum(rows.length);
  tbody.innerHTML=rows.map(r=>`<tr>
    <td><span class="statusDot ${r._estado==='Pagado'?'dotOk':r._estado==='Pendiente'?'dotBad':'dotMuted'}">${esc(r._estado)}</span></td>
    <td>${esc(r.vencimiento||'')}</td>
    <td><b>${esc(r.proveedor||'')}</b><div class="muted tiny">${esc(r.detalle||'')}</div></td>
    <td>${esc(r.categoria||'')}</td>
    <td class="num">${fmtCOP(r.valor)}</td>
    <td>${esc(r.medio||'')}</td>
    <td>${esc(r.origen||'')}</td>
    <td>${r._match?`<button class="mini" data-edit-fc="${esc(r._match.id)}">${esc(r._match.fecha)} · ${fmtCOP(r._match.monto)}</button>`:'<span class="muted">Sin egreso en flujo</span>'}</td>
    <td class="actions"><button class="mini" data-edit-eg="${esc(r.id)}">Editar</button><button class="mini danger" data-del-eg="${esc(r.id)}">Borrar</button></td>
  </tr>`).join('')||'<tr><td colspan="9" class="muted">Sin egresos esperados en el período.</td></tr>';
}
async function importExpectedFile(file,source){
  if(!file)return;
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  let rows=[];
  if(ext==='csv'){const txt=await file.text(); const parsed=parseDelimited(txt,detectDelimiter(txt)); const head=(parsed.shift()||[]).map(norm); rows=parsed.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]])));}
  else if(ext==='xlsx'){const data=await readXlsxTo2d(file,{raw:false}); const head=(data.shift()||[]).map(norm); rows=data.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]])));}
  else return toast('Formato no soportado. Usa CSV o XLSX.');
  const clean=rows.map(r=>cleanExpectedExpense(r,source)).filter(r=>r.vencimiento&&r.valor);
  if(!clean.length)return toast('No encontré filas válidas para importar.');
  let done=0;
  for(let i=0;i<clean.length;i+=450){
    const batch=writeBatch(db);
    for(const r of clean.slice(i,i+450))batch.set(doc(db,EXPECTED_EXPENSES,expectedExpenseIdFor(r)),{...r,fileName:file.name,importedBy:auth.currentUser?.email||'',updatedAt:serverTimestamp(),importedAt:serverTimestamp()},{merge:true});
    await batch.commit(); done+=clean.slice(i,i+450).length;
  }
  await setDoc(doc(db,IMPORTS,`egresos_${Date.now()}_${hash(file.name+source)}`),{source:`Egresos ${source}`,fileName:file.name,target:EXPECTED_EXPENSES,totalInput:rows.length,inserted:done,importedBy:auth.currentUser?.email||'',createdAt:serverTimestamp()},{merge:true});
  toast(`Importados ${done} egresos esperados`);
  await loadData();
}
function openExpectedEdit(id){
  const r=expectedExpenses.find(x=>x.id===id)||{};
  $('#egEditId').value=id||''; $('#egEditTitle').textContent=id?'Editar egreso esperado':'Nuevo egreso esperado';
  $('#egEditVencimiento').value=r.vencimiento||new Date().toISOString().slice(0,10);
  $('#egEditProveedor').value=r.proveedor||''; $('#egEditCategoria').value=r.categoria||'Pago Proveedores'; $('#egEditDetalle').value=r.detalle||'';
  $('#egEditValor').value=r.valor||''; $('#egEditMedio').value=r.medio||''; $('#egEditOrigen').value=r.origen||'Proveedor'; $('#egEditEstado').value=r.estadoManual||'';
  $('#egEditDialog').showModal();
}
async function saveExpectedEdit(e){
  e.preventDefault();
  const id=$('#egEditId').value;
  const data=cleanExpectedExpense({vencimiento:$('#egEditVencimiento').value,proveedor:$('#egEditProveedor').value,categoria:$('#egEditCategoria').value,detalle:$('#egEditDetalle').value,valor:$('#egEditValor').value,medio:$('#egEditMedio').value,origen:$('#egEditOrigen').value,estado:$('#egEditEstado').value},$('#egEditOrigen').value||'Manual');
  const docId=id||expectedExpenseIdFor(data);
  await setDoc(doc(db,EXPECTED_EXPENSES,docId),{...data,updatedAt:serverTimestamp(),createdAt:serverTimestamp()},{merge:true});
  $('#egEditDialog').close(); toast('Egreso esperado guardado'); await loadData();
}
async function deleteExpected(id){if(!confirm('¿Borrar este egreso esperado?'))return; await deleteDoc(doc(db,EXPECTED_EXPENSES,id)); toast('Borrado'); await loadData();}

function renderCalendar(){const boxes=[['calendarBox','calTitle'],['calendarBox2','calTitle2']]; const y=calDate.getFullYear(), m=calDate.getMonth(); const first=new Date(y,m,1), last=new Date(y,m+1,0); const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']; const dates=new Set(allTx.map(x=>x.fecha)); const uploaded=[...dates].filter(d=>d.startsWith(`${y}-${String(m+1).padStart(2,'0')}-`)).length; const workdays=[...Array(last.getDate())].map((_,i)=>new Date(y,m,i+1)).filter(d=>d.getDay()!==0).length; $('#monthStats').textContent=`${uploaded} días con datos, ${Math.max(0,workdays-uploaded)} faltan. Domingos no cuentan.`; for(const [boxId,titleId] of boxes){const box=$('#'+boxId), title=$('#'+titleId); if(!box||!title)continue; title.textContent=`${monthNames[m]} de ${y}`; let html='<div class="weekHead"><b>L</b><b>M</b><b>M</b><b>J</b><b>V</b><b>S</b><b>D</b></div><div class="days">'; const start=(first.getDay()+6)%7; for(let i=0;i<start;i++)html+='<div class="day blank"></div>'; for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m,d), iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, off=dt.getDay()===0, up=dates.has(iso), cls=off?'off':up?'uploaded':'missing'; html+=`<button class="day ${cls}" data-date="${iso}"><b>${d}</b><span>${off?'No cuenta':up?'Con datos':'Falta'}</span></button>`} html+='</div>'; box.innerHTML=html;}}
function renderImports(){const box=$('#recentImports'); if(!box)return; box.innerHTML=imports.slice(0,12).map(i=>`<div class="listRow"><span><b>${esc(i.source||'Importación')}</b><br>${esc(i.fileName||'')} · ${esc(i.target||'flow')}</span><strong>${fmtNum(i.inserted||0)}</strong></div>`).join('')||'<p class="muted">Sin importaciones.</p>'}

function openEdit(kind,id){let r=null, title='Editar'; if(kind==='fc'){r=allTx.find(x=>x.id===id)||{}; $('#editCollection').value=COLLECTION; title='Editar Flujo de Caja'} if(kind==='ext'){r=extractRows.find(x=>x.id===id)||{}; $('#editCollection').value=EXTRACTS; title='Editar Extracto'} if(kind==='rip'){r=ripRows.find(x=>x.id===id)||{}; $('#editCollection').value=$('#ripCollection').value||'clientesB2C'; title='Editar RIP'} $('#editKind').value=kind; $('#editDocId').value=id||''; $('#editTitle').textContent=title; $('#editFecha').value=r.fecha||new Date().toISOString().slice(0,10); $('#editTipo').value=r.tipo||'Ingreso'; $('#editDescripcion').value=kind==='rip'?(r.estudiante||''):(r.descripcion||''); $('#editMonto').value=r.monto||''; $('#editMetodo').value=r.metodo||''; $('#editCategoria').value=kind==='rip'?(r.servicio||''):(r.categoria||''); $('#editFactura').value=r.factura||''; $('#editRef').value=r.ref||''; $('#editObs').value=r.obs||''; $('#editDialog').showModal()}
async function saveEdit(e){e.preventDefault(); const kind=$('#editKind').value, id=$('#editDocId').value, coll=$('#editCollection').value; if(!id&&kind==='rip')return; if(kind==='rip'){const ripUpd={fecha:$('#editFecha').value,estudiante:$('#editDescripcion').value,servicio:$('#editCategoria').value,medioPago:$('#editMetodo').value,monto:Number($('#editMonto').value||0)}; await setDoc(doc(ripDb,coll,id),{...ripUpd,updatedAt:serverTimestamp()},{merge:true}); const rd=ripDocs.find(r=>r._id===id); if(rd)Object.assign(rd,ripUpd); const rr=ripRows.find(r=>r.id===id); if(rr)Object.assign(rr,{fecha:ripUpd.fecha,estudiante:ripUpd.estudiante,servicio:ripUpd.servicio,metodo:ripUpd.medioPago,monto:ripUpd.monto}); renderRipAll(); renderDashboard();} else {const data=cleanTx({fecha:$('#editFecha').value,tipo:$('#editTipo').value,descripcion:$('#editDescripcion').value,monto:$('#editMonto').value,metodo:$('#editMetodo').value,categoria:$('#editCategoria').value,factura:$('#editFactura').value,ref:$('#editRef').value,obs:$('#editObs').value}); const target=kind==='ext'?EXTRACTS:COLLECTION; const docId=id||docIdFor(data); await setDoc(doc(db,target,docId),{...data,updatedAt:serverTimestamp(),createdAt:serverTimestamp()},{merge:true}); await loadData();} $('#editDialog').close(); toast('Guardado \u2705')}
async function del(kind,id){if(!confirm('Â¿Borrar este registro?'))return; await deleteDoc(doc(db,kind==='ext'?EXTRACTS:COLLECTION,id)); await loadData(); toast('Borrado')}

function bind(){
  $('#btnLogin').onclick=()=>signInWithPopup(auth,provider); $('#btnLogout').onclick=()=>signOut(auth);
  $('#btnRipLogin').onclick=()=>signInWithPopup(ripAuth,ripProvider); $('#btnLoadRip').onclick=loadRip;
  $$('.tab[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view)); $$('[data-open-view]').forEach(b=>b.onclick=()=>showView(b.dataset.openView)); if($('#btnApplyDashboard'))$('#btnApplyDashboard').onclick=renderAll; if($('#btnApplyTx'))$('#btnApplyTx').onclick=()=>applyTxFilters(true); if($('#btnExport'))$('#btnExport').onclick=exportCSV; if($('#btnAutoCat'))$('#btnAutoCat').onclick=autoCategorize; if($('#btnReCat'))$('#btnReCat').onclick=()=>autoCategorize(true); if($('#expMonth'))$('#expMonth').onchange=()=>{}; if($('#fcMes'))$('#fcMes').onchange=e=>setFcMonth(e.target.value); ['txFrom','txTo','txTipo','txFact','txCat','txCanal'].forEach(id=>{const el=$('#'+id); if(el)el.onchange=()=>applyTxFilters(true)}); if($('#txQ'))$('#txQ').oninput=()=>applyTxFilters(true); if($('#btnSinCat'))$('#btnSinCat').onclick=()=>{const btn=$('#btnSinCat'); const active=btn.dataset.active==='1'; btn.dataset.active=active?'0':'1'; btn.classList.toggle('primary',!active); btn.classList.toggle('ghost',active); applyTxFilters(true);};
  if($('#btnNewFlow'))$('#btnNewFlow').onclick=()=>openEdit('fc',''); if($('#btnNewExtract'))$('#btnNewExtract').onclick=()=>openEdit('ext',''); if($('#editForm'))$('#editForm').onsubmit=saveEdit;
  if($('#accessBody'))$('#accessBody').onclick=e=>{if(!isConfigAdminEmail())return; const chip=e.target.closest('.accessChip'); if(chip){chip.classList.toggle('active'); return;} const card=e.target.closest('.accessCard'); if(!card)return; if(e.target.closest('[data-mark-all]'))card.querySelectorAll('.accessChip').forEach(b=>b.classList.add('active')); if(e.target.closest('[data-clear-pages]'))card.querySelectorAll('.accessChip').forEach(b=>b.classList.remove('active')); if(e.target.closest('[data-invert-pages]'))card.querySelectorAll('.accessChip').forEach(b=>b.classList.toggle('active'));};
  if($('#btnAddAccessUser'))$('#btnAddAccessUser').onclick=()=>{if(!isConfigAdminEmail())return; const email=prompt('Correo del usuario'); if(!email)return; accessUsers[lower(email)]={name:'',role:'accountant',active:true,pages:['flujo','facturacion']}; renderAccessConfig();};
  if($('#btnSaveAccess'))$('#btnSaveAccess').onclick=saveAccessConfig;
  if($('#txBody')){$('#txBody').onclick=e=>{const er=e.target.closest('[data-edit-rip]');if(er){openEdit('rip',er.dataset.editRip);return;} const ed=e.target.closest('[data-edit-fc]'), delb=e.target.closest('[data-del-fc]'); if(ed)openEdit('fc',ed.dataset.editFc); if(delb)del('fc',delb.dataset.delFc)}; $('#txBody').addEventListener('change',async e=>{const sel=e.target.closest('.catInline'); if(!sel)return; const id=sel.dataset.id; const cat=sel.value; if(!cat)return; try{await setDoc(doc(db,COLLECTION,id),{categoria:cat,updatedAt:serverTimestamp()},{merge:true}); const tx=allTx.find(x=>x.id===id); if(tx)tx.categoria=cat; applyTxFilters(true); toast('Clasificado: '+cat+' \u2705');}catch(err){console.error(err); toast('Error al guardar categoría.');}});}
  if($('#extractBody'))$('#extractBody').onclick=e=>{const ed=e.target.closest('[data-edit-ext]'), delb=e.target.closest('[data-del-ext]'); if(ed)openEdit('ext',ed.dataset.editExt); if(delb)del('ext',delb.dataset.delExt)};
  if($('#egBody'))$('#egBody').onclick=e=>{const fc=e.target.closest('[data-edit-fc]'), ed=e.target.closest('[data-edit-eg]'), delb=e.target.closest('[data-del-eg]'); if(fc)openEdit('fc',fc.dataset.editFc); if(ed)openExpectedEdit(ed.dataset.editEg); if(delb)deleteExpected(delb.dataset.delEg)};
  if($('#btnNewExpected'))$('#btnNewExpected').onclick=()=>openExpectedEdit('');
  if($('#egEditForm'))$('#egEditForm').onsubmit=saveExpectedEdit;
  if($('#btnImportExpected'))$('#btnImportExpected').onclick=()=>importExpectedFile($('#egFile')?.files?.[0],$('#egImportSource')?.value||'Proveedor');
  ['egFrom','egTo','egOrigen','egEstado'].forEach(id=>{const el=$('#'+id); if(el)el.onchange=renderExpectedExpenses});
  if($('#egQ'))$('#egQ').oninput=renderExpectedExpenses;
  if($('#ripBody'))$('#ripBody').onclick=e=>{const ed=e.target.closest('[data-edit-rip]'); if(ed)openEdit('rip',ed.dataset.editRip)}; if($('#btnFilterRip'))$('#btnFilterRip').onclick=renderRipAll; if($('#btnFilterExt'))$('#btnFilterExt').onclick=()=>filterExtract(true); if($('#ripServFilter'))$('#ripServFilter').onchange=renderRipAll; if($('#ripMetFilter'))$('#ripMetFilter').onchange=renderRipAll; if($('#ripFrom'))$('#ripFrom').onchange=renderRipAll; if($('#ripTo'))$('#ripTo').onchange=renderRipAll;
  $('#bankFile').onchange=e=>processBankFile(e.target.files[0]); $('#bankSource').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#boldMode').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#boldOnlyOk').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#splitFees').onchange=()=>$('#bankFile').files[0]&&processBankFile($('#bankFile').files[0]); $('#bankBody').onchange=e=>{const s=e.target.closest('.catSel'); if(s&&bankTx[s.dataset.idx]){bankTx[s.dataset.idx].categoria=s.value; renderBankPreview()}}; $('#btnUploadBank').onclick=uploadBank; $('#btnBankCsv').onclick=bankCsv; $('#btnBankClear').onclick=()=>{bankTx=[]; $('#bankFile').value=''; renderBankPreview(); $('#bankLog').textContent='Esperando archivo...'};
  $('#btnReadPdf').onclick=readPdf; $('#btnParseText').onclick=parsePdfText; $('#btnSavePdfTx').onclick=savePdfTx; $('#btnClearPdf').onclick=()=>{resetPdfMeta(); ['pdfText','pdfFile','pdfAccount','pdfMonth','pdfSaldoInicial','pdfIngresos','pdfEgresos','pdfSaldoFinal','pdfMovimientos'].forEach(id=>{const el=$('#'+id); if(el)el.value=''}); renderPdfPreview(); $('#pdfLog').textContent='Esperando extracto...';};
  ['pdfAccount','pdfMonth','pdfSaldoInicial','pdfIngresos','pdfEgresos','pdfSaldoFinal','pdfMovimientos'].forEach(id=>{const el=$('#'+id); if(el)el.oninput=renderPdfPreview;});
  $('#calPrev').onclick=$('#calPrev2').onclick=()=>{calDate.setMonth(calDate.getMonth()-1); renderCalendar()}; $('#calNext').onclick=$('#calNext2').onclick=()=>{calDate.setMonth(calDate.getMonth()+1); renderCalendar()};
}

bind(); bilBind(); renderAccessConfig();
onAuthStateChanged(auth, async user=>{const email=user?.email||''; if(user)await loadAccessConfig(); setCurrentAccess(email); const ok=!!user&&currentRole!=='blocked'; $('#userEmail').textContent=email||'Sin sesión'; $('#btnLogin').classList.toggle('hidden',!!user); $('#btnLogout').classList.toggle('hidden',!user); showApp(ok); if(ok){await loadData(); restoreView();}});
let _ripAuthLoaded=false;
onAuthStateChanged(ripAuth,user=>{if($('#ripEmail'))$('#ripEmail').textContent=user?.email||'RIP Sin sesión'; if(user&&!_ripAuthLoaded){_ripAuthLoaded=true; loadRip();}});
if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs=>regs.forEach(reg=>reg.unregister())).catch(()=>{});

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
  bilLists.facturadas=ripK.filter(r=>r.fevm&&isMatched(r)).map(({_rk,...r})=>r);
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
  $('#bilBtnRefresh')?.addEventListener('click',async()=>{bilStatus('Actualizando...',''); if(!ripAuth.currentUser)await signInWithPopup(ripAuth,ripProvider); await loadRip(); bilRender();});
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
