import { normalizar } from "../lib/normalize"

const PALABRAS_CONFIRMACION = new Set([
  "si",
  "confirmo",
  "confirmar",
  "ok",
  "dale",
  "yes",
  "confirmed",
])

export const esConfirmacion = (texto: string): boolean => {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return false
  if (palabras[0] === "no") return false
  return palabras.some((p) => PALABRAS_CONFIRMACION.has(p))
}
