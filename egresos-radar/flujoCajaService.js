"use strict";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { userAudit } from "./authService.js";
import { COLLECTION as EGRESOS_COLLECTION, normalizeEgreso } from "./egresosService.js";

export const FLUJO_COLLECTION = "flujo_caja_transacciones";

// Escucha los egresos del flujo de caja de un periodo (YYYY-MM).
// La fecha se guarda como texto YYYY-MM-DD, así que filtramos por prefijo en cliente
// para no depender de un índice compuesto (tipo + fecha).
export function listenFlujoEgresos(periodo, callback, onError){
  const q = query(collection(db, FLUJO_COLLECTION), orderBy("fecha", "desc"));
  return onSnapshot(q, snap => {
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.tipo === "Egreso" && String(r.fecha || "").slice(0, 7) === periodo);
    callback(rows);
  }, onError);
}

// Convierte una transacción de flujo de caja en un seguimiento_egreso ya conciliado.
export async function crearEgresoDesdeFlujo(tx, user, periodoFallback){
  const periodo = String(tx.fecha || "").slice(0, 7) || periodoFallback || "";
  const input = {
    periodo,
    tipo: "otro",
    fuente: "flujo_caja",
    origenApp: "Flujo de Caja",
    origenDocId: tx.id,
    concepto: tx.descripcion || tx.categoria || "Egreso de flujo de caja",
    categoria: tx.categoria || "",
    valorCalculado: Number(tx.monto || 0),
    valorAprobado: Number(tx.monto || 0),
    fechaVencimiento: tx.fecha || "",
    fechaPago: tx.fecha || "",
    medioPago: tx.metodo || "",
    referenciaPago: tx.ref || tx.referencia || "",
    observaciones: tx.obs || "",
    estado: "conciliado",
  };
  const data = normalizeEgreso(input, user, periodoFallback);
  data.creadoEn = serverTimestamp();
  data.creadoPor = userAudit(user);
  data.flujoTxIds = [tx.id];
  data.flujoMovimientos = [movSnapshot(tx)];
  data.valorConciliado = Number(tx.monto || 0);
  data.conciliadoEn = serverTimestamp();
  data.conciliadoPor = userAudit(user);
  return addDoc(collection(db, EGRESOS_COLLECTION), data);
}

// Vincula (concilia) una transacción de flujo de caja con un egreso existente.
export async function vincularFlujoEgreso(egresoId, tx, user){
  const ref = doc(db, EGRESOS_COLLECTION, egresoId);
  await runTransaction(db, async t => {
    const snap = await t.get(ref);
    if (!snap.exists()) throw new Error("egreso_no_existe");
    const e = snap.data();
    const movs = (Array.isArray(e.flujoMovimientos) ? e.flujoMovimientos : []).filter(m => m.id !== tx.id);
    movs.push(movSnapshot(tx));
    const conciliado = movs.reduce((a, m) => a + Number(m.monto || 0), 0);
    const aprobado = Number(e.valorAprobado || e.valorCalculado || 0);
    const estado = aprobado > 0 && conciliado < aprobado ? "pagado_parcial" : "conciliado";
    t.update(ref, {
      flujoTxIds: movs.map(m => m.id),
      flujoMovimientos: movs,
      valorConciliado: conciliado,
      fechaPago: e.fechaPago || tx.fecha || "",
      medioPago: e.medioPago || tx.metodo || "",
      estado,
      conciliadoEn: serverTimestamp(),
      conciliadoPor: userAudit(user),
      actualizadoEn: serverTimestamp(),
      actualizadoPor: userAudit(user),
    });
  });
}

// Deshace el vínculo de una transacción; si no quedan movimientos, vuelve a estado abierto.
export async function desvincularFlujoEgreso(egresoId, txId, user){
  const ref = doc(db, EGRESOS_COLLECTION, egresoId);
  await runTransaction(db, async t => {
    const snap = await t.get(ref);
    if (!snap.exists()) throw new Error("egreso_no_existe");
    const e = snap.data();
    const movs = (Array.isArray(e.flujoMovimientos) ? e.flujoMovimientos : []).filter(m => m.id !== txId);
    const conciliado = movs.reduce((a, m) => a + Number(m.monto || 0), 0);
    const aprobado = Number(e.valorAprobado || e.valorCalculado || 0);
    let estado = e.estado;
    if (!movs.length) {
      estado = aprobado > 0 ? "aprobado" : "pendiente";
    } else if (conciliado < aprobado) {
      estado = "pagado_parcial";
    }
    t.update(ref, {
      flujoTxIds: movs.map(m => m.id),
      flujoMovimientos: movs,
      valorConciliado: conciliado,
      estado,
      actualizadoEn: serverTimestamp(),
      actualizadoPor: userAudit(user),
    });
  });
}

function movSnapshot(tx){
  return {
    id: tx.id,
    fecha: tx.fecha || "",
    monto: Number(tx.monto || 0),
    metodo: tx.metodo || "",
    categoria: tx.categoria || "",
    descripcion: tx.descripcion || "",
  };
}
