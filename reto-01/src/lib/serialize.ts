export type Serializable = string | number | boolean | null | undefined | object | unknown[]

// Serializa un valor para una celda/línea:
//   string→string, number→number, boolean→"Sí"|"No" (D7 slice 03),
//   null/undefined→null, object/array→JSON.stringify (defensivo).
export const serializarValor = (v: Serializable): string | number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}
