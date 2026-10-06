import fs from "node:fs/promises"
import path from "node:path"
// Workaround R3: pdf-parse index.js ejecuta un test file al cargarse.
// Importamos directamente el módulo interno para evitarlo.
// pdf-parse no publica tipos; narrowing explícito aquí (patrón `as unknown as X`).
// @ts-expect-error — ningún .d.ts para esta ruta interna
import pdfParseRaw from "pdf-parse/lib/pdf-parse.js"
const pdfParse = pdfParseRaw as unknown as (buf: Buffer) => Promise<{ text: string }>
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
} from "../tools/proveedor"
import type { Ctx } from "../tools/types"
import {
  escribirFormularioPdf,
  type PlantillaCampo,
  type ContextoPdf,
} from "../lib/pdf"

const projectRoot = path.join(import.meta.dir, "..", "..")
const testRoot = path.join(projectRoot, "out", "_test")
const determRoot = path.join(testRoot, "04-generar-pdf")

const ctx: Ctx = { directory: projectRoot, sessionId: "verify-pdf" }

type LeerOk = {
  ok: true
  data: {
    pais: string
    formato: string
    cliente: string
    campos: Array<{ etiqueta: string; obligatorio: boolean }>
    soportes: string[]
  }
}
type LeerErr = { ok: false; error: string }

type MapOk = {
  ok: true
  data: {
    llenos: Array<{ etiqueta: string; valor: unknown }>
    faltantes: Array<{ etiqueta: string }>
    requiere_confirmacion: Array<{ etiqueta: string }>
  }
}
type MapErr = { ok: false; error: string }

type GenOk = {
  ok: true
  data: { ruta: string; formato: string }
  n_escritos?: number
  n_vacios?: number
}
type GenErr = { ok: false; error: string }

function fail(msg: string): never {
  throw new Error(msg)
}

const readPlantillaCampos = async (
  caso: string
): Promise<PlantillaCampo[]> => {
  const ruta = path.join(projectRoot, "fixtures", "casos", caso, "plantilla-campos.json")
  const raw = await fs.readFile(ruta, "utf8")
  const data = JSON.parse(raw) as Array<{ etiqueta: string; obligatorio: boolean }>
  return data
}

const serializeExpected = (v: unknown): string => {
  if (v === null || v === undefined) return "___"
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}

const snapshotPdf = async (ruta: string): Promise<string> => {
  const buf = await fs.readFile(ruta)
  const parsed = await pdfParse(buf)
  return parsed.text
    .split(/\r?\n/)
    .map((l: string) => l.replace(/\s+/g, " ").trim())
    .filter((l: string) => l.length > 0)
    .join("\n")
}

const verifyCasePdf = async (caso: string): Promise<void> => {
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`leer_solicitud(${caso}): ${leerRes.error}`)

  const mapStr = await mapear_campos.execute({ caso, campos: leerRes.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`mapear_campos(${caso}): ${mapRes.error}`)

  const genStr = await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (!genRes.ok) fail(`generar_formulario(${caso}): ${genRes.error}`)
  if (genRes.data.formato !== "pdf") fail(`${caso}: esperaba formato pdf, actual: ${genRes.data.formato}`)

  const rutaAbs = path.join(projectRoot, genRes.data.ruta)
  const st = await fs.stat(rutaAbs)
  if (st.size <= 0) fail(`${caso}: formulario.pdf vacío (${st.size} bytes)`)

  // Fidelidad: extraer texto y afirmar orden y contenido.
  const snapshot = await snapshotPdf(rutaAbs)
  const plantilla = await readPlantillaCampos(caso)
  const valores = new Map<string, unknown>()
  for (const l of mapRes.data.llenos) valores.set(l.etiqueta, l.valor)

  // Normalización plana (sin saltos) para búsquedas de substring que crucen líneas
  // (pdfkit puede partir valores largos en varias líneas por word-wrap).
  const flat = snapshot.replace(/\n/g, " ")

  // AC-5: título con cliente.
  const tituloEsperado = `Registro como proveedor — ${leerRes.data.cliente}`
  if (!flat.includes(tituloEsperado)) {
    fail(`${caso}: no se encontró el título esperado '${tituloEsperado}' en el snapshot`)
  }

  // AC-3/AC-4: cada etiqueta aparece en orden; valor esperado o '___' entre etiquetas.
  let cursor = 0
  for (let i = 0; i < plantilla.length; i++) {
    const p = plantilla[i]!
    const idx = flat.indexOf(p.etiqueta, cursor)
    if (idx === -1) {
      fail(`${caso}: etiqueta '${p.etiqueta}' no encontrada (posición ≥ ${cursor}) en snapshot`)
    }

    // Delimitar la "ventana" de este campo hasta la siguiente etiqueta.
    let ventanaFin = flat.length
    if (i + 1 < plantilla.length) {
      const sig = plantilla[i + 1]!.etiqueta
      const idxSig = flat.indexOf(sig, idx + p.etiqueta.length)
      if (idxSig !== -1) ventanaFin = idxSig
    }
    const ventana = flat.slice(idx, ventanaFin)

    // Afirmar que el valor esperado o '___' aparece en la ventana.
    const esperado = valores.has(p.etiqueta) ? serializeExpected(valores.get(p.etiqueta)) : "___"
    if (!ventana.includes(esperado)) {
      fail(
        `${caso}: campo '${p.etiqueta}' no muestra el valor esperado '${esperado}' en su ventana. Ventana: '${ventana.slice(0, 200)}'`
      )
    }

    cursor = idx + p.etiqueta.length
  }
}

const verifyCaseNoPdf = async (caso: string, errorPrefix: string): Promise<void> => {
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`leer_solicitud(${caso}): ${leerRes.error}`)

  const mapStr = await mapear_campos.execute({ caso, campos: leerRes.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`mapear_campos(${caso}): ${mapRes.error}`)

  const genStr = await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (genRes.ok) fail(`${caso}: esperaba ok:false, obtuvo ok:true`)
  if (!genRes.error.startsWith(errorPrefix)) {
    fail(`${caso}: error no empieza con '${errorPrefix}'; actual: '${genRes.error}'`)
  }

  const rutaAbs = path.join(projectRoot, "out", caso, "formulario.pdf")
  try {
    await fs.access(rutaAbs)
    fail(`${caso}: formulario.pdf NO debería existir, pero existe en ${rutaAbs}`)
  } catch {
    // esperado.
  }
}

const verifyDeterminismoPdf = async (): Promise<void> => {
  await fs.mkdir(determRoot, { recursive: true })
  const plantilla: PlantillaCampo[] = [
    { etiqueta: "Nombre", obligatorio: true },
    { etiqueta: "Ciudad", obligatorio: false },
    { etiqueta: "SWIFT", obligatorio: true },
  ]
  const valores = new Map<string, unknown>([
    ["Nombre", "Acme S.A."],
    ["Ciudad", "Medellín"],
    // "SWIFT" sin valor → '___'.
  ])
  const contexto: ContextoPdf = {
    titulo: "Registro como proveedor — Determinismo Test",
    fecha: "2026-10-05",
  }
  const a = path.join(determRoot, "a.pdf")
  const b = path.join(determRoot, "b.pdf")
  await escribirFormularioPdf(a, plantilla, valores, contexto)
  await escribirFormularioPdf(b, plantilla, valores, contexto)
  const sa = await snapshotPdf(a)
  const sb = await snapshotPdf(b)
  if (sa !== sb) {
    fail(`determinismo pdf: snapshots difieren\n--- a ---\n${sa}\n--- b ---\n${sb}`)
  }
}

const main = async (): Promise<void> => {
  // Evitar que fs.rm pise archivos legítimos de slice 03.
  try {
    await fs.rm(testRoot, { recursive: true, force: true })
    await verifyCasePdf("ec-corp-andina")
    await verifyCaseNoPdf("pa-logistica-istmo", "formato portal no implementado")
    await verifyDeterminismoPdf()
    console.log("ok: verify-pdf")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`fail: ${msg}`)
    process.exit(1)
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

await main()
