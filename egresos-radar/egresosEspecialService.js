"use strict";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { userAudit } from "./authService.js";

export const ESPECIAL_COLLECTION = "seguimiento_egresos_especial";

export function listenEgresosEspecial(callback, onError){
  return onSnapshot(collection(db, ESPECIAL_COLLECTION), snap => {
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(row => row.visible !== false)
      .sort(compareEspecial);
    callback(rows);
  }, onError);
}

export function normalizeEspecial(input, user){
  return clean({
    tipoRegistro: input.tipoRegistro || "categoria",
    origenHoja: input.origenHoja || "Frontend",
    ordenGlobal: Number(input.ordenGlobal || 0),
    obligacion: input.obligacion || input.nombre || "",
    categoria: input.categoria || "",
    subcategoria: input.subcategoria || "",
    nombre: input.nombre || input.subcategoria || input.categoria || "",
    proveedor: input.proveedor || "",
    concepto: input.concepto || "",
    detalle: input.detalle || "",
    frecuencia: input.frecuencia || "",
    diaSugerido: numberOrNull(input.diaSugerido),
    diaSugeridoIso: input.diaSugeridoIso || "",
    mesTexto: input.mesTexto || "",
    periodo: input.periodo || "",
    valorSugerido: numberOrNull(input.valorSugerido),
    valorCuentaCobro: numberOrNull(input.valorCuentaCobro),
    valorFinal: numberOrNull(input.valorFinal),
    valor: numberOrNull(input.valor),
    automatico: input.automatico === "true" || input.automatico === true || input.automatico === "Sí" || input.automatico === "Si",
    medioPago: input.medioPago || "",
    cuentaBancaria: input.cuentaBancaria || "",
    proyecto: input.proyecto || "",
    estado: input.estado || "",
    responsable: input.responsable || "",
    observaciones: input.observaciones || "",
    activo: input.activo === "false" || input.activo === false ? false : true,
    visible: input.visible === false ? false : true,
    archivado: input.archivado === true,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userAudit(user),
  });
}

export async function crearEspecial(input, user){
  const data = normalizeEspecial(input, user);
  data.creadoEn = serverTimestamp();
  data.creadoPor = userAudit(user);
  return addDoc(collection(db, ESPECIAL_COLLECTION), data);
}

export function editarEspecial(id, input, user){
  return updateDoc(doc(db, ESPECIAL_COLLECTION, id), normalizeEspecial(input, user));
}

export async function importarEgresosEspeciales(seed, user){
  const audit = userAudit(user);
  for (let i = 0; i < seed.length; i += 400){
    const batch = writeBatch(db);
    seed.slice(i, i + 400).forEach(item => {
      const ref = doc(db, ESPECIAL_COLLECTION, item.id);
      batch.set(ref, clean({
        ...item,
        visible: item.visible !== false,
        archivado: item.archivado === true,
        importadoDesde: "Seguimiento egresos Musicala 2026.xlsx",
        actualizadoEn: serverTimestamp(),
        actualizadoPor: audit,
      }), { merge: true });
    });
    await batch.commit();
  }
}

function compareEspecial(a, b){
  return String(a.tipoRegistro || "").localeCompare(String(b.tipoRegistro || ""), "es")
    || String(a.categoria || "").localeCompare(String(b.categoria || ""), "es")
    || String(a.subcategoria || "").localeCompare(String(b.subcategoria || ""), "es")
    || Number(a.ordenGlobal || 0) - Number(b.ordenGlobal || 0)
    || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
}

function numberOrNull(value){
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clean(data){
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
