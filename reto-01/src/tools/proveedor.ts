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
import {
  escribirFormularioPdf,
  type PlantillaCampo as PdfPlantillaCampo,
  type ContextoPdf,
} from "../lib/pdf"
import { cargarSoportes, clasificarSoportes } from "../lib/soportes"
import { armarPaqueteFS, type ArmarPaqueteConfig, type MapeoRef } from "../lib/paquete"
import { armarEnvioFS, type EnvioConfig } from "../lib/envio"

// Export names:
//   leer_solicitud      → modelo lo ve como proveedor_leer_solicitud
//   mapear_campos       → modelo lo ve como proveedor_mapear_campos
//   generar_formulario  → modelo lo ve como proveedor_generar_formulario
//   armar_paquete       → modelo lo ve como proveedor_armar_paquete
//   simular_envio       → modelo lo ve como proveedor_simular_envio
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
// generar_formulario (xlsx + pdf; portal → error diferido en slice posterior)
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

type GenerarData = { ruta: string; formato: "xlsx" | "pdf" }

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
    const plantillaPdfRuta = path.join(dir, "plantilla-campos.json")
    if (!(await existsFile(plantillaPdfRuta))) {
      return { ok: false, error: `plantilla ausente para formato pdf (caso ${nombre})`, formato }
    }
    const plantillaPdfRes = await leerJson(plantillaPdfRuta, PlantillaCamposSchema)
    if (!plantillaPdfRes.ok) return { ok: false, error: plantillaPdfRes.error, formato }

    const valoresPdf = new Map<string, unknown>()
    for (const l of input.mapeo.llenos) {
      valoresPdf.set(l.etiqueta, l.valor)
    }

    const plantillaPdf: PdfPlantillaCampo[] = plantillaPdfRes.data.map((p) => ({
      etiqueta: p.etiqueta,
      obligatorio: p.obligatorio,
    }))

    const dirSalidaPdf = outDir(ctx, nombre)
    try {
      await fs.mkdir(dirSalidaPdf, { recursive: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `fallo escribiendo pdf para caso ${nombre}: ${msg}`, formato }
    }

    const rutaAbsPdf = path.join(dirSalidaPdf, "formulario.pdf")
    const contextoPdf: ContextoPdf = {
      titulo: `Registro como proveedor — ${solicitudRes.data.cliente}`,
      fecha: new Date().toISOString().slice(0, 10),
    }
    let n_escritos_pdf = 0
    let n_vacios_pdf = 0
    try {
      const r = await escribirFormularioPdf(rutaAbsPdf, plantillaPdf, valoresPdf, contextoPdf)
      n_escritos_pdf = r.n_escritos
      n_vacios_pdf = r.n_vacios
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `fallo escribiendo pdf para caso ${nombre}: ${msg}`, formato }
    }

    const rutaRelativaPdf = path.join("out", nombre, "formulario.pdf")
    return {
      ok: true,
      data: { ruta: rutaRelativaPdf, formato: "pdf" },
      n_escritos: n_escritos_pdf,
      n_vacios: n_vacios_pdf,
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
    "Genera el formulario del cliente a partir del mapeo. Soporta xlsx (escribe out/<caso>/formulario.xlsx siguiendo plantilla-celdas.json) y pdf (escribe out/<caso>/formulario.pdf a partir de plantilla-campos.json). portal devuelve error de 'no implementado'.",
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

// ============================================================================
// armar_paquete
// ============================================================================

const armarArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
}

type ChecklistResumen = {
  soportes: {
    presentes: string[]
    vencidos: string[]
    ausentes: string[]
  }
  bloqueos: string[]
}

type ArmarPaqueteData = {
  ruta: string
  listo_para_firma: boolean
  checklist: ChecklistResumen
}

type ArmarRunResult =
  | {
      ok: true
      data: ArmarPaqueteData
      resumenLog: { n_presentes: number; n_vencidos: number; n_ausentes: number }
    }
  | { ok: false; error: string }

// Función pura (D1 slice 06): calcula estado del paquete SIN escribir archivos.
// Usada por `runArmar` (que agrega la escritura FS) y por `runEnvio`
// (que solo necesita leer el estado para decidir si envía).
type EstadoPaqueteOk = {
  ok: true
  cliente: string
  pais: Pais
  formato: Formato
  correo: Correo
  clasificacion: ReturnType<typeof clasificarSoportes>
  formulario?: ArmarPaqueteConfig["formulario"]
  mapeo: MapeoRef
  listo_para_firma: boolean
  bloqueos: string[]
}
type EstadoPaqueteErr = { ok: false; error: string }
type EstadoPaqueteResult = EstadoPaqueteOk | EstadoPaqueteErr

const calcularEstadoPaquete = async (
  input: { caso: string },
  ctx: Ctx
): Promise<EstadoPaqueteResult> => {
  const nombre = input.caso
  const dir = casoDir(ctx, nombre)
  if (!(await existsDir(dir))) {
    return { ok: false, error: `caso no encontrado: ${nombre}` }
  }

  const leerRes = await runLeer({ caso: nombre }, ctx)
  if (!leerRes.ok) return { ok: false, error: leerRes.error }

  const mapearRes = await runMapear({ caso: nombre, campos: leerRes.data.campos }, ctx)
  if (!mapearRes.ok) return { ok: false, error: mapearRes.error }

  const soportesRes = await cargarSoportes(ctx)
  if (!soportesRes.ok) return { ok: false, error: soportesRes.error }

  const clasificacion = clasificarSoportes(leerRes.data.soportes, soportesRes.data, new Date())

  // Resolver formulario (si existe según formato).
  const outCasoDir = outDir(ctx, nombre)
  let formulario: ArmarPaqueteConfig["formulario"] = undefined
  if (leerRes.data.formato === "xlsx") {
    const ruta = path.join(outCasoDir, "formulario.xlsx")
    if (await existsFile(ruta)) {
      formulario = { rutaOrigen: ruta, nombreDestino: "formulario.xlsx" }
    }
  } else if (leerRes.data.formato === "pdf") {
    const ruta = path.join(outCasoDir, "formulario.pdf")
    if (await existsFile(ruta)) {
      formulario = { rutaOrigen: ruta, nombreDestino: "formulario.pdf" }
    }
  }

  const mapeoRef: MapeoRef = {
    faltantes: mapearRes.data.faltantes.map((f) => ({ etiqueta: f.etiqueta, motivo: f.motivo })),
    requiere_confirmacion: mapearRes.data.requiere_confirmacion.map((r) => ({
      etiqueta: r.etiqueta,
      motivo: r.motivo,
    })),
  }

  // Bloqueos: misma lógica que `armarPaqueteFS`, pero sin escribir.
  const bloqueos: string[] = []
  for (const s of clasificacion.vencidos) {
    bloqueos.push(`Soporte vencido: ${s.tipo} (vigencia_hasta ${s.vigencia_hasta})`)
  }
  for (const tipo of clasificacion.ausentes) {
    bloqueos.push(`Soporte ausente: ${tipo}`)
  }
  if (!formulario) {
    bloqueos.push(`Formulario pendiente — formato ${leerRes.data.formato} diferido`)
  }
  const listo = bloqueos.length === 0

  return {
    ok: true,
    cliente: leerRes.data.cliente,
    pais: leerRes.data.pais,
    formato: leerRes.data.formato,
    correo: leerRes.data.correo,
    clasificacion,
    formulario,
    mapeo: mapeoRef,
    listo_para_firma: listo,
    bloqueos,
  }
}

const runArmar = async (input: { caso: string }, ctx: Ctx): Promise<ArmarRunResult> => {
  const nombre = input.caso

  // D1 slice 06: usar la función pura para el estado; `armarPaqueteFS` escribe.
  const estado = await calcularEstadoPaquete({ caso: nombre }, ctx)
  if (!estado.ok) return { ok: false, error: estado.error }

  const outCasoDir = outDir(ctx, nombre)
  const config: ArmarPaqueteConfig = {
    caso: nombre,
    cliente: estado.cliente,
    pais: estado.pais,
    formato: estado.formato,
    correo: estado.correo,
    clasificacion: estado.clasificacion,
    mapeo: estado.mapeo,
    formulario: estado.formulario,
    paqueteDir: path.join(outCasoDir, "paquete"),
    soportesRepoDir: path.join(ctx.directory, "fixtures", "repositorio", "soportes"),
    fecha: new Date().toISOString().slice(0, 10),
  }

  let resultadoFS
  try {
    resultadoFS = await armarPaqueteFS(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith("fallo copiando soporte") || msg.startsWith("fallo copiando formulario")) {
      return { ok: false, error: msg }
    }
    return { ok: false, error: `fallo armando paquete (caso ${nombre}): ${msg}` }
  }

  // D4: data.ruta con separador "/" explícito al final.
  const rutaRelativa = path.join("out", nombre, "paquete") + "/"

  const data: ArmarPaqueteData = {
    ruta: rutaRelativa,
    listo_para_firma: resultadoFS.listo_para_firma,
    checklist: {
      soportes: {
        presentes: estado.clasificacion.presentes.map((s) => s.tipo),
        vencidos: estado.clasificacion.vencidos.map((s) => s.tipo),
        ausentes: [...estado.clasificacion.ausentes],
      },
      bloqueos: resultadoFS.bloqueos,
    },
  }

  return {
    ok: true,
    data,
    resumenLog: {
      n_presentes: resultadoFS.n_presentes,
      n_vencidos: resultadoFS.n_vencidos,
      n_ausentes: resultadoFS.n_ausentes,
    },
  }
}

export const armar_paquete: Tool<typeof armarArgs, ArmarPaqueteData> = {
  description:
    "Arma el paquete para firma: copia soportes exigidos presentes/vencidos, copia formulario si existe, escribe checklist.md y borrador-correo.md (sin datos bancarios, RN2). Devuelve ruta del paquete, listo_para_firma y resumen del checklist.",
  args: armarArgs,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const result = await runArmar(input, ctx)
      if (result.ok) {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_armar_paquete",
          ok: true,
          resumen: {
            ruta: result.data.ruta,
            listo_para_firma: result.data.listo_para_firma,
            n_presentes: result.resumenLog.n_presentes,
            n_vencidos: result.resumenLog.n_vencidos,
            n_ausentes: result.resumenLog.n_ausentes,
          },
        })
        return JSON.stringify({ ok: true, data: result.data })
      }
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_armar_paquete",
        ok: false,
        resumen: { caso: input.caso, error: result.error },
      })
      return JSON.stringify({ ok: false, error: result.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const error = `fallo armando paquete (caso ${input.caso}): ${msg}`
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_armar_paquete",
        ok: false,
        resumen: { caso: input.caso, error },
      })
      return JSON.stringify({ ok: false, error })
    }
  },
}

// ============================================================================
// simular_envio (HU-4 cierre + RN4 estricto)
// ============================================================================

const simularArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  confirmado: z
    .boolean()
    .default(false)
    .describe(
      "Debe ser true explícito. false o ausente dispara error 'requiere confirmación explícita' sin escribir archivos (CA3/RN4)."
    ),
}

type SimularEnvioData = { ruta: string }

type SimularRunResult =
  | {
      ok: true
      data: SimularEnvioData
      resumenLog: { confirmado: boolean; listo_para_firma: boolean }
    }
  | {
      ok: false
      error: string
      resumenLog: { confirmado: boolean; listo_para_firma?: boolean }
    }

const runEnvio = async (
  input: { caso: string; confirmado: boolean },
  ctx: Ctx
): Promise<SimularRunResult> => {
  const nombre = input.caso

  // 1. Caso inexistente.
  const dir = casoDir(ctx, nombre)
  if (!(await existsDir(dir))) {
    return {
      ok: false,
      error: `caso no encontrado: ${nombre}`,
      resumenLog: { confirmado: input.confirmado },
    }
  }

  // 2. Confirmación requerida (RN4 estricto): sale SIN tocar FS adicional.
  if (input.confirmado !== true) {
    return {
      ok: false,
      error: "requiere confirmación explícita",
      resumenLog: { confirmado: false },
    }
  }

  // 3. Calcular estado del paquete (función pura — no escribe).
  const estado = await calcularEstadoPaquete({ caso: nombre }, ctx)
  if (!estado.ok) {
    return {
      ok: false,
      error: estado.error,
      resumenLog: { confirmado: true },
    }
  }

  // 4. RN3 cascada: si no está listo, error con bloqueos — sin escribir.
  if (!estado.listo_para_firma) {
    return {
      ok: false,
      error: `no listo para firma: ${estado.bloqueos.join("; ")}`,
      resumenLog: { confirmado: true, listo_para_firma: false },
    }
  }

  // 5. Happy path: escribir ENVIO-SIMULADO.md.
  const outCasoDir = outDir(ctx, nombre)
  const envioAbs = path.join(outCasoDir, "ENVIO-SIMULADO.md")
  const soportesAdjuntos = [
    ...estado.clasificacion.presentes,
    ...estado.clasificacion.vencidos,
  ].map((s) => ({ tipo: s.tipo, archivo: s.archivo }))
  const config: EnvioConfig = {
    caso: nombre,
    cliente: estado.cliente,
    pais: estado.pais,
    formato: estado.formato,
    correo: estado.correo,
    adjuntos: {
      formulario: estado.formulario?.nombreDestino,
      soportes: soportesAdjuntos,
    },
    envioPath: envioAbs,
    fecha: new Date().toISOString().slice(0, 10),
  }

  try {
    await armarEnvioFS(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `fallo simulando envío (caso ${nombre}): ${msg}`,
      resumenLog: { confirmado: true, listo_para_firma: true },
    }
  }

  // D4 slice 05 pattern: ruta relativa con "/" explícito.
  const rutaRelativa = path.join("out", nombre, "ENVIO-SIMULADO.md")

  return {
    ok: true,
    data: { ruta: rutaRelativa },
    resumenLog: { confirmado: true, listo_para_firma: true },
  }
}

export const simular_envio: Tool<typeof simularArgs, SimularEnvioData> = {
  description:
    "Simula el envío del paquete al cliente. Requiere confirmado:true explícito y listo_para_firma:true (sin soportes vencidos ni ausentes). Escribe out/<caso>/ENVIO-SIMULADO.md. Si confirmado:false o paquete no listo, devuelve error claro sin side effects (RN4).",
  args: simularArgs,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const r = await runEnvio({ caso: input.caso, confirmado: input.confirmado }, ctx)
      if (r.ok) {
        await appendLog(ctx, input.caso, {
          ts,
          herramienta: "proveedor_simular_envio",
          ok: true,
          resumen: {
            confirmado: true,
            listo_para_firma: true,
            ruta: r.data.ruta,
          },
        })
        return JSON.stringify({ ok: true, data: r.data })
      }
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_simular_envio",
        ok: false,
        resumen: {
          caso: input.caso,
          confirmado: r.resumenLog.confirmado,
          ...(r.resumenLog.listo_para_firma !== undefined && {
            listo_para_firma: r.resumenLog.listo_para_firma,
          }),
          error: r.error,
        },
      })
      return JSON.stringify({ ok: false, error: r.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const error = `fallo simulando envío (caso ${input.caso}): ${msg}`
      await appendLog(ctx, input.caso, {
        ts,
        herramienta: "proveedor_simular_envio",
        ok: false,
        resumen: {
          caso: input.caso,
          confirmado: input.confirmado,
          error,
        },
      })
      return JSON.stringify({ ok: false, error })
    }
  },
}
