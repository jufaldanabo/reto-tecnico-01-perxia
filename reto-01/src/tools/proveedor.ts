import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx, Tool } from "./types"
import { casoDir } from "../lib/paths"
import { appendLog } from "../lib/log"

// Export name: leer_solicitud → modelo lo ve como proveedor_leer_solicitud (archivo_export).

const PAISES = ["CO", "EC", "PE", "PA", "HN"] as const
type Pais = (typeof PAISES)[number]

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

const NOTA_POR_PAIS: Record<Pais, string> = {
  CO: "sugerido: NIT (identificador tributario de Colombia)",
  EC: "sugerido: RUC (identificador tributario de Ecuador)",
  PE: "sugerido: RUC (identificador tributario de Perú)",
  PA: "sugerido: RUC (identificador tributario de Panamá)",
  HN: "sugerido: RTN (identificador tributario de Honduras)",
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

const leerJson = async <T>(
  ruta: string,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
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
    return { ok: false, error: `json inválido en ${ruta}: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
  }
  return { ok: true, data: result.data }
}

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

const args = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
}

const run = async (
  input: { caso: string },
  ctx: Ctx
): Promise<{ ok: true; data: LeerSolicitudData } | { ok: false; error: string }> => {
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
    const msg = solicitudRes.error
    if (msg.startsWith("json inválido")) {
      if (msg.includes("formato")) {
        return { ok: false, error: `formato inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
      if (msg.includes("pais")) {
        return { ok: false, error: `pais inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
      }
    }
    return solicitudRes
  }
  const solicitud = solicitudRes.data

  const soportesRuta = path.join(dir, "soportes-exigidos.json")
  if (!(await existsFile(soportesRuta))) {
    return { ok: false, error: `soportes-exigidos ausente para caso ${nombre}` }
  }
  const soportesRes = await leerJson(soportesRuta, SoportesSchema)
  if (!soportesRes.ok) return soportesRes
  const soportes = soportesRes.data

  let campos: Campo[]
  if (solicitud.formato === "xlsx") {
    const plantillaRuta = path.join(dir, "plantilla-celdas.json")
    if (!(await existsFile(plantillaRuta))) {
      return { ok: false, error: `plantilla ausente para formato xlsx (caso ${nombre})` }
    }
    const plantillaRes = await leerJson(plantillaRuta, PlantillaCeldasSchema)
    if (!plantillaRes.ok) return plantillaRes
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
    if (!plantillaRes.ok) return plantillaRes
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

export const leer_solicitud: Tool<typeof args, LeerSolicitudData> = {
  description:
    "Lee la solicitud, su plantilla y los soportes exigidos de un caso en reto-01/fixtures/casos/<caso>/ y devuelve país, cliente, formato, campos normalizados y soportes exigidos.",
  args,
  async execute(input, ctx) {
    const ts = new Date().toISOString()
    try {
      const result = await run(input, ctx)
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
