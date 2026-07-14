"use strict";

import { loginWithGoogle, listenAuth, logout } from "./authService.js";
import { ESTADOS_EGRESO, ESTADOS_MES_ACTIVO, FUENTES_EGRESO, MESES, TIPOS_EGRESO } from "./catalogosService.js";
import {
  anularEgreso,
  archivarEgreso,
  conciliarEgreso,
  crearEgreso,
  editarEgreso,
  listenEgresosPeriodoTodos,
  registrarPago,
} from "./egresosService.js";
import { EGRESOS_ESPECIALES_SEED, EGRESOS_ESPECIALES_SEED_META } from "./egresosEspecialSeed.js";
import {
  crearEspecial,
  editarEspecial,
  importarEgresosEspeciales,
  listenEgresosEspecial,
} from "./egresosEspecialService.js";
import {
  crearEgresoDesdeFlujo,
  desvincularFlujoEgreso,
  listenFlujoEgresos,
  vincularFlujoEgreso,
} from "./flujoCajaService.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const byId = id => document.getElementById(id);
const TAB_KEY = "egresos_radar_active_tab";
const MONTH_KEY = "egresos_radar_active_month";

const els = {
  status: byId("statusline"),
  user: byId("user-label"),
  login: byId("btn-login"),
  logout: byId("btn-logout"),
  nuevo: byId("btn-new"),
  monthMenu: byId("month-menu"),
  tabs: () => $$(".section-tabs [data-tab]"),
  sections: {
    dashboard: byId("tab-dashboard"),
    pendientes: byId("tab-pendientes"),
    egresos: byId("tab-egresos"),
    conciliacion: byId("tab-conciliacion"),
    nomina: byId("tab-nomina"),
    proveedores: byId("tab-proveedores"),
    "gastos-fijos": byId("tab-gastos-fijos"),
    "gastos-variables": byId("tab-gastos-variables"),
  },
  filters: {
    estado: byId("filter-estado"),
    tipo: byId("filter-tipo"),
    fuente: byId("filter-fuente"),
    persona: byId("filter-persona"),
    q: byId("filter-q"),
    clear: byId("btn-clear-filters"),
  },
  modal: byId("modal-backdrop"),
  form: byId("form-egreso"),
  payModal: byId("pay-backdrop"),
  payForm: byId("form-pago"),
  especialModal: byId("especial-backdrop"),
  especialForm: byId("form-especial"),
  categoriasList: byId("categorias-list"),
  subcategoriasList: byId("subcategorias-list"),
  equipoList: byId("equipo-list"),
  mediosPagoList: byId("medios-pago-list"),
  proyectosList: byId("proyectos-list"),
  proveedoresList: byId("proveedores-list"),
};

const state = {
  user: null,
  unsubscribe: null,
  unsubscribeEspecial: null,
  unsubscribeFlujo: null,
  activeTab: "dashboard",
  activeMonth: monthKey(new Date()),
  activeYear: new Date().getFullYear(),
  egresos: [],
  especial: [],
  flujoEgresos: [],
};

const MANUAL_SPECIAL_SEED = [
  ...specialSeed("gasto_fijo", [
    ["Cuota Bancolombia","Bancarios","Cuota de manejo Bancolombia","Mensual","5","55472","Bancolombia",true,"Bancolombia M",true,"Musicala"],
    ["Cuota Davivienda","Bancarios","Cuota de manejo Davivienda","Mensual","5","6800","Davivienda",true,"Davivienda M",true,"Musicala"],
    ["Contabilidad","Contabilidad","Contabilidad","Mensual","1","1100000","In-plementar",false,"Bancolombia M",true,"Musicala"],
    ["Registro mercantil CCB","Licencias","Registro mercantil CCB","Anual","","831900","CCB",false,"Bancolombia M",true,"Musicala"],
    ["Jardinería","Reparaciones y mantenimiento","Jardinería","Mensual","5","25000","Antonio Camargo",false,"Efectivo",true,"Sede Pasadena"],
    ["Lavado de tanque","Reparaciones y mantenimiento","Tanque de agua","Semestral","05/05/26","273700","IF PLANING SAS",false,"Davivienda",true,"Sede Pasadena"],
    ["Mantenimiento de extintores","Reparaciones y mantenimiento","Recarga de extintores","Anual","","95000","EXTINTORES DISTRIBUIDOS DE FABRICA S A S",false,"",true,"Sede Pasadena"],
    ["Teleprotección","Seguros y alarmas","Teleprotección","Mensual","9","159815","Teleprotección",false,"Tarjeta C A",true,"Sede Pasadena"],
    ["Pago proveedores","Servicios generales","Aseo","Mensual","1","975000","Nancy Caballero Moreno",false,"Bancolombia M",true,"Sede Pasadena"],
    ["Internet","Servicios públicos","Internet Movistar","Mensual","10","140080","Movistar",true,"Tarjeta C A",true,"Sede Pasadena"],
    ["Celular Musicala","Servicios públicos","Celular Movistar Musicala","Mensual","12","45990","Movistar",true,"Tarjeta C A",true,"Musicala"],
    ["Celular Movistar Cata","Servicios públicos","Celular Movistar Musicala","Mensual","15","45990","Movistar",true,"Tarjeta C A",true,"Musicala"],
    ["Celular Movistar Alek","Servicios públicos","Celular Movistar Musicala","Mensual","15","45990","Movistar",true,"Tarjeta C A",true,"Musicala"],
    ["Enel Codensa","Servicios públicos","Enel Codensa","Mensual","1","400000","Enel Codensa",true,"Davivienda M",true,"Sede Pasadena"],
    ["Acueducto","Servicios públicos","Acueducto","Bimensual","1","200000","Acueducto",false,"Davivienda M",true,"Sede Pasadena"],
    ["SG-SST","SG SST","Safe Mode","Mensual","1","446250","Safe Mode SAS",false,"Bancolombia M",true,"Musicala"],
    ["Spotify","Software y plataformas digitales","Spotify","Mensual","23","26400","Spotify",true,"Tarjeta C A",true,"Musicala"],
    ["Disney+","Software y plataformas digitales","Disney+","Mensual","16","34900","Disney+",true,"Tarjeta C A",true,"Musicala"],
    ["Netflix","Software y plataformas digitales","Netflix","Mensual","30","44900","Netflix",true,"Tarjeta C A",true,"Musicala"],
    ["ChatGPT","Software y plataformas digitales","ChatGPT","Mensual","5","83993","OPENAI",true,"Tarjeta C A",true,"Musicala"],
    ["Wix","Software y plataformas digitales","Wix","Anual","22/05/26","1152000","Wix",true,"Tarjeta C A",true,"Musicala"],
    ["Dominio","Software y plataformas digitales","Dominio","Anual","10/05/26","155400","Wix",true,"Tarjeta C A",true,"Musicala"],
    ["Google One Alek","Software y plataformas digitales","Google One Alek","Mensual","","79000","Google One",true,"Tarjeta C A",false,"Musicala"],
    ["Google One Cata","Software y plataformas digitales","Google One Cata","Mensual","","79000","Google One",true,"Tarjeta C A",false,"Musicala"],
    ["Google One Musicala","Software y plataformas digitales","Google One Musicala","Mensual","","79000","Google One",true,"Tarjeta C A",true,"Musicala"],
    ["Star+","Software y plataformas digitales","Star+","Mensual","","","Star+",true,"Tarjeta C A",true,"Musicala"],
    ["Keybe","Software y plataformas digitales","Keybe","Mensual","","163785","Keybe",true,"Tarjeta C A",false,"Musicala"],
    ["Seguro general","Seguros","Seguros","Anual","","576689","Sura",false,"Tarjeta C A",true,"Musicala"],
    ["Seguro general","Seguros","Seguros","Anual","","1680993","Sura",false,"Tarjeta C A",true,"Sede Pasadena"],
    ["Google Ads","Diseño y publicidad","Google Ads","Mensual","1","","Google Ads",true,"Tarjeta C A",true,"Musicala"],
    ["Meta Ads","Diseño y publicidad","Meta Ads","Mensual","1","","Meta",true,"Tarjeta C A",true,"Musicala"],
    ["Tiktok ads","Diseño y publicidad","Tiktok ads","Mensual","1","","Tik tok",true,"Tarjeta C A",true,"Musicala"],
    ["Compra y mantenimiento de nuevos equipos","Instrumentos y equipos","Compra o mantenimiento de equipos","Bimensual","","1000000","",true,"",true,"Musicala"],
    ["Arrendamiento Pasadena","Arrendamiento","Arrendamiento Pasadena","Mensual","","4536291","",true,"Bancolombia",true,"Sede Pasadena"],
    ["Soraya Castro","Contabilidad","Contabilidad","Mensual","01/03/26","1091574","Soraya Castro",false,"Bancolombia",true,"Musicala"],
    ["Safe Mode","SG SST","Safe Mode","Mensual","01/03/26","307798","Safe Mode",true,"Tarjeta C A",true,"Musicala"],
  ]),
  ...specialSeed("gasto_variable", [
    ["Implementos de aseo","Aseo","Implementos de aseo","Bimensual","","","D1",false,"Tarjeta C A",true,"Sede Pasadena"],
    ["Impuesto 4x1000","Impuestos (predial, etc.)","Impuesto 4x1000","Mensual","","","",true,"",true,"Musicala"],
    ["Impuesto IVA","Impuestos (predial, etc.)","Impuesto IVA","Mensual","","","DIAN",true,"",true,"Musicala"],
    ["Impuesto Reteica","Impuestos (predial, etc.)","Impuesto Reteica","Bimensual","","","DIAN",false,"Tarjeta C A",true,"Musicala"],
    ["Impuesto Retefuente","Impuestos (predial, etc.)","Impuesto Retefuente","Mensual","","","DIAN",false,"Tarjeta C A",true,"Musicala"],
    ["ICA","Impuestos (predial, etc.)","ICA","Anual","","","Hacienda",false,"Tarjeta C A",true,"Musicala"],
    ["Declaración de renta","Impuestos (predial, etc.)","Declaración de renta","Anual","","","Hacienda",false,"Tarjeta C A",true,"Musicala"],
    ["Papelería","Otros gastos (especifique)","Papelería","Mensual","","","",false,"",true,"Sede Pasadena"],
    ["Materiales artes","Otros gastos (especifique)","Materiales artes","Mensual","","","",false,"",true,"Sede Pasadena"],
    ["Papelería","Otros gastos (especifique)","Papelería","Mensual","","","",false,"",true,"FSA"],
    ["Materiales artes","Otros gastos (especifique)","Materiales artes","Mensual","","","",false,"",true,"FSA"],
    ["Dotación","Nómina","Dotación","Trimestral","","","",false,"",true,""],
  ]),
];

const DEFAULT_CATALOG = {
  categorias: [
    ["Arrendamiento","Arrendamiento"],
    ["Nómina","Salario base"],["Nómina","Auxilio de transporte"],["Nómina","Bonificaciones"],["Nómina","Cesantías"],["Nómina","Intereses de cesantías"],["Nómina","Primas"],["Nómina","Miplanilla"],["Nómina","Salud"],["Nómina","Pensión"],["Nómina","ARL"],["Nómina","Caja de compensación"],["Nómina","Intereses por mora"],["Nómina","Dotación"],["Nómina","Incapacidades"],["Nómina","Aporte salud empleado"],["Nómina","Aporte pensión empleado"],
    ["Contabilidad","Contabilidad"],
    ["Aseo","Implementos de aseo"],
    ["Reparaciones y mantenimiento","Jardinería"],["Reparaciones y mantenimiento","Tanque de agua"],["Reparaciones y mantenimiento","Persianas"],["Reparaciones y mantenimiento","Lámparas"],["Reparaciones y mantenimiento","Cojines y fundas"],
    ["Seguros y alarmas","Vigilancia"],["Seguros y alarmas","Teleprotección"],["Seguros y alarmas","Seguros"],
    ["Servicios públicos","Internet Movistar"],["Servicios públicos","Enel Codensa"],["Servicios públicos","Acueducto"],["Servicios públicos","Celular Movistar Musicala"],["Servicios públicos","Celular Movistar Alek"],["Servicios públicos","Celular Movistar Cata"],
    ["SG SST","One Soluciones"],
    ["Software y plataformas digitales","Wix"],["Software y plataformas digitales","Dominio"],["Software y plataformas digitales","Google One Alek"],["Software y plataformas digitales","Google One Cata"],["Software y plataformas digitales","Google One Musicala"],["Software y plataformas digitales","Zoom"],["Software y plataformas digitales","ChatGPT"],["Software y plataformas digitales","Spotify"],["Software y plataformas digitales","Netflix"],["Software y plataformas digitales","Disney+"],["Software y plataformas digitales","Star+"],["Software y plataformas digitales","Keybe"],
    ["Bancarios","Cuota de manejo Bancolombia"],["Bancarios","Cuota de manejo Davivienda"],["Bancarios","Comisiones de pago"],["Bancarios","Comisiones de email"],["Bancarios","Comisión Bold"],["Bancarios","Comisión Nequi"],["Bancarios","Tarjeta de crédito"],
    ["Créditos y Préstamos","Crédito de libre inversión"],["Créditos y Préstamos","Préstamo Sumetlum"],["Créditos y Préstamos","Transferencia Musicala"],
    ["Licencias","Bomberos"],["Licencias","SAYCO"],
    ["Impuestos (predial, etc.)","Impuesto 4x1000"],["Impuestos (predial, etc.)","Impuesto IVA"],["Impuestos (predial, etc.)","Impuesto Reteica"],["Impuestos (predial, etc.)","Impuesto Retefuente"],["Impuestos (predial, etc.)","ICA"],["Impuestos (predial, etc.)","Declaración de renta"],
    ["Pago Proveedores","Pago Proveedores"],
    ["Diseño y publicidad","Diseño gráfico"],["Diseño y publicidad","Publicidad"],["Diseño y publicidad","Marketing"],["Diseño y publicidad","Google Ads"],["Diseño y publicidad","Tik Tok"],["Diseño y publicidad","Facebook"],["Diseño y publicidad","Community manager"],
    ["Transporte","Transporte"],["Legal","Legal"],["Reclutamiento","Reclutamiento"],
    ["Instrumentos y equipos","Instrumentos y equipos"],["Herramientas audiovisuales","Herramientas audiovisuales"],["Acústica","Acústica"],
    ["Salarios Docentes prestación","Bonificación Profesor"],
    ["Otros gastos (especifique)","Otros gastos"],
  ],
  equipo: [
    "Andrea Catalina Medina Leal","Jimmy Alexander Caballero Moreno","Angie Camila Rodríguez Torres","Natalia Alarcón","Emily Bejarano","Laura Sánchez","Thalia Sarmiento","Brenda Tatiana Giraldo Leyton","Yusting Camila Granados Cortés","Daniela Camelo Arévalo","Leydy Jhoana Díaz Salas","Maria Camila Pirajan Gutiérrez","Santiago Gutierrez Fonseca",
  ],
  mediosPago: ["Efectivo","Bancolombia M","Davivienda M","Bold","Nequi","Tarjeta de crédito","Transferencia"],
  proyectos: ["Musicala","FSA","Musicafé","Eventos"],
};

init();

function init(){
  if (new URLSearchParams(location.search).get("embedded") === "1") {
    document.body.classList.add("embedded");
  }
  try{
    state.activeTab = localStorage.getItem(TAB_KEY) || state.activeTab;
    if (state.activeTab === "especial" || state.activeTab === "obligaciones") state.activeTab = "gastos-fijos";
    const savedMonth = localStorage.getItem(MONTH_KEY);
    if (savedMonth) {
      state.activeMonth = savedMonth;
      state.activeYear = Number(savedMonth.slice(0, 4)) || state.activeYear;
    }
  }catch{}

  fillSelect(els.filters.estado, ["__active", "", ...ESTADOS_EGRESO], "Mes activo");
  fillSelect(els.filters.tipo, ["", ...TIPOS_EGRESO], "Todos los tipos");
  fillSelect(els.filters.fuente, ["", ...FUENTES_EGRESO], "Todas las fuentes");
  fillSelect(els.form.estado, ESTADOS_EGRESO);
  fillSelect(els.form.tipo, TIPOS_EGRESO);
  fillSelect(els.form.fuente, FUENTES_EGRESO);

  els.tabs().forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  Object.values(els.filters).forEach(el => {
    if (el && el !== els.filters.clear) el.addEventListener("input", renderAll);
  });
  els.filters.clear.addEventListener("click", clearFilters);
  els.login.addEventListener("click", () => loginWithGoogle().catch(showError));
  els.logout.addEventListener("click", () => logout().catch(showError));
  els.nuevo.addEventListener("click", () => openEgreso());
  byId("btn-cerrar").addEventListener("click", closeEgreso);
  byId("btn-cancelar").addEventListener("click", closeEgreso);
  byId("btn-cerrar-pay").addEventListener("click", closePago);
  byId("btn-cancelar-pay").addEventListener("click", closePago);
  byId("btn-cerrar-especial").addEventListener("click", closeEspecial);
  byId("btn-cancelar-especial").addEventListener("click", closeEspecial);
  els.modal.addEventListener("click", e => { if (e.target === els.modal) closeEgreso(); });
  els.payModal.addEventListener("click", e => { if (e.target === els.payModal) closePago(); });
  els.especialModal.addEventListener("click", e => { if (e.target === els.especialModal) closeEspecial(); });
  els.form.addEventListener("submit", onSaveEgreso);
  els.payForm.addEventListener("submit", onSavePago);
  els.especialForm.addEventListener("submit", onSaveEspecial);
  ["categoria", "subcategoria", "persona", "proveedor"].forEach(name => {
    els.form.elements[name]?.addEventListener("change", applyEgresoSmartDefaults);
    els.form.elements[name]?.addEventListener("input", applyEgresoSmartDefaults);
  });

  renderMonths();
  setTab("dashboard");
  listenAuth(user => {
    state.user = user;
    els.login.classList.toggle("hidden", !!user);
    els.logout.classList.toggle("hidden", !user);
    els.user.textContent = user ? (user.displayName || user.email || "SesiÃ³n activa") : "";
    subscribeMonth();
    subscribeFlujo();
    subscribeEspecial();
  });
}

function subscribeMonth(){
  if (state.unsubscribe) state.unsubscribe();
  if (!state.user){
    state.egresos = [];
    setStatus("Inicia sesiÃ³n con Google para ver Firestore.", true);
    renderAll();
    return;
  }
  setStatus("Escuchando " + state.activeMonth + "...");
  state.unsubscribe = listenEgresosPeriodoTodos(state.activeMonth, rows => {
    state.egresos = rows;
    updateCategoryLists();
    setStatus("Sincronizado con Firebase");
    renderAll();
  }, showError);
}

function subscribeFlujo(){
  if (state.unsubscribeFlujo) state.unsubscribeFlujo();
  if (!state.user){
    state.flujoEgresos = [];
    renderAll();
    return;
  }
  state.unsubscribeFlujo = listenFlujoEgresos(state.activeMonth, rows => {
    state.flujoEgresos = rows;
    renderAll();
  }, showError);
}

function subscribeEspecial(){
  if (state.unsubscribeEspecial) state.unsubscribeEspecial();
  if (!state.user){
    state.especial = [];
    updateCategoryLists();
    renderAll();
    return;
  }
  state.unsubscribeEspecial = listenEgresosEspecial(rows => {
    state.especial = rows;
    updateCategoryLists();
    renderAll();
  }, showError);
}

function setTab(tab){
  state.activeTab = tab || "dashboard";
  try{ localStorage.setItem(TAB_KEY, state.activeTab); }catch{}
  els.tabs().forEach(b => b.setAttribute("aria-selected", b.dataset.tab === state.activeTab ? "true" : "false"));
  Object.entries(els.sections).forEach(([k, el]) => el.classList.toggle("hidden", k !== state.activeTab));
  renderAll();
}

function renderMonths(){
  const y = state.activeYear;
  els.monthMenu.innerHTML = `
    <button class="month-chip year-nav" data-year="-1" type="button"><div class="m-main">< ${y - 1}</div><div class="m-sub">AÃ±o anterior</div></button>
    ${MESES.map(([m, label]) => {
      const key = `${y}-${m}`;
      return `<button class="month-chip" data-month="${key}" type="button"><div class="m-main">${label}</div><div class="m-sub">${key}</div></button>`;
    }).join("")}
    <button class="month-chip year-nav" data-year="1" type="button"><div class="m-main">${y + 1} ></div><div class="m-sub">AÃ±o siguiente</div></button>
  `;
  $$("[data-month]", els.monthMenu).forEach(btn => btn.addEventListener("click", () => {
    state.activeMonth = btn.dataset.month;
    state.activeYear = Number(state.activeMonth.slice(0, 4));
    try{ localStorage.setItem(MONTH_KEY, state.activeMonth); }catch{}
    renderMonths();
    subscribeMonth();
    subscribeFlujo();
  }));
  $$("[data-year]", els.monthMenu).forEach(btn => btn.addEventListener("click", () => {
    state.activeYear += Number(btn.dataset.year);
    state.activeMonth = `${state.activeYear}-${state.activeMonth.slice(5, 7)}`;
    try{ localStorage.setItem(MONTH_KEY, state.activeMonth); }catch{}
    renderMonths();
    subscribeMonth();
    subscribeFlujo();
  }));
  $$("[data-month]", els.monthMenu).forEach(btn => btn.classList.toggle("active", btn.dataset.month === state.activeMonth));
}

function filteredRows(){
  const f = {
    estado: els.filters.estado.value,
    tipo: els.filters.tipo.value,
    fuente: els.filters.fuente.value,
    persona: norm(els.filters.persona.value),
    q: norm(els.filters.q.value),
  };
  return state.egresos.filter(row => {
    if (row.visible === false || row.archivado === true) return false;
    if (f.estado === "__active" && !ESTADOS_MES_ACTIVO.includes(row.estado)) return false;
    if (f.estado && f.estado !== "__active" && row.estado !== f.estado) return false;
    if (f.tipo && row.tipo !== f.tipo) return false;
    if (f.fuente && row.fuente !== f.fuente) return false;
    if (f.persona && !norm(row.persona).includes(f.persona)) return false;
    if (f.q){
      const haystack = norm([row.persona, row.proveedor, row.concepto, row.categoria, row.subcategoria, row.observaciones, row.referenciaPago].join(" "));
      if (!haystack.includes(f.q)) return false;
    }
    return true;
  });
}

function renderAll(){
  const rows = filteredRows();
  const pendientes = rows.filter(isPendingWithoutMovement);
  renderDashboard(rows);
  renderTable("pendientes", pendientes, "Pendientes", "Egresos abiertos que todavía no tienen un movimiento de flujo asociado.");
  renderTable("egresos", rows, "Movimientos");
  renderConciliacion();
  renderTable("nomina", rows.filter(isNomina), "Nómina");
  renderTable("proveedores", rows.filter(isProveedor), "Proveedores");
  renderRecurringGroup("gastos-fijos", rows.filter(isGastoFijo), "Gastos fijos");
  renderRecurringGroup("gastos-variables", rows.filter(isGastoVariable), "Gastos variables");
}

function renderDashboard(rows){
  const totalAprobado = sum(rows, "valorAprobado");
  const totalPagado = sum(rows, "valorPagado");
  const saldo = Math.max(0, totalAprobado - totalPagado);
  const vencidos = rows.filter(r => r.fechaVencimiento && r.fechaVencimiento < todayIso() && !["pagado", "conciliado"].includes(r.estado)).length;
  els.sections.dashboard.innerHTML = `
    <h2 class="month-title">Dashboard mensual Â· ${state.activeMonth}</h2>
    <p class="month-sub">KPIs calculados sobre egresos visibles del periodo seleccionado.</p>
    <div class="kpis">
      ${kpi("Aprobado", money(totalAprobado))}
      ${kpi("Pagado", money(totalPagado))}
      ${kpi("Saldo", money(saldo))}
      ${kpi("Vencidos", vencidos)}
    </div>
    ${rows.length ? table(rows.slice(0, 8), true) : empty("No hay egresos para este mes.")}
  `;
}

function renderTable(section, rows, title, subtitle = ""){
  els.sections[section].innerHTML = `
    <div class="card-head">
      <div>
        <h2 class="month-title">${title} Â· ${state.activeMonth}</h2>
        <p class="month-sub">${subtitle ? `${esc(subtitle)} Â· ` : ""}${rows.length} registros</p>
      </div>
      <button class="btn primary" data-new type="button">Nuevo egreso</button>
    </div>
    ${rows.length ? table(rows) : empty("No hay registros con los filtros actuales.")}
  `;
  els.sections[section].querySelector("[data-new]")?.addEventListener("click", () => openEgreso());
}

function isPendingWithoutMovement(row){
  if (!["pendiente", "en_revision", "aprobado", "pagado_parcial"].includes(row.estado)) return false;
  return !hasAssociatedMovement(row);
}

function hasAssociatedMovement(row){
  return (Array.isArray(row.flujoTxIds) && row.flujoTxIds.length > 0)
    || (Array.isArray(row.flujoMovimientos) && row.flujoMovimientos.length > 0)
    || Number(row.valorConciliado || 0) > 0
    || row.origenApp === "Flujo de Caja";
}

function isNomina(row){
  if (norm(row.tipo) === "prestacion_docente") return false;
  const text = norm([row.tipo, row.fuente, row.categoria, row.subcategoria].join(" "));
  return text.includes("nomina") || text.includes("salarios docentes") || text.includes("docentes prestacion");
}

function isProveedor(row){
  const text = norm([row.tipo, row.fuente].join(" "));
  return text.includes("prestacion_docente") || text.includes("proveedor") || text.includes("cuentas_cobro") || text.includes("cuentas cobro");
}

function isGastoFijo(row){
  const text = norm([row.tipo, row.fuente, row.categoria, row.subcategoria, row.concepto].join(" "));
  return text.includes("gasto_fijo") || text.includes("gasto fijo") || ["contabilidad", "aseo", "sg sst", "arrendamiento", "internet", "vigilancia"].some(x => text.includes(x));
}

function isGastoVariable(row){
  return !isNomina(row) && !isProveedor(row) && !isGastoFijo(row);
}

function renderRecurringGroup(section, rows, title){
  const specialRows = specialRowsForSection(section);
  const patterns = recurringPatterns([...state.especial, ...state.egresos]).filter(p => {
    if (section === "gastos-fijos") return p.kind === "fijo";
    return p.kind === "variable";
  });
  els.sections[section].innerHTML = `
    <div class="card-head">
      <div>
        <h2 class="month-title">${title} · ${state.activeMonth}</h2>
        <p class="month-sub">${specialRows.length} obligaciones configuradas · ${rows.length} registros del mes · ${patterns.length} patrones repetidos</p>
      </div>
      <div class="actions">
        <button class="btn" data-special-new="${section === "gastos-fijos" ? "gasto_fijo" : "gasto_variable"}" type="button">Nuevo ${section === "gastos-fijos" ? "gasto fijo" : "gasto variable"}</button>
        <button class="btn" data-special-import type="button">Importar configuración</button>
        <button class="btn primary" data-new type="button">Nuevo egreso</button>
      </div>
    </div>
    ${specialRows.length ? specialEditableTable(specialRows) : empty("No hay obligaciones configuradas en esta sección. Puedes crear una con el botón Nuevo.")}
    ${patterns.length ? recurringTable(patterns) : empty("Sin patrones repetidos por ahora. Cuando un gasto se repita mas de 2 veces, aparecera aqui.")}
    ${rows.length ? table(rows) : empty("No hay registros con los filtros actuales.")}
  `;
  els.sections[section].querySelector("[data-new]")?.addEventListener("click", () => openEgreso());
}

function specialRowsForSection(section){
  const tipo = section === "gastos-fijos" ? "gasto_fijo" : "gasto_variable";
  return state.especial
    .filter(row => row.tipoRegistro === tipo && row.visible !== false && row.archivado !== true)
    .sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false)
      || String(a.categoria || "").localeCompare(String(b.categoria || ""), "es")
      || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
}

function specialEditableTable(rows){
  return `
    <div class="table-wrap especial-table">
      <table>
        <thead><tr>
          <th>Activa</th><th>Obligación</th><th>Categoría</th><th>Frecuencia</th><th>Día</th><th>Valor</th><th>Proveedor</th><th>Automático</th><th>Cuenta</th><th>Proyecto</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.activo === false ? "is-inactive" : ""}">
              <td>${row.activo === false ? badge("no") : badge("sí")}</td>
              <td><strong>${esc(row.obligacion || row.nombre || "-")}</strong></td>
              <td>${esc(row.categoria || "-")}<div class="muted small">${esc(row.subcategoria || "")}</div></td>
              <td>${esc(row.frecuencia || "-")}</td>
              <td>${esc(row.diaSugeridoIso || row.diaSugerido || "-")}</td>
              <td>${money(row.valorSugerido || row.valorFinal || row.valorCuentaCobro || row.valor)}</td>
              <td>${esc(row.proveedor || "-")}</td>
              <td>${row.automatico ? "Sí" : "No"}</td>
              <td>${esc(row.cuentaBancaria || "-")}</td>
              <td>${esc(row.proyecto || "-")}</td>
              <td class="actions"><button class="btn small-btn" data-special-edit="${row.id}" type="button">Editar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function recurringPatterns(rows){
  const groups = groupBy(rows.filter(r => r.visible !== false && r.archivado !== true), recurrenceKey);
  return Object.values(groups)
    .map(items => {
      const valid = items.filter(r => r.periodo || r.mesTexto || r.fechaVencimiento);
      if (valid.length <= 2) return null;
      const sample = valid[0];
      const periods = unique(valid.map(periodOf).filter(Boolean)).sort();
      const amounts = valid.map(amountOf).filter(n => n > 0);
      const avg = amounts.reduce((a, n) => a + n, 0) / Math.max(amounts.length, 1);
      const gaps = periods.slice(1).map((p, i) => monthIndex(p) - monthIndex(periods[i])).filter(n => n > 0);
      const every = Math.round(gaps.reduce((a, n) => a + n, 0) / Math.max(gaps.length, 1)) || 1;
      return {
        key: recurrenceKey(sample),
        sample,
        count: valid.length,
        periods,
        every: every >= 2 ? 2 : 1,
        avg,
        kind: isGastoFijo(sample) ? "fijo" : "variable",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "es"));
}

function recurringTable(patterns){
  return `
    <div class="table-wrap recurring-table">
      <table>
        <thead><tr><th>Patron</th><th>Frecuencia</th><th>Repeticiones</th><th>Promedio</th><th>Meses vistos</th><th>Acciones</th></tr></thead>
        <tbody>
          ${patterns.map(p => `
            <tr>
              <td><strong>${esc(p.sample.nombre || p.sample.persona || p.sample.proveedor || p.sample.concepto || "Gasto")}</strong><div class="muted small">${esc(p.sample.categoria || "")} ${esc(p.sample.subcategoria || "")}</div></td>
              <td>${p.every === 2 ? "Bimensual" : "Mensual"}</td>
              <td>${p.count}</td>
              <td>${money(p.avg)}</td>
              <td>${esc(p.periods.join(", "))}</td>
              <td class="actions"><button class="btn primary" data-create-recurring="${esc(p.key)}" type="button">Crear siguiente</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function recurrenceKey(row){
  return norm([row.nombre || row.persona || row.proveedor || row.concepto, row.categoria, row.subcategoria].join("|"));
}

function periodOf(row){
  if (row.periodo) return String(row.periodo).slice(0, 7);
  if (row.fechaVencimiento) return String(row.fechaVencimiento).slice(0, 7);
  return monthTextToPeriod(row.mesTexto || row.mes || "", row.anio || new Date().getFullYear());
}

function amountOf(row){
  return Number(row.valorAprobado || row.valorCalculado || row.valorFinal || row.valorCuentaCobro || row.valorSugerido || row.valor || 0);
}

function monthIndex(period){
  const [y, m] = String(period).split("-").map(Number);
  return y * 12 + m;
}

function monthTextToPeriod(month, year){
  const names = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const i = names.indexOf(norm(month));
  return i < 0 ? "" : `${year}-${String(i + 1).padStart(2, "0")}`;
}

function renderConciliacion(){
  const egresos = state.egresos.filter(r => r.visible !== false && r.archivado !== true);
  const flujo = state.flujoEgresos;

  const txToEgreso = new Map();
  egresos.forEach(e => (e.flujoTxIds || []).forEach(id => txToEgreso.set(id, e)));

  const abiertos = egresos.filter(e => !["anulado", "no_aplica", "archivado"].includes(e.estado));
  const egresosSinMov = abiertos.filter(e => !hasAssociatedMovement(e));
  const conciliados = flujo.filter(tx => txToEgreso.has(tx.id));
  const sinEgreso = flujo.filter(tx => !txToEgreso.has(tx.id));

  const totalFlujo = sum(flujo, "monto");
  const totalConc = sum(conciliados, "monto");
  const pct = totalFlujo ? Math.round((totalConc / totalFlujo) * 100) : 0;

  els.sections.conciliacion.innerHTML = `
    <div class="card-head">
      <div>
        <h2 class="month-title">ConciliaciÃ³n con flujo de caja Â· ${state.activeMonth}</h2>
        <p class="month-sub">Cada egreso del flujo de caja debe corresponder a un egreso en seguimiento. Vincula o crea el egreso desde aquÃ­.</p>
      </div>
    </div>
    <div class="kpis">
      ${kpi("Movimientos flujo", flujo.length)}
      ${kpi("Conciliado", money(totalConc))}
      ${kpi("% conciliado", pct + "%")}
      ${kpi("Sin egreso", sinEgreso.length)}
    </div>
    <h3 class="conc-h3">Movimientos de flujo de caja sin egreso (${sinEgreso.length})</h3>
    ${sinEgreso.length ? flujoTable(sinEgreso, abiertos) : empty("Todos los egresos del flujo de este mes estÃ¡n conciliados.")}
    <h3 class="conc-h3">Movimientos conciliados (${conciliados.length})</h3>
    ${conciliados.length ? conciliadosTable(conciliados, txToEgreso) : empty("AÃºn no hay movimientos conciliados este mes.")}
    <h3 class="conc-h3">Egresos esperados sin salida en flujo (${egresosSinMov.length})</h3>
    ${egresosSinMov.length ? esperadosTable(egresosSinMov) : empty("No hay egresos esperados pendientes de salir.")}
  `;
}

function flujoTable(txs, candidatos){
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Fecha</th><th>DescripciÃ³n</th><th>Medio</th><th>Monto</th><th>Vincular a egreso</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${txs.map(tx => {
            const sugerido = matchEgreso(tx, candidatos);
            const options = candidatos.map(e => `<option value="${esc(e.id)}"${sugerido && sugerido.id === e.id ? " selected" : ""}>${esc(concLabel(e))}</option>`).join("");
            return `
            <tr>
              <td>${esc(tx.fecha || "-")}</td>
              <td>${esc(tx.descripcion || tx.categoria || "-")}</td>
              <td>${esc(tx.metodo || "-")}</td>
              <td>${money(tx.monto)}</td>
              <td>${candidatos.length
                ? `<select class="conc-select" data-link-select="${esc(tx.id)}"><option value="">â€” elegir egreso â€”</option>${options}</select>${sugerido ? `<div class="muted small">Sugerido por monto/fecha</div>` : ""}`
                : `<span class="muted small">Sin egresos abiertos</span>`}</td>
              <td class="actions">
                <button class="btn" data-link-tx="${esc(tx.id)}" type="button">Vincular</button>
                <button class="btn primary" data-create-from="${esc(tx.id)}" type="button">Crear egreso</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function conciliadosTable(txs, txToEgreso){
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>DescripciÃ³n</th><th>Monto</th><th>Egreso</th><th>Acciones</th></tr></thead>
        <tbody>
          ${txs.map(tx => {
            const e = txToEgreso.get(tx.id);
            return `
            <tr>
              <td>${esc(tx.fecha || "-")}</td>
              <td>${esc(tx.descripcion || tx.categoria || "-")}</td>
              <td>${money(tx.monto)}</td>
              <td>${badge(e.estado)} ${esc(concLabel(e))}</td>
              <td class="actions"><button class="btn danger" data-unlink="${esc(e.id)}|${esc(tx.id)}" type="button">Desvincular</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function esperadosTable(egresos){
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Estado</th><th>Concepto</th><th>Persona / proveedor</th><th>Vence</th><th>Aprobado</th></tr></thead>
        <tbody>
          ${egresos.map(e => `
            <tr>
              <td>${badge(e.estado)}</td>
              <td>${esc(e.concepto || "-")}</td>
              <td>${esc(e.persona || e.proveedor || "-")}</td>
              <td>${esc(e.fechaVencimiento || "-")}</td>
              <td>${money(e.valorAprobado || e.valorCalculado)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function concLabel(e){
  return `${e.concepto || e.persona || e.proveedor || "Egreso"} Â· ${money(e.valorAprobado || e.valorCalculado)}`;
}

// Sugiere el egreso abierto que mejor coincide con un movimiento de flujo:
// mismo monto (Â±2%), fecha cercana y medio de pago parecido.
function matchEgreso(tx, candidatos){
  const monto = Number(tx.monto || 0);
  const fecha = tx.fecha || "";
  let best = null, bestScore = -1;
  for (const e of candidatos){
    const valor = Number(e.valorAprobado || e.valorCalculado || 0);
    if (!valor) continue;
    const conciliado = Number(e.valorConciliado || 0);
    if ((e.flujoTxIds || []).length && conciliado >= valor) continue;
    const diff = Math.abs(valor - monto) / Math.max(valor, monto, 1);
    if (diff > 0.02) continue;
    let score = 1 - diff;
    const ref = e.fechaPago || e.fechaVencimiento || "";
    if (ref && fecha){
      const days = Math.abs(daysBetween(ref, fecha));
      if (days <= 10) score += (10 - days) / 10;
    }
    if (tx.metodo && e.medioPago && norm(e.medioPago).includes(norm(tx.metodo).slice(0, 4))) score += 0.3;
    if (score > bestScore){ bestScore = score; best = e; }
  }
  return best;
}

function daysBetween(a, b){
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function renderEspecial(){
  const rows = state.especial;
  const categorias = rows.filter(r => r.tipoRegistro === "categoria" && r.activo !== false);
  const fijos = rows.filter(r => r.tipoRegistro === "gasto_fijo" && r.activo !== false);
  const variables = rows.filter(r => r.tipoRegistro === "gasto_variable" && r.activo !== false);
  const proveedores = rows.filter(r => r.tipoRegistro === "proveedor" && r.activo !== false);
  els.sections.especial.innerHTML = `
    <div class="card-head">
      <div>
        <h2 class="month-title">Especial seguimiento egresos 2026</h2>
        <p class="month-sub">${rows.length} registros en seguimiento_egresos_especial Â· semilla Excel: ${EGRESOS_ESPECIALES_SEED_META.totalRows}</p>
      </div>
      <div class="actions">
        <button class="btn" data-special-new type="button">Nuevo especial</button>
        <button class="btn primary" data-special-import type="button">Importar Excel 2026</button>
      </div>
    </div>
    <div class="kpis">
      ${kpi("CategorÃ­as", categorias.length)}
      ${kpi("Gastos fijos", money(sum(fijos, "valorSugerido")))}
      ${kpi("Variables", variables.length)}
      ${kpi("Proveedores", money(sum(proveedores, "valorFinal")))}
    </div>
    ${categoryMatrix(categorias)}
    ${especialTable(rows)}
  `;
}

function categoryMatrix(rows){
  const groups = groupBy(rows, row => row.categoria || "Sin categorÃ­a");
  return `
    <div class="category-board">
      ${Object.entries(groups).map(([categoria, items]) => `
        <div class="category-column">
          <h3>${esc(categoria)}</h3>
          <div class="badges">${items.map(item => `<button class="badge" data-special-edit="${item.id}" type="button">${esc(item.subcategoria || item.nombre)}</button>`).join("")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function especialTable(rows){
  if (!rows.length) return empty("AÃºn no hay datos especiales. Importa el Excel 2026 para iniciar.");
  return `
    <div class="table-wrap especial-table">
      <table>
        <thead><tr>
          <th>Tipo</th><th>CategorÃ­a</th><th>Nombre</th><th>Frecuencia</th><th>Valor</th><th>Origen</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.activo === false ? "is-inactive" : ""}">
              <td>${badge(row.tipoRegistro)}</td>
              <td><strong>${esc(row.categoria || "-")}</strong><div class="muted small">${esc(row.subcategoria || "")}</div></td>
              <td>${esc(row.nombre || row.proveedor || row.concepto || "-")}<div class="muted small">${esc(row.proveedor || row.periodo || "")}</div></td>
              <td>${esc(row.frecuencia || row.diaSugeridoIso || row.mesTexto || "-")}</td>
              <td>${money(row.valorSugerido || row.valorFinal || row.valorCuentaCobro || row.valor)}</td>
              <td>${esc(row.origenHoja || "-")}</td>
              <td class="actions"><button class="btn small-btn" data-special-edit="${row.id}" type="button">Editar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function table(rows, compact = false){
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Estado</th><th>Tipo</th><th>Fuente</th><th>Persona / proveedor</th><th>Concepto</th><th>Proyecto</th>
          <th>Vence</th><th>Aprobado</th><th>Pagado</th>${compact ? "" : "<th>Acciones</th>"}
        </tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${badge(row.estado)}</td>
              <td>${esc(row.tipo)}</td>
              <td>${esc(row.fuente)}</td>
              <td><strong>${esc(row.persona || row.proveedor || "-")}</strong></td>
              <td>${esc(row.concepto || "-")}<div class="muted small">${esc(row.categoria || "")} ${esc(row.subcategoria || "")}</div></td>
              <td>${esc(row.proyecto || "-")}</td>
              <td>${esc(row.fechaVencimiento || "-")}</td>
              <td>${money(row.valorAprobado || row.valorCalculado)}</td>
              <td>${money(row.valorPagado)}</td>
              ${compact ? "" : `<td class="actions">
                <button class="btn" data-edit="${row.id}" type="button">Editar</button>
                <button class="btn" data-pay="${row.id}" type="button">Pagar</button>
                <button class="btn" data-conciliar="${row.id}" type="button">Conciliar</button>
                <button class="btn" data-archivar="${row.id}" type="button">Archivar</button>
                <button class="btn danger" data-anular="${row.id}" type="button">Anular</button>
              </td>`}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

document.addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]")?.dataset.edit;
  const pay = e.target.closest("[data-pay]")?.dataset.pay;
  const conciliar = e.target.closest("[data-conciliar]")?.dataset.conciliar;
  const archivar = e.target.closest("[data-archivar]")?.dataset.archivar;
  const anular = e.target.closest("[data-anular]")?.dataset.anular;
  if (edit) openEgreso(state.egresos.find(r => r.id === edit));
  if (pay) openPago(state.egresos.find(r => r.id === pay));
  if (conciliar) conciliarEgreso(conciliar, state.user).catch(showError);
  if (archivar) archivarEgreso(archivar, state.user).catch(showError);
  if (anular) anularEgreso(anular, state.user).catch(showError);

  const specialEdit = e.target.closest("[data-special-edit]")?.dataset.specialEdit;
  if (specialEdit) openEspecial(state.especial.find(r => r.id === specialEdit));
  const specialNew = e.target.closest("[data-special-new]")?.dataset.specialNew;
  if (specialNew !== undefined) openEspecial(null, specialNew || null);
  if (e.target.closest("[data-special-import]")) onImportEspecial();

  const linkTx = e.target.closest("[data-link-tx]")?.dataset.linkTx;
  if (linkTx){
    if (!state.user) return setStatus("Inicia sesiÃ³n para conciliar.", true);
    const select = document.querySelector(`[data-link-select="${cssEscape(linkTx)}"]`);
    const egresoId = select?.value;
    const tx = state.flujoEgresos.find(t => t.id === linkTx);
    if (!egresoId) return setStatus("Elige un egreso para vincular.", true);
    if (tx) vincularFlujoEgreso(egresoId, tx, state.user).then(() => setStatus("Movimiento conciliado")).catch(showError);
  }

  const createFrom = e.target.closest("[data-create-from]")?.dataset.createFrom;
  if (createFrom){
    if (!state.user) return setStatus("Inicia sesiÃ³n para conciliar.", true);
    const tx = state.flujoEgresos.find(t => t.id === createFrom);
    if (tx) crearEgresoDesdeFlujo(tx, state.user, state.activeMonth).then(() => setStatus("Egreso creado y conciliado")).catch(showError);
  }

  const unlink = e.target.closest("[data-unlink]")?.dataset.unlink;
  if (unlink){
    if (!state.user) return setStatus("Inicia sesiÃ³n para conciliar.", true);
    const [egresoId, txId] = unlink.split("|");
    desvincularFlujoEgreso(egresoId, txId, state.user).then(() => setStatus("VÃ­nculo deshecho")).catch(showError);
  }

  const recurringKey = e.target.closest("[data-create-recurring]")?.dataset.createRecurring;
  if (recurringKey) createNextRecurring(recurringKey).catch(showError);
});

function cssEscape(value){
  return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

async function createNextRecurring(key){
  if (!state.user) return setStatus("Inicia sesión para crear egresos.", true);
  const pattern = recurringPatterns([...state.especial, ...state.egresos]).find(p => p.key === key);
  if (!pattern) return setStatus("No encontré el patrón recurrente.", true);
  const last = pattern.periods[pattern.periods.length - 1] || state.activeMonth;
  const target = addMonths(last, pattern.every);
  const exists = state.egresos.some(r => periodOf(r) === target && recurrenceKey(r) === key);
  if (exists) return setStatus(`Ya existe un egreso para ${target}.`, true);
  const s = pattern.sample;
  const amount = Math.round(pattern.avg || amountOf(s) || 0);
  const data = {
    periodo: target,
    estado: "pendiente",
    tipo: isNomina(s) ? "nomina" : isProveedor(s) ? "proveedor" : "obligacion",
    fuente: s.fuente || s.origenHoja || "recurrente",
    persona: s.persona || s.nombre || "",
    proveedor: s.proveedor || s.nombre || "",
    concepto: s.concepto || s.nombre || s.proveedor || s.persona || "Egreso recurrente",
    categoria: s.categoria || "",
    subcategoria: s.subcategoria || "",
    proyecto: s.proyecto || "",
    valorCalculado: amount,
    valorAprobado: amount,
    fechaVencimiento: suggestedDate(target, s.fechaVencimiento || s.diaSugeridoIso || s.diaSugerido),
    medioPago: s.medioPago || "",
    observaciones: `Creado automáticamente por repetición ${pattern.every === 2 ? "bimensual" : "mensual"} (${pattern.count} registros previos).`,
  };
  await crearEgreso(data, state.user, target);
  setStatus(`Egreso recurrente creado para ${target}`);
}

function addMonths(period, count){
  const [y, m] = String(period).split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function suggestedDate(period, source){
  const day = String(source || "").match(/\b([0-2]?\d|3[01])\b/)?.[1] || "01";
  return `${period}-${String(Math.min(Number(day), 28)).padStart(2, "0")}`;
}

function openEgreso(row = null){
  if (!state.user) return setStatus("Inicia sesiÃ³n para editar.", true);
  els.form.reset();
  fillSelect(els.form.estado, ESTADOS_EGRESO);
  fillSelect(els.form.tipo, TIPOS_EGRESO);
  fillSelect(els.form.fuente, FUENTES_EGRESO);
  const data = row || { periodo: state.activeMonth, estado: "pendiente", tipo: "proveedor", fuente: "manual", prioridad: "media", proyecto: "Musicala", valorPagado: 0 };
  Object.entries(data).forEach(([k, v]) => {
    if (els.form.elements[k]) els.form.elements[k].value = v ?? "";
  });
  els.form.elements.id.value = row?.id || "";
  applyEgresoSmartDefaults();
  els.modal.classList.add("open");
}

function applyEgresoSmartDefaults(){
  const f = els.form.elements;
  if (!f) return;
  const categoria = f.categoria?.value || "";
  const subcategoria = f.subcategoria?.value || "";
  const matchBySub = DEFAULT_CATALOG.categorias.find(([, sub]) => norm(sub) === norm(subcategoria));
  const matchByCat = DEFAULT_CATALOG.categorias.find(([cat]) => norm(cat) === norm(categoria));
  if (!categoria && matchBySub && f.categoria) f.categoria.value = matchBySub[0];
  if (categoria && !subcategoria && matchByCat && f.subcategoria) f.subcategoria.value = matchByCat[1];

  const cat = norm(f.categoria?.value);
  const sub = norm(f.subcategoria?.value);
  if (cat === "nomina") {
    setSelectSmart(f.tipo, "nomina", ["", "proveedor", "otro", "gasto_variable", "gasto_fijo"]);
    setSelectSmart(f.fuente, "nomina", ["", "manual", "proveedores", "gastos_variables", "gastos_fijos"]);
  } else if (cat === "salarios docentes prestacion" || sub.includes("profesor")) {
    setSelectSmart(f.tipo, "prestacion_docente", ["", "proveedor", "otro", "nomina", "gasto_variable"]);
    setSelectSmart(f.fuente, "proveedores", ["", "manual", "nomina", "gastos_variables"]);
    if (!f.proveedor?.value && f.persona?.value) f.proveedor.value = f.persona.value;
  } else if (cat === "pago proveedores" || f.proveedor?.value) {
    setSelectSmart(f.tipo, "proveedor", ["", "otro", "gasto_variable"]);
    setSelectSmart(f.fuente, "proveedores", ["", "manual", "gastos_variables"]);
  } else if (["arrendamiento","contabilidad","servicios publicos","software y plataformas digitales","bancarios","sg sst","seguros y alarmas"].includes(cat)) {
    setSelectSmart(f.tipo, "gasto_fijo", ["", "proveedor", "otro", "gasto_variable"]);
    setSelectSmart(f.fuente, "gastos_fijos", ["", "manual", "proveedores", "gastos_variables"]);
  } else if (cat) {
    setSelectSmart(f.tipo, "gasto_variable", ["", "proveedor", "otro"]);
    setSelectSmart(f.fuente, "gastos_variables", ["", "manual", "proveedores"]);
  }

  if (!f.concepto?.value) {
    const who = f.persona?.value || f.proveedor?.value || "";
    f.concepto.value = [f.subcategoria?.value || f.categoria?.value || "Egreso", who].filter(Boolean).join(" - ");
  }
  if (!f.proyecto?.value) f.proyecto.value = "Musicala";
}

function setSelectSmart(select, value, replaceable = [""]){
  if (!select || !replaceable.includes(select.value)) return;
  if ([...select.options].some(opt => opt.value === value)) select.value = value;
}

function closeEgreso(){
  els.modal.classList.remove("open");
}

async function onSaveEgreso(e){
  e.preventDefault();
  if (!state.user) return;
  const data = formData(els.form);
  try{
    if (data.id) await editarEgreso(data.id, data, state.user, state.activeMonth);
    else await crearEgreso(data, state.user, state.activeMonth);
    closeEgreso();
    setStatus("Egreso guardado");
  }catch(err){ showError(err); }
}

function openPago(row){
  if (!row || !state.user) return;
  els.payForm.reset();
  els.payForm.elements.egresoId.value = row.id;
  els.payForm.elements.fechaPago.value = todayIso();
  els.payForm.elements.valor.value = Math.max(0, Number(row.valorAprobado || row.valorCalculado || 0) - Number(row.valorPagado || 0));
  byId("pay-subtitle").textContent = row.concepto || row.persona || row.proveedor || "";
  els.payModal.classList.add("open");
}

function closePago(){
  els.payModal.classList.remove("open");
}

function openEspecial(row = null, tipoRegistro = null){
  if (!state.user) return setStatus("Inicia sesiÃ³n para editar.", true);
  els.especialForm.reset();
  const data = row || {
    tipoRegistro: tipoRegistro || "categoria",
    activo: true,
    origenHoja: "Frontend",
    ordenGlobal: state.especial.length + 1,
  };
  Object.entries(data).forEach(([k, v]) => {
    if (els.especialForm.elements[k]) els.especialForm.elements[k].value = v ?? "";
  });
  els.especialForm.elements.id.value = row?.id || "";
  els.especialForm.elements.activo.value = data.activo === false ? "false" : "true";
  if (els.especialForm.elements.automatico) els.especialForm.elements.automatico.value = data.automatico === true ? "true" : "false";
  els.especialModal.classList.add("open");
}

function closeEspecial(){
  els.especialModal.classList.remove("open");
}

async function onSaveEspecial(e){
  e.preventDefault();
  if (!state.user) return;
  const data = formData(els.especialForm);
  try{
    if (data.id) await editarEspecial(data.id, data, state.user);
    else await crearEspecial(data, state.user);
    closeEspecial();
    setStatus("Registro especial guardado");
  }catch(err){ showError(err); }
}

async function onImportEspecial(){
  if (!state.user) return setStatus("Inicia sesiÃ³n para importar.", true);
  try{
    setStatus("Importando Excel 2026 a seguimiento_egresos_especial...");
    const seed = [...EGRESOS_ESPECIALES_SEED, ...MANUAL_SPECIAL_SEED];
    await importarEgresosEspeciales(seed, state.user);
    setStatus(`Importados ${seed.length} registros especiales`);
  }catch(err){ showError(err); }
}

async function onSavePago(e){
  e.preventDefault();
  if (!state.user) return;
  const data = formData(els.payForm);
  try{
    await registrarPago(data.egresoId, data, state.user);
    closePago();
    setStatus("Pago registrado");
  }catch(err){ showError(err); }
}

function clearFilters(){
  els.filters.estado.value = "";
  els.filters.tipo.value = "";
  els.filters.fuente.value = "";
  els.filters.persona.value = "";
  els.filters.q.value = "";
  renderAll();
}

function fillSelect(select, values, emptyLabel = ""){
  select.innerHTML = values.map((value, i) => `<option value="${esc(value)}">${esc(!value && i === 0 ? emptyLabel : label(value))}</option>`).join("");
}

function updateCategoryLists(){
  const categorias = unique([
    ...DEFAULT_CATALOG.categorias.map(([categoria]) => categoria),
    ...state.especial.map(row => row.categoria).filter(Boolean),
    ...state.egresos.map(row => row.categoria).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const subcategorias = unique([
    ...DEFAULT_CATALOG.categorias.map(([, subcategoria]) => subcategoria),
    ...state.especial.map(row => row.subcategoria).filter(Boolean),
    ...state.egresos.map(row => row.subcategoria).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const equipo = unique([
    ...DEFAULT_CATALOG.equipo,
    ...state.especial.filter(row => row.tipoRegistro === "equipo_directo").map(row => row.nombre || row.persona).filter(Boolean),
    ...state.egresos.map(row => row.persona).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const medios = unique([
    ...DEFAULT_CATALOG.mediosPago,
    ...state.especial.filter(row => row.tipoRegistro === "medio_pago").map(row => row.nombre || row.cuentaBancaria).filter(Boolean),
    ...state.especial.map(row => row.cuentaBancaria).filter(Boolean),
    ...state.egresos.map(row => row.medioPago).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const proyectos = unique([
    ...DEFAULT_CATALOG.proyectos,
    ...state.especial.filter(row => row.tipoRegistro === "proyecto").map(row => row.nombre || row.proyecto).filter(Boolean),
    ...state.especial.map(row => row.proyecto).filter(Boolean),
    ...state.egresos.map(row => row.proyecto).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const proveedores = unique([
    ...state.especial.map(row => row.proveedor || (row.tipoRegistro === "proveedor" ? row.nombre : "")).filter(Boolean),
    ...state.egresos.map(row => row.proveedor).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "es"));
  if (els.categoriasList) els.categoriasList.innerHTML = categorias.map(value => `<option value="${esc(value)}"></option>`).join("");
  if (els.subcategoriasList) els.subcategoriasList.innerHTML = subcategorias.map(value => `<option value="${esc(value)}"></option>`).join("");
  if (els.equipoList) els.equipoList.innerHTML = equipo.map(value => `<option value="${esc(value)}"></option>`).join("");
  if (els.mediosPagoList) els.mediosPagoList.innerHTML = medios.map(value => `<option value="${esc(value)}"></option>`).join("");
  if (els.proyectosList) els.proyectosList.innerHTML = proyectos.map(value => `<option value="${esc(value)}"></option>`).join("");
  if (els.proveedoresList) els.proveedoresList.innerHTML = proveedores.map(value => `<option value="${esc(value)}"></option>`).join("");
}

function formData(form){
  return Object.fromEntries(new FormData(form).entries());
}

function setStatus(message, bad = false){
  els.status.innerHTML = `<span class="pill ${bad ? "bad" : "ok"}"><span class="dot"></span>${esc(message)}</span>`;
}

function showError(err){
  console.error(err);
  setStatus(friendlyAuthError(err), true);
}

function friendlyAuthError(err){
  const code = err?.code || "";
  const messages = {
    "auth/unauthorized-domain": "Este dominio no estÃ¡ autorizado en Firebase Auth. Agrega localhost o el dominio donde abres la app.",
    "auth/operation-not-allowed": "El inicio con Google no estÃ¡ habilitado en Firebase Auth.",
    "auth/popup-closed-by-user": "Se cerrÃ³ la ventana de Google antes de completar el ingreso.",
    "auth/popup-blocked": "El navegador bloqueÃ³ la ventana de Google. Permite ventanas emergentes para esta app.",
    "auth/cancelled-popup-request": "Ya hay una ventana de ingreso abierta. CiÃ©rrala o termina ese ingreso.",
    "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa la conexiÃ³n a internet.",
  };
  return messages[code] || err?.message || String(err);
}

function kpi(label, value){
  return `<div class="kpi"><p class="label">${esc(label)}</p><p class="value">${esc(value)}</p></div>`;
}

function badge(value){
  const cls = value === "conciliado" || value === "pagado" ? "ok" : value === "anulado" || value === "archivado" ? "bad" : value === "pagado_parcial" ? "info" : "warn";
  return `<span class="badge ${cls}">${esc(label(value))}</span>`;
}

function empty(text){
  return `<div class="empty">${esc(text)}</div>`;
}

function monthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(){
  return new Date().toISOString().slice(0, 10);
}

function sum(rows, key){
  return rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
}

function groupBy(rows, fn){
  return rows.reduce((acc, row) => {
    const key = fn(row);
    acc[key] = acc[key] || [];
    acc[key].push(row);
    return acc;
  }, {});
}

function unique(values){
  return [...new Set(values)];
}

function specialSeed(tipoRegistro, rows){
  return rows.map((row, index) => {
    const [nombre, categoria, subcategoria, frecuencia, diaSugerido, valorSugerido, proveedor, automatico, cuentaBancaria, activo, proyecto] = row;
    return {
      id: `${tipoRegistro}-${slug([nombre, categoria, subcategoria, proyecto].join("-"))}-${index + 1}`,
      tipoRegistro,
      origenHoja: "Configuración manual Codex",
      ordenGlobal: index + 1,
      obligacion: nombre,
      nombre,
      categoria,
      subcategoria,
      concepto: nombre,
      frecuencia,
      diaSugerido: dayNumber(diaSugerido),
      diaSugeridoIso: String(diaSugerido || ""),
      valorSugerido: numericSeed(valorSugerido),
      proveedor,
      automatico,
      cuentaBancaria,
      activo,
      visible: true,
      archivado: false,
      proyecto,
    };
  });
}

function numericSeed(value){
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function dayNumber(value){
  const match = String(value || "").match(/\b([0-2]?\d|3[01])\b/);
  return match ? Number(match[1]) : null;
}

function money(value){
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function label(value){
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function norm(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function slug(value){
  return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "registro";
}

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
