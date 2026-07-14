"use strict";

export const ESTADOS_EGRESO = [
  "pendiente",
  "en_revision",
  "aprobado",
  "pagado_parcial",
  "pagado",
  "conciliado",
  "no_aplica",
  "anulado",
  "archivado",
];

export const ESTADOS_MES_ACTIVO = [
  "pendiente",
  "en_revision",
  "aprobado",
  "pagado_parcial",
];

export const TIPOS_EGRESO = [
  "nomina",
  "prestacion_docente",
  "proveedor",
  "gasto_fijo",
  "gasto_variable",
  "obligacion",
  "servicio",
  "impuesto",
  "operativo",
  "otro",
];

export const FUENTES_EGRESO = [
  "manual",
  "nomina",
  "cuentas_cobro",
  "proveedores",
  "gastos_fijos",
  "gastos_variables",
  "obligaciones",
  "otro",
];

export const MESES = [
  ["01", "Enero"],
  ["02", "Febrero"],
  ["03", "Marzo"],
  ["04", "Abril"],
  ["05", "Mayo"],
  ["06", "Junio"],
  ["07", "Julio"],
  ["08", "Agosto"],
  ["09", "Septiembre"],
  ["10", "Octubre"],
  ["11", "Noviembre"],
  ["12", "Diciembre"],
];

export function mesNombre(numero){
  return MESES.find(([m]) => m === String(numero).padStart(2, "0"))?.[1] || "";
}
