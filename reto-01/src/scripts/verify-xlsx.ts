import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
} from "../tools/proveedor"
import type { Ctx } from "../tools/types"
import { escribirFormulario, type PlantillaCelda } from "../lib/xlsx"

const projectRoot = path.join(import.meta.dir, "..", "..")
const testRoot = path.join(projectRoot, "out", "_test")
const determRoot = path.join(testRoot, "03-generar-xlsx")

const ctx: Ctx = { directory: projectRoot, sessionId: "verify-xlsx" }

type LeerOk = {
  ok: true
  data: { pais: string; formato: string; campos: Array<{ etiqueta: string; obligatorio: boolean }>; soportes: string[] }
}
type LeerErr = { ok: false; error: string }

type MapOk = {
  ok: true
  data: {
    llenos: Array<{ etiqueta: string; ruta_maestro: string; valor: unknown; confianza: number }>
    faltantes: Array<{ etiqueta: string; motivo: string }>
    requiere_confirmacion: Array<{ etiqueta: string; motivo: string }>
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

type CellSnapshot = { hoja: string; celda: string; valor: unknown }

function fail(msg: string): never {
  throw new Error(msg)
}

const assertEq = (actual: unknown, expected: unknown, msg: string): void => {
  if (actual !== expected) {
    fail(`${msg}: esperado=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
  }
}

const readPlantilla = async (caso: string): Promise<PlantillaCelda[]> => {
  const ruta = path.join(projectRoot, "fixtures", "casos", caso, "plantilla-celdas.json")
  const raw = await fs.readFile(ruta, "utf8")
  const data = JSON.parse(raw) as Array<{
    hoja: string
    celda_etiqueta: string
    etiqueta: string
    celda_valor: string
  }>
  return data.map((p) => ({
    hoja: p.hoja,
    celda_etiqueta: p.celda_etiqueta,
    etiqueta: p.etiqueta,
    celda_valor: p.celda_valor,
  }))
}

const serializeExpected = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}

const cellValueToJs = (v: ExcelJS.CellValue): unknown => {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && v !== null && "result" in v) {
    return (v as { result?: unknown }).result ?? null
  }
  if (typeof v === "object" && v !== null && "text" in v) {
    return (v as { text?: unknown }).text ?? null
  }
  return v
}

const verifyCaseXlsx = async (caso: string): Promise<void> => {
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`leer_solicitud(${caso}): ${leerRes.error}`)

  const mapStr = await mapear_campos.execute({ caso, campos: leerRes.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`mapear_campos(${caso}): ${mapRes.error}`)

  const genStr = await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (!genRes.ok) fail(`generar_formulario(${caso}): ${genRes.error}`)
  if (genRes.data.formato !== "xlsx") fail(`formato esperado xlsx, actual: ${genRes.data.formato}`)

  const rutaAbs = path.join(projectRoot, genRes.data.ruta)
  const plantilla = await readPlantilla(caso)
  const valores = new Map<string, unknown>()
  for (const l of mapRes.data.llenos) valores.set(l.etiqueta, l.valor)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(rutaAbs)

  for (const p of plantilla) {
    const ws = wb.getWorksheet(p.hoja)
    if (!ws) fail(`hoja ausente en ${caso}: ${p.hoja}`)
    const et = cellValueToJs(ws.getCell(p.celda_etiqueta).value)
    if (et !== p.etiqueta) {
      fail(`${caso}/${p.hoja}/${p.celda_etiqueta}: etiqueta esperada='${p.etiqueta}' actual=${JSON.stringify(et)}`)
    }
    const expected = valores.has(p.etiqueta) ? serializeExpected(valores.get(p.etiqueta)) : null
    const actual = cellValueToJs(ws.getCell(p.celda_valor).value)
    const actualNorm = actual === "" ? null : actual
    if (JSON.stringify(actualNorm) !== JSON.stringify(expected)) {
      fail(
        `${caso}/${p.hoja}/${p.celda_valor} (${p.etiqueta}): esperado=${JSON.stringify(expected)} actual=${JSON.stringify(actualNorm)}`
      )
    }
  }

  // Para CO, verificar multi-sheet.
  if (caso === "co-industrias-delta") {
    const nombres = wb.worksheets.map((w) => w.name)
    if (!nombres.includes("Datos Proveedor")) fail(`CO: falta hoja 'Datos Proveedor'; actual: ${nombres.join(",")}`)
    if (!nombres.includes("Datos Bancarios")) fail(`CO: falta hoja 'Datos Bancarios'; actual: ${nombres.join(",")}`)
  }
}

const verifyCaseNoXlsx = async (caso: string, errorPrefix: string): Promise<void> => {
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`leer_solicitud(${caso}): ${leerRes.error}`)

  const mapStr = await mapear_campos.execute({ caso, campos: leerRes.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`mapear_campos(${caso}): ${mapRes.error}`)

  const genStr = await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (genRes.ok) fail(`${caso}: esperaba ok:false para formato no soportado, obtuvo ok:true`)
  if (!genRes.error.startsWith(errorPrefix)) {
    fail(`${caso}: error no empieza con '${errorPrefix}'; actual: '${genRes.error}'`)
  }

  const rutaAbs = path.join(projectRoot, "out", caso, "formulario.xlsx")
  try {
    await fs.access(rutaAbs)
    fail(`${caso}: formulario.xlsx NO debería existir, pero existe en ${rutaAbs}`)
  } catch {
    // esperado: no existe.
  }
}

// Para casos cuyo formato ≠ xlsx y que ya producen otro formato (p. ej. pdf en slice 04),
// solo verifica que formulario.xlsx NO se cree, sin importar el retorno de generar_formulario.
const verifyXlsxAbsent = async (caso: string): Promise<void> => {
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`leer_solicitud(${caso}): ${leerRes.error}`)

  const mapStr = await mapear_campos.execute({ caso, campos: leerRes.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`mapear_campos(${caso}): ${mapRes.error}`)

  await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)

  const rutaAbs = path.join(projectRoot, "out", caso, "formulario.xlsx")
  try {
    await fs.access(rutaAbs)
    fail(`${caso}: formulario.xlsx NO debería existir, pero existe en ${rutaAbs}`)
  } catch {
    // esperado: no existe.
  }
}

const snapshotXlsx = async (ruta: string): Promise<CellSnapshot[]> => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ruta)
  const out: CellSnapshot[] = []
  wb.worksheets.forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        out.push({ hoja: ws.name, celda: cell.address, valor: cellValueToJs(cell.value) })
      })
    })
  })
  out.sort((a, b) => (a.hoja + a.celda).localeCompare(b.hoja + b.celda))
  return out
}

const verifyDeterminismo = async (): Promise<void> => {
  await fs.mkdir(determRoot, { recursive: true })
  const plantilla: PlantillaCelda[] = [
    { hoja: "H1", celda_etiqueta: "A1", etiqueta: "Nombre", celda_valor: "B1" },
    { hoja: "H1", celda_etiqueta: "A2", etiqueta: "NIT", celda_valor: "B2" },
    { hoja: "H2", celda_etiqueta: "A1", etiqueta: "Banco", celda_valor: "B1" },
  ]
  const valores = new Map<string, unknown>([
    ["Nombre", "Acme S.A."],
    ["NIT", "900123456"],
    // "Banco" sin valor → vacío.
  ])
  const a = path.join(determRoot, "a.xlsx")
  const b = path.join(determRoot, "b.xlsx")
  await escribirFormulario(a, plantilla, valores)
  await escribirFormulario(b, plantilla, valores)
  const sa = await snapshotXlsx(a)
  const sb = await snapshotXlsx(b)
  if (JSON.stringify(sa) !== JSON.stringify(sb)) {
    fail(`determinismo xlsx: snapshot diferente\n  a=${JSON.stringify(sa)}\n  b=${JSON.stringify(sb)}`)
  }
}

const main = async (): Promise<void> => {
  try {
    await fs.rm(testRoot, { recursive: true, force: true })
    // Fidelidad + multi-sheet para xlsx.
    await verifyCaseXlsx("co-industrias-delta")
    await verifyCaseXlsx("hn-agroexport-sula")
    // Formatos distintos a xlsx: archivo xlsx no debe crearse.
    // EC (pdf) ya produce ok:true tras slice 04 → solo chequeamos ausencia del xlsx.
    // PA (portal) sigue devolviendo ok:false con error de portal.
    await verifyXlsxAbsent("ec-corp-andina")
    await verifyCaseNoXlsx("pa-logistica-istmo", "formato portal no implementado")
    // Determinismo del escritor.
    await verifyDeterminismo()
    console.log("ok: verify-xlsx")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`fail: ${msg}`)
    process.exit(1)
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

await main()
