import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx } from "../tools/types"

export const SoporteIndexItemSchema = z.object({
  tipo: z.string(),
  archivo: z.string(),
  vigencia_hasta: z.union([z.string(), z.null()]),
  pais_emisor: z.string(),
  descripcion: z.string(),
})
export type SoporteIndexItem = z.infer<typeof SoporteIndexItemSchema>

export const SoporteIndexSchema = z.array(SoporteIndexItemSchema)
export type SoporteIndex = z.infer<typeof SoporteIndexSchema>

export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type EstadoSoporte = "vigente" | "vencido"

export type ClasificacionSoportes = {
  presentes: SoporteIndexItem[]
  vencidos: SoporteIndexItem[]
  ausentes: string[]
}

const indexPath = (ctx: Ctx): string =>
  path.join(ctx.directory, "fixtures", "repositorio", "soportes", "index.json")

export const cargarSoportes = async (ctx: Ctx): Promise<JsonResult<SoporteIndex>> => {
  const ruta = indexPath(ctx)
  try {
    await fs.access(ruta)
  } catch {
    return { ok: false, error: `soportes ausentes en fixtures/repositorio/soportes/index.json` }
  }
  let raw: string
  try {
    raw = await fs.readFile(ruta, "utf8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `fallo leyendo ${ruta}: ${msg}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `json inválido en ${ruta}: ${msg}` }
  }
  const result = SoporteIndexSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { ok: false, error: `json inválido en ${ruta}: ${issues}` }
  }
  return { ok: true, data: result.data }
}

// vigencia_hasta=null => vigente para siempre.
// Edge case: hoy === vigencia_hasta ⇒ vigente (vence al día siguiente).
export const estadoSoporte = (item: SoporteIndexItem, now: Date): EstadoSoporte => {
  if (item.vigencia_hasta === null) return "vigente"
  const hoyIso = now.toISOString().slice(0, 10)
  return item.vigencia_hasta >= hoyIso ? "vigente" : "vencido"
}

export const clasificarSoportes = (
  exigidos: string[],
  index: SoporteIndex,
  now: Date
): ClasificacionSoportes => {
  const porTipo = new Map(index.map((i) => [i.tipo, i]))
  const presentes: SoporteIndexItem[] = []
  const vencidos: SoporteIndexItem[] = []
  const ausentes: string[] = []
  for (const tipo of exigidos) {
    const item = porTipo.get(tipo)
    if (item === undefined) {
      ausentes.push(tipo)
      continue
    }
    if (estadoSoporte(item, now) === "vigente") presentes.push(item)
    else vencidos.push(item)
  }
  return { presentes, vencidos, ausentes }
}
