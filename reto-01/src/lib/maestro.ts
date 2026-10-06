import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx } from "../tools/types"

export const MaestroSchema = z.record(z.string(), z.unknown())
export type Maestro = z.infer<typeof MaestroSchema>

export const GlosarioSchema = z.record(z.string(), z.string())
export type Glosario = z.infer<typeof GlosarioSchema>

export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string }

const leerJson = async <T>(ruta: string, schema: z.ZodType<T>): Promise<JsonResult<T>> => {
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
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { ok: false, error: `json inválido en ${ruta}: ${issues}` }
  }
  return { ok: true, data: result.data }
}

const maestroPath = (ctx: Ctx): string =>
  path.join(ctx.directory, "fixtures", "repositorio", "maestro.json")

const glosarioPath = (ctx: Ctx): string =>
  path.join(ctx.directory, "fixtures", "glosario-campos.json")

export const cargarMaestro = async (ctx: Ctx): Promise<JsonResult<Maestro>> => {
  const ruta = maestroPath(ctx)
  try {
    await fs.access(ruta)
  } catch {
    return { ok: false, error: `maestro ausente en reto-01/fixtures/repositorio/maestro.json` }
  }
  return leerJson(ruta, MaestroSchema)
}

export const cargarGlosario = async (ctx: Ctx): Promise<JsonResult<Glosario>> => {
  const ruta = glosarioPath(ctx)
  try {
    await fs.access(ruta)
  } catch {
    return { ok: false, error: `glosario ausente en reto-01/fixtures/glosario-campos.json` }
  }
  return leerJson(ruta, GlosarioSchema)
}

// Walker seguro para rutas tipo "banco.nombre" o "ingresos_ultimo_ano.valor".
// Devuelve undefined si cualquier parte del path no existe. No usa eval.
export const obtenerValor = (obj: unknown, ruta: string): unknown => {
  const partes = ruta.split(".")
  let cur: unknown = obj
  for (const p of partes) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}
