import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx, Tool } from "./types"
import { casoDir, outDir } from "../lib/paths"
import { appendLog } from "../lib/log"
import { PAISES, NOTA_POR_PAIS, notaIdentExtranjero, type Pais } from "../lib/pais"
import { normalizar } from "../lib/normalize"
import { similitud } from "../lib/levenshtein"
import { cargarMaestro, cargarGlosario, obtenerValor } from "../lib/maestro"
import {
  escribirFormulario,
  type PlantillaCelda as XlsxPlantillaCelda,
} from "../lib/xlsx"

// Export names:
//   leer_solicitud      → modelo lo ve como proveedor_leer_solicitud
//   mapear_campos       → modelo lo ve como proveedor_mapear_campos
//   generar_formulario  → modelo lo ve como proveedor_generar_formulario
// (convención PRD §6.2: <archivo>_<export>)

const FORMATOS = ["xlsx", "pdf", "portal"] as const
type Formato = (typeof FORMATOS)[number]

type DestinoCelda = {
  hoja: string
  celda_etiqueta: string
  celda_valor: string
}

type Campo = {
  etiqueta: string
  obligatorio: boolean
  destino?: DestinoCelda
  requiere_confirmacion?: true
  nota_pais?: string
}

type Correo = {
  de: string
  para: string
  asunto: string
  fecha: string
  cuerpo: string
}

type LeerSolicitudData = {
  pais: Pais
  cliente: string
  formato: Formato
  campos: Campo[]
  soportes: string[]
  correo: Correo
  adjuntos: string[]
}

const AMBIGUAS = new Set<string>([
  "identificación tributaria",
  "identificacion tributaria",
  "identificación fiscal",
  "identificacion fiscal",
  "número tributario",
  "numero tributario",
  "id tributario",
])

const esAmbigua = (etiqueta: string): boolean =>
  AMBIGUAS.has(etiqueta.trim().toLowerCase())

const SolicitudSchema = z.object({
  id: z.string(),
  de: z.string(),
  para: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  pais: z.enum(PAISES),
  cliente: z.string(),
  cuerpo: z.string(),
  formato: z.enum(FORMATOS),
  adjuntos: z.array(z.string()),
})

const PlantillaCeldasSchema = z.array(
  z.object({
    hoja: z.string(),
    celda_etiqueta: z.string(),
    etiqueta: z.string(),
    celda_valor: z.string(),
    obligatorio: z.boolean().optional(),
  })
)

const PlantillaCamposSchema = z.array(
  z.object({
    etiqueta: z.string(),
    obligatorio: z.boolean(),
  })
)

const SoportesSchema = z.array(z.string())

// --- leerJson con issues expuestas (T5: refactor H-2) ------------------------
type LeerJsonOk<T> = { ok: true; data: T }
type LeerJsonErr = { ok: false; error: string; issues?: z.ZodIssue[] }
type LeerJsonResult<T> = LeerJsonOk<T> | LeerJsonErr

const leerJson = async <T>(
  ruta: string,
  schema: z.ZodType<T>
): Promise<LeerJsonResult<T>> => {
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
    const issuesList = result.error.issues
    const issuesStr = issuesList.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return {
      ok: false,
      error: `json inválido en ${ruta}: ${issuesStr}`,
      issues: issuesList,
    }
  }
  return { ok: true, data: result.data }
}
// -----------------------------------------------------------------------------

const existsDir = async (ruta: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(ruta)
    return stat.isDirectory()
  } catch {
    return false
  }
}

const existsFile = async (ruta: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(ruta)
    return stat.isFile()
  } catch {
    return false
  }
}

const marcarCampos = (campos: Campo[], pais: Pais): Campo[] =>
  campos.map((c) => {
    if (!esAmbigua(c.etiqueta)) return c
    return { ...c, requiere_confirmacion: true, nota_pais: NOTA_POR_PAIS[pais] }
  })

// ============================================================================
// leer_solicitud
// ============================================================================

const leerArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
}

type LeerRunResult = { ok: true; data: LeerSolicitudData } | { ok: false; error: string }

const runLeer = async (
  input: { caso: string },
  ctx: Ctx
): Promise<LeerRunResult> => {
  const nombre = input.caso
  const dir = casoDir(ctx, nombre)
  if (!(await existsDir(dir))) {
    return { ok: false, error: `caso no encontrado: ${nombre}` }
  }

  const solicitudRuta = path.join(dir, "solicitud.json")
  if (!(await existsFile(solicitudRuta))) {
    return { ok: false, error: `solicitud ausente para caso ${nombre}` }
  }
  const solicitudRes = await leerJson(solicitudRuta, SolicitudSchema)
  if (!solicitudRes.ok) {
    // T5: clasificación por issues[].path (reemplaza el .includes frágil).
    const issues = solicitudRes.issues
    if (issues) {
      if (issues.some((i) => i.path[0] === "formato")) {
        return { ok: false, error: `formato inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
      if (issues.some((i) => i.path[0] === "pais")) {
        return { ok: false, error: `pais inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
    }
    return { ok: false, error: solicitudRes.error }
  }
  const solicitud = solicitudRes.data

  const soportesRuta = path.join(dir, "soportes-exigidos.json")
  if (!(await existsFile(soportesRuta))) {
    return { ok: false, error: `soportes-exigidos ausente para caso ${nombre}` }
  }
  const soportesRes = await leerJson(soportesRuta, SoportesSchema)
  if (!soportesRes.ok) return { ok: false, error: soportesRes.error }
  const soportes = soportesRes.data

  let campos: Campo[]
  if (solicitud.formato === "xlsx") {
    const plantillaRuta = path.join(dir, "plantilla-celdas.json")
    if (!(await existsFile(plantillaRuta))) {
      return { ok: false, error: `plantilla ausente para formato xlsx (caso ${nombre})` }
    }
    const plantillaRes = await leerJson(plantillaRuta, PlantillaCeldasSchema)
    if (!plantillaRes.ok) return { ok: false, error: plantillaRes.error }
    campos = plantillaRes.data.map((p) => ({
      etiqueta: p.etiqueta,
      obligatorio: p.obligatorio ?? true,
      destino: {
        hoja: p.hoja,
        celda_etiqueta: p.celda_etiqueta,
        celda_valor: p.celda_valor,
      },
    }))
  } else {
    const plantillaRuta = path.join(dir, "plantilla-campos.json")
    if (!(await existsFile(plantillaRuta))) {
      return { ok: false, error: `plantilla ausente para formato ${solicitud.formato} (caso ${nombre})` }
    }
    const plantillaRes = await leerJson(plantillaRuta, PlantillaCamposSchema)
    if (!plantillaRes.ok) return { ok: false, error: plantillaRes.error }
    campos = plantillaRes.data.map((p) => ({
      etiqueta: p.etiqueta,
      obligatorio: p.obligatorio,
    }))
  }

  campos = marcarCampos(campos, solicitud.pais)

  const data: LeerSolicitudData = {
    pais: solicitud.pais,
    cliente: solicitud.cliente,
    formato: solicitud.formato,
    campos,
    soportes,
    correo: {
      de: solicitud.de,
      para: solicitud.para,
      asunto: solicitud.asunto,
      fecha: solicitud.fecha,
      cuerpo: solicitud.cuerpo,
    },
    adjuntos: solicitud.adjuntos,
  }

  return { ok: true, data }
}

export const leer_solicitud: Tool<typeof leerArgs, LeerSolicitudData> = {
  description:
    "Lee la solicitud, su plantilla y los soportes exigidos de un caso en reto-01/fixtures/casos/<caso>/ y devuelve país, cliente, formato, campos normalizados y soportes exigidos.",
  args: leerArgs,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const result = await runLeer(input, ctx)
      if (result.ok) {
        const nAmbiguos = result.data.campos.filter((c) => c.requiere_confirmacion).length
        const nObligatorios = result.data.campos.filter((c) => c.obligatorio).length
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_leer_solicitud",
          ok: true,
          resumen: {
            pais: result.data.pais,
            formato: result.data.formato,
            n_campos: result.data.campos.length,
            n_ambiguos: nAmbiguos,
            n_obligatorios: nObligatorios,
            n_soportes: result.data.soportes.length,
          },
        })
      } else {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_leer_solicitud",
          ok: false,
          resumen: { caso: input.caso, error: result.error },
        })
      }
      return JSON.stringify(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const error = `fallo leyendo caso ${input.caso}: ${msg}`
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_leer_solicitud",
        ok: false,
        resumen: { caso: input.caso, error },
      })
      return JSON.stringify({ ok: false, error })
    }
  },
}

// ============================================================================
// mapear_campos
// ============================================================================

const DestinoSchema = z.object({
  hoja: z.string(),
  celda_etiqueta: z.string(),
  celda_valor: z.string(),
})

const CampoInputSchema = z
  .object({
    etiqueta: z.string(),
    obligatorio: z.boolean(),
    destino: DestinoSchema.optional(),
    requiere_confirmacion: z.literal(true).optional(),
    nota_pais: z.string().optional(),
  })
  .passthrough()

const mapearArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  campos: z.array(CampoInputSchema).min(1).describe(
    "Lista de campos tal como la devuelve proveedor_leer_solicitud en data.campos[]. Mínimo 1."
  ),
}

type Destino = z.infer<typeof DestinoSchema>
type CampoInput = z.infer<typeof CampoInputSchema>

type LlenoItem = {
  etiqueta: string
  ruta_maestro: string
  valor: unknown
  confianza: number
  destino?: Destino
}

type FaltanteItem = {
  etiqueta: string
  motivo: string
  destino?: Destino
}

type ConfirmacionItem = {
  etiqueta: string
  ruta_maestro?: string
  valor?: unknown
  confianza?: number
  motivo: string
  nota_pais?: string
  destino?: Destino
}

type MapeoData = {
  llenos: LlenoItem[]
  faltantes: FaltanteItem[]
  requiere_confirmacion: ConfirmacionItem[]
}

type MapeoRunResult = { ok: true; data: MapeoData } | { ok: false; error: string }

const UMBRAL_CONFIANZA = 0.8

type GlosarioEntry = { original: string; ruta: string }

const precomputarGlosario = (glosario: Record<string, string>): Map<string, GlosarioEntry> => {
  const map = new Map<string, GlosarioEntry>()
  for (const [original, ruta] of Object.entries(glosario)) {
    const norm = normalizar(original)
    if (!map.has(norm)) {
      map.set(norm, { original, ruta })
    }
  }
  return map
}

const mejorFuzzy = (
  normEtiqueta: string,
  mapaNorm: Map<string, GlosarioEntry>
): { entry: GlosarioEntry; confianza: number } | null => {
  let best: GlosarioEntry | null = null
  let bestSim = -1
  for (const [normGlos, entry] of mapaNorm) {
    const sim = similitud(normEtiqueta, normGlos)
    if (sim > bestSim) {
      bestSim = sim
      best = entry
    }
  }
  if (best === null) return null
  return { entry: best, confianza: bestSim }
}

const runMapear = async (
  input: { caso: string; campos: CampoInput[] },
  ctx: Ctx
): Promise<MapeoRunResult> => {
  const nombre = input.caso
  const dir = casoDir(ctx, nombre)
  if (!(await existsDir(dir))) {
    return { ok: false, error: `caso no encontrado: ${nombre}` }
  }

  // Resolver país del caso (opción B del plan R1: lectura directa, no re-llamar a leer_solicitud).
  const solicitudRuta = path.join(dir, "solicitud.json")
  if (!(await existsFile(solicitudRuta))) {
    return { ok: false, error: `solicitud ausente para caso ${nombre}` }
  }
  const solicitudRes = await leerJson(solicitudRuta, SolicitudSchema)
  if (!solicitudRes.ok) {
    const issues = solicitudRes.issues
    if (issues) {
      if (issues.some((i) => i.path[0] === "formato")) {
        return { ok: false, error: `formato inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
      if (issues.some((i) => i.path[0] === "pais")) {
        return { ok: false, error: `pais inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
    }
    return { ok: false, error: solicitudRes.error }
  }
  const pais = solicitudRes.data.pais

  const maestroRes = await cargarMaestro(ctx)
  if (!maestroRes.ok) return { ok: false, error: maestroRes.error }
  const maestro = maestroRes.data

  const glosarioRes = await cargarGlosario(ctx)
  if (!glosarioRes.ok) return { ok: false, error: glosarioRes.error }
  const glosario = glosarioRes.data

  const mapaNorm = precomputarGlosario(glosario)

  const llenos: LlenoItem[] = []
  const faltantes: FaltanteItem[] = []
  const confirmacion: ConfirmacionItem[] = []

  for (const campo of input.campos) {
    const destino = campo.destino as Destino | undefined
    const norm = normalizar(campo.etiqueta)

    // 1. Match exacto en glosario normalizado.
    let candidata: GlosarioEntry | null = mapaNorm.get(norm) ?? null
    let confianza = candidata !== null ? 1.0 : 0

    // 2. Si no, fuzzy.
    let candidataFuzzy: GlosarioEntry | null = null
    if (candidata === null) {
      const best = mejorFuzzy(norm, mapaNorm)
      if (best !== null) {
        candidataFuzzy = best.entry
        confianza = best.confianza
      }
    }

    const entradaInputAmbigua = campo.requiere_confirmacion === true

    // Rama A: campo venía ambiguo del slice 01.
    if (entradaInputAmbigua) {
      const motivo = campo.nota_pais ?? "ambigüedad heredada"
      const item: ConfirmacionItem = {
        etiqueta: campo.etiqueta,
        motivo,
      }
      if (campo.nota_pais) item.nota_pais = campo.nota_pais
      if (candidata) {
        item.ruta_maestro = candidata.ruta
        item.valor = obtenerValor(maestro, candidata.ruta)
        item.confianza = 1.0
      } else if (candidataFuzzy && confianza >= UMBRAL_CONFIANZA) {
        item.ruta_maestro = candidataFuzzy.ruta
        item.valor = obtenerValor(maestro, candidataFuzzy.ruta)
        item.confianza = confianza
      }
      if (destino) item.destino = destino
      confirmacion.push(item)
      continue
    }

    // Rama B: confianza < 0.8 → faltante.
    if (candidata === null && confianza < UMBRAL_CONFIANZA) {
      const motivo =
        candidataFuzzy !== null
          ? `sin equivalente en glosario (confianza <0.8 contra '${candidataFuzzy.original}')`
          : `sin equivalente en glosario`
      const item: FaltanteItem = { etiqueta: campo.etiqueta, motivo }
      if (destino) item.destino = destino
      faltantes.push(item)
      continue
    }

    // Rama C: confianza ∈ [0.8, 1.0) → requiere_confirmacion.
    if (candidata === null && candidataFuzzy !== null) {
      const item: ConfirmacionItem = {
        etiqueta: campo.etiqueta,
        ruta_maestro: candidataFuzzy.ruta,
        valor: obtenerValor(maestro, candidataFuzzy.ruta),
        confianza,
        motivo: `mapeo aproximado: ${candidataFuzzy.original}`,
      }
      if (destino) item.destino = destino
      confirmacion.push(item)
      continue
    }

    // En este punto, candidata !== null (confianza === 1.0).
    if (candidata === null) {
      // defensivo — nunca debería llegar aquí; cae a faltante genérico.
      const item: FaltanteItem = {
        etiqueta: campo.etiqueta,
        motivo: `sin equivalente en glosario`,
      }
      if (destino) item.destino = destino
      faltantes.push(item)
      continue
    }

    const ruta = candidata.ruta
    const valor = obtenerValor(maestro, ruta)

    // Rama D: RN1 — ruta_maestro === "nit" y pais !== "CO".
    if (ruta === "nit" && pais !== "CO") {
      const item: ConfirmacionItem = {
        etiqueta: campo.etiqueta,
        ruta_maestro: ruta,
        valor,
        confianza: 1.0,
        motivo: notaIdentExtranjero(pais),
        nota_pais: notaIdentExtranjero(pais),
      }
      if (destino) item.destino = destino
      confirmacion.push(item)
      continue
    }

    // Rama E: valor undefined/null en maestro → faltante (CA2 estricto; false/0/"" son valores válidos).
    if (valor === undefined || valor === null) {
      const item: FaltanteItem = {
        etiqueta: campo.etiqueta,
        motivo: `clave en glosario pero ausente en maestro: ${ruta}`,
      }
      if (destino) item.destino = destino
      faltantes.push(item)
      continue
    }

    // Rama F: lleno.
    const item: LlenoItem = {
      etiqueta: campo.etiqueta,
      ruta_maestro: ruta,
      valor,
      confianza: 1.0,
    }
    if (destino) item.destino = destino
    llenos.push(item)
  }

  return {
    ok: true,
    data: { llenos, faltantes, requiere_confirmacion: confirmacion },
  }
}

export const mapear_campos: Tool<typeof mapearArgs, MapeoData> = {
  description:
    "Cruza los campos solicitados (de proveedor_leer_solicitud) contra el repositorio maestro y el glosario; devuelve tres listas: llenos (con valor y ruta), faltantes y requiere_confirmacion. Nunca inventa valores.",
  args: mapearArgs,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const result = await runMapear(input, ctx)
      if (result.ok) {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_mapear_campos",
          ok: true,
          resumen: {
            n_llenos: result.data.llenos.length,
            n_faltantes: result.data.faltantes.length,
            n_requiere_confirmacion: result.data.requiere_confirmacion.length,
          },
        })
      } else {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_mapear_campos",
          ok: false,
          resumen: { caso: input.caso, error: result.error },
        })
      }
      return JSON.stringify(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const error = `fallo mapeando caso ${input.caso}: ${msg}`
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_mapear_campos",
        ok: false,
        resumen: { caso: input.caso, error },
      })
      return JSON.stringify({ ok: false, error })
    }
  },
}

// ============================================================================
// generar_formulario (slice 03: rama xlsx; pdf/portal → error diferido)
// ============================================================================

const LlenoInputSchema = z
  .object({
    etiqueta: z.string(),
    valor: z.unknown(),
  })
  .passthrough()

const FaltanteInputSchema = z.object({ etiqueta: z.string() }).passthrough()
const ConfirmacionInputSchema = z.object({ etiqueta: z.string() }).passthrough()

const MapeoInputSchema = z.object({
  llenos: z.array(LlenoInputSchema),
  faltantes: z.array(FaltanteInputSchema),
  requiere_confirmacion: z.array(ConfirmacionInputSchema),
})

const generarArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  mapeo: MapeoInputSchema.describe(
    "Mapeo producido por proveedor_mapear_campos: { llenos[], faltantes[], requiere_confirmacion[] }."
  ),
}

type GenerarData = { ruta: string; formato: "xlsx" }

type GenerarRunResult =
  | { ok: true; data: GenerarData; n_escritos: number; n_vacios: number }
  | { ok: false; error: string; formato?: string }

const runGenerar = async (
  input: { caso: string; mapeo: z.infer<typeof MapeoInputSchema> },
  ctx: Ctx
): Promise<GenerarRunResult> => {
  const nombre = input.caso
  const dir = casoDir(ctx, nombre)
  if (!(await existsDir(dir))) {
    return { ok: false, error: `caso no encontrado: ${nombre}` }
  }

  const solicitudRuta = path.join(dir, "solicitud.json")
  if (!(await existsFile(solicitudRuta))) {
    return { ok: false, error: `solicitud ausente para caso ${nombre}` }
  }
  const solicitudRes = await leerJson(solicitudRuta, SolicitudSchema)
  if (!solicitudRes.ok) {
    const issues = solicitudRes.issues
    if (issues) {
      if (issues.some((i) => i.path[0] === "formato")) {
        return { ok: false, error: `formato inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
      if (issues.some((i) => i.path[0] === "pais")) {
        return { ok: false, error: `pais inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
    }
    return { ok: false, error: solicitudRes.error }
  }
  const formato = solicitudRes.data.formato

  if (formato === "pdf") {
    return {
      ok: false,
      error: "formato pdf no implementado en slice 03; disponible en slice 04",
      formato,
    }
  }
  if (formato === "portal") {
    return {
      ok: false,
      error: "formato portal no implementado en slice 03; disponible en slice posterior",
      formato,
    }
  }

  // formato === "xlsx"
  const plantillaRuta = path.join(dir, "plantilla-celdas.json")
  if (!(await existsFile(plantillaRuta))) {
    return { ok: false, error: `plantilla ausente para formato xlsx (caso ${nombre})`, formato }
  }
  const plantillaRes = await leerJson(plantillaRuta, PlantillaCeldasSchema)
  if (!plantillaRes.ok) return { ok: false, error: plantillaRes.error, formato }

  // Lookup etiqueta → valor desde mapeo.llenos (match exacto, decisión spec §6.2).
  const valores = new Map<string, unknown>()
  for (const l of input.mapeo.llenos) {
    valores.set(l.etiqueta, l.valor)
  }

  const plantilla: XlsxPlantillaCelda[] = plantillaRes.data.map((p) => ({
    hoja: p.hoja,
    celda_etiqueta: p.celda_etiqueta,
    etiqueta: p.etiqueta,
    celda_valor: p.celda_valor,
  }))

  const dirSalida = outDir(ctx, nombre)
  try {
    await fs.mkdir(dirSalida, { recursive: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `fallo escribiendo xlsx para caso ${nombre}: ${msg}`, formato }
  }

  const rutaAbs = path.join(dirSalida, "formulario.xlsx")
  let n_escritos = 0
  let n_vacios = 0
  try {
    const r = await escribirFormulario(rutaAbs, plantilla, valores)
    n_escritos = r.n_escritos
    n_vacios = r.n_vacios
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `fallo escribiendo xlsx para caso ${nombre}: ${msg}`, formato }
  }

  const rutaRelativa = path.join("out", nombre, "formulario.xlsx")
  return {
    ok: true,
    data: { ruta: rutaRelativa, formato: "xlsx" },
    n_escritos,
    n_vacios,
  }
}

export const generar_formulario: Tool<typeof generarArgs, GenerarData> = {
  description:
    "Genera el formulario del cliente a partir del mapeo. Soporta xlsx (escribe out/<caso>/formulario.xlsx siguiendo plantilla-celdas.json). pdf y portal devuelven error de 'no implementado' en este slice.",
  args: generarArgs,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const result = await runGenerar(input, ctx)
      if (result.ok) {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_generar_formulario",
          ok: true,
          resumen: {
            formato: result.data.formato,
            ruta: result.data.ruta,
            n_escritos: result.n_escritos,
            n_vacios: result.n_vacios,
          },
        })
        // D2: n_escritos/n_vacios top-level, FUERA de data (data respeta contrato §6.2 literal).
        return JSON.stringify({
          ok: true,
          data: result.data,
          n_escritos: result.n_escritos,
          n_vacios: result.n_vacios,
        })
      }
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_generar_formulario",
        ok: false,
        resumen: {
          caso: input.caso,
          formato: result.formato ?? "desconocido",
          error: result.error,
        },
      })
      return JSON.stringify({ ok: false, error: result.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const error = `fallo generando formulario (caso ${input.caso}): ${msg}`
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_generar_formulario",
        ok: false,
        resumen: { caso: input.caso, error },
      })
      return JSON.stringify({ ok: false, error })
    }
  },
}
