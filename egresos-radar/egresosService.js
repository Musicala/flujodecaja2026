"use strict";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { ESTADOS_EGRESO, ESTADOS_MES_ACTIVO, mesNombre } from "./catalogosService.js";
import { userAudit } from "./authService.js";

export const COLLECTION = "seguimiento_egresos";

export function listenEgresosMes(periodo, callback, onError){
  return onSnapshot(collection(db, COLLECTION), snap => {
    callback(normalizeFirestoreEgresos(snap.docs, periodo)
      .filter(row => ESTADOS_MES_ACTIVO.includes(row.estado))
      .sort((a, b) => String(a.fechaVencimiento || "").localeCompare(String(b.fechaVencimiento || ""))));
  }, onError);
}

export function listenEgresosPeriodoTodos(periodo, callback, onError){
  return onSnapshot(collection(db, COLLECTION), snap => {
    callback(normalizeFirestoreEgresos(snap.docs, periodo)
      .sort((a, b) => String(b.actualizadoEn || b.creadoEn || "").localeCompare(String(a.actualizadoEn || a.creadoEn || ""))));
  }, onError);
}

function normalizeFirestoreEgresos(docs, periodo){
  return docs
    .map(d => normalizeFirestoreEgreso(d.id, d.data()))
    .filter(row => row.periodo === periodo && row.visible !== false && row.archivado !== true);
}

function normalizeFirestoreEgreso(id, data){
  const periodo = data.periodo || periodoFromData(data);
  const valor = Number(data.valorAprobado || data.valorCalculado || data.valor || 0);
  const nombre = data.persona || data.proveedor || data.docente || data.nombre || "";
  return {
    ...data,
    id,
    periodo,
    anio: Number(data.anio || data["a\u00f1o"] || periodo.slice(0, 4) || new Date().getFullYear()),
    mes: String(data.mes || periodo.slice(5, 7) || "").padStart(2, "0"),
    tipo: data.tipo || "proveedor",
    fuente: data.fuente || (data.tipo === "prestacion_docente" ? "proveedores" : "manual"),
    persona: data.persona || data.docente || "",
    proveedor: data.proveedor || data.docente || nombre,
    concepto: data.concepto || data.detalle || data.tipo || "",
    categoria: data.categoria || (data.tipo === "prestacion_docente" ? "Salarios Docentes prestacion" : ""),
    subcategoria: data.subcategoria || "",
    valorCalculado: Number(data.valorCalculado || valor),
    valorAprobado: Number(data.valorAprobado || valor),
    valorPagado: Number(data.valorPagado || 0),
    estado: data.estado || "pendiente",
    fechaVencimiento: data.fechaVencimiento || fechaDesdeRango(data.rango) || "",
    visible: data.visible !== false,
    archivado: data.archivado === true,
  };
}

function periodoFromData(data){
  const anio = Number(data.anio || data["a\u00f1o"] || "");
  const mes = Number(data.mes || "");
  if (anio && mes) return `${anio}-${String(mes).padStart(2, "0")}`;
  if (data.fechaVencimiento) return String(data.fechaVencimiento).slice(0, 7);
  if (data.rango) return String(data.rango).match(/\d{4}-\d{2}/)?.[0] || "";
  return "";
}

function fechaDesdeRango(rango){
  return String(rango || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

export function normalizeEgreso(input, user, periodoFallback){
  const periodo = input.periodo || periodoFallback || "";
  const anio = Number(input.anio || periodo.slice(0, 4) || new Date().getFullYear());
  const mes = String(input.mes || periodo.slice(5, 7) || (new Date().getMonth() + 1)).padStart(2, "0");
  const estado = ESTADOS_EGRESO.includes(input.estado) ? input.estado : "pendiente";

  return {
    periodo: periodo || `${anio}-${mes}`,
    anio,
    mes,
    mesNombre: input.mesNombre || mesNombre(mes),
    tipo: input.tipo || "otro",
    fuente: input.fuente || "manual",
    origenApp: input.origenApp || "Radar de Pagos Musicala",
    origenDocId: input.origenDocId || "",
    persona: input.persona || "",
    proveedor: input.proveedor || "",
    concepto: input.concepto || "",
    categoria: input.categoria || "",
    subcategoria: input.subcategoria || "",
    proyecto: input.proyecto || "",
    rango: input.rango || "",
    valorCalculado: Number(input.valorCalculado || 0),
    valorAprobado: Number(input.valorAprobado || input.valorCalculado || 0),
    valorPagado: Number(input.valorPagado || 0),
    estado,
    prioridad: input.prioridad || "media",
    fechaVencimiento: input.fechaVencimiento || "",
    fechaPago: input.fechaPago || "",
    medioPago: input.medioPago || "",
    referenciaPago: input.referenciaPago || "",
    soporteUrl: input.soporteUrl || "",
    observaciones: input.observaciones || "",
    visible: input.visible !== false,
    archivado: input.archivado === true,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userAudit(user),
  };
}

export async function crearEgreso(input, user, periodo){
  const data = normalizeEgreso(input, user, periodo);
  data.creadoEn = serverTimestamp();
  data.creadoPor = userAudit(user);
  return addDoc(collection(db, COLLECTION), data);
}

export async function editarEgreso(id, input, user, periodo){
  return updateDoc(doc(db, COLLECTION, id), normalizeEgreso(input, user, periodo));
}

export async function registrarPago(egresoId, pago, user){
  const egresoRef = doc(db, COLLECTION, egresoId);
  const pagoRef = doc(collection(egresoRef, "pagos"));

  await runTransaction(db, async tx => {
    const snap = await tx.get(egresoRef);
    if (!snap.exists()) throw new Error("egreso_no_existe");
    const egreso = snap.data();
    const valorPago = Number(pago.valor || 0);
    const pagado = Number(egreso.valorPagado || 0) + valorPago;
    const aprobado = Number(egreso.valorAprobado || egreso.valorCalculado || 0);
    const estado = aprobado > 0 && pagado < aprobado ? "pagado_parcial" : "pagado";

    tx.set(pagoRef, {
      valor: valorPago,
      fechaPago: pago.fechaPago || "",
      medioPago: pago.medioPago || "",
      referenciaPago: pago.referenciaPago || "",
      soporteUrl: pago.soporteUrl || "",
      observaciones: pago.observaciones || "",
      creadoEn: serverTimestamp(),
      creadoPor: userAudit(user),
    });

    tx.update(egresoRef, {
      valorPagado: pagado,
      estado,
      fechaPago: pago.fechaPago || egreso.fechaPago || "",
      medioPago: pago.medioPago || egreso.medioPago || "",
      referenciaPago: pago.referenciaPago || egreso.referenciaPago || "",
      soporteUrl: pago.soporteUrl || egreso.soporteUrl || "",
      actualizadoEn: serverTimestamp(),
      actualizadoPor: userAudit(user),
    });
  });
}

export function archivarEgreso(id, user){
  return updateDoc(doc(db, COLLECTION, id), {
    archivado: true,
    estado: "archivado",
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userAudit(user),
  });
}

export function anularEgreso(id, user){
  return updateDoc(doc(db, COLLECTION, id), {
    visible: false,
    estado: "anulado",
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userAudit(user),
  });
}

export function conciliarEgreso(id, user){
  return updateDoc(doc(db, COLLECTION, id), {
    estado: "conciliado",
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userAudit(user),
  });
}
