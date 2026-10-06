import fs from "node:fs/promises"
import path from "node:path"
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
} from "../tools/proveedor"
import type { Ctx } from "../tools/types"
import {
  clasificarSoportes,
  type SoporteIndex,
  type SoporteIndexItem,
} from "../lib/soportes"

const projectRoot = path.join(import.meta.dir, "..", "..")
const ctx: Ctx = { directory: projectRoot, sessionId: "verify-paquete" }

type LeerOk = {
  ok: true
  data: {
    pais: string
    cliente: string
    formato: string
    campos: Array<{ etiqueta: string; obligatorio: boolean }>
    soportes: string[]
    correo: { de: string; asunto: string }
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

type GenOk = { ok: true; data: { ruta: string; formato: string } }
type GenErr = { ok: false; error: string }

type ArmarOk = {
  ok: true
  data: {
    ruta: string
    listo_para_firma: boolean
    checklist: {
      soportes: { presentes: string[]; vencidos: string[]; ausentes: string[] }
      bloqueos: string[]
    }
  }
}
type ArmarErr = { ok: false; error: string }

const PATRONES_RN2 = [
  "Bancolombia",
  "03100012345",
  "COLOCOBM",
  "SWIFT",
  "Número de cuenta",
  "cuenta bancaria",
]

const fail = (msg: string): never => {
  console.log(`fail: ${msg}`)
  process.exit(1)
}

const casosXlsx = new Set(["co-industrias-delta", "hn-agroexport-sula"])
const casosPdf = new Set(["ec-corp-andina"])
const casosPortal = new Set(["pa-logistica-istmo"])

const verifyCase = async (caso: string): Promise<void> => {
  // 1. Ejecutar cadena completa.
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`${caso}: leer_solicitud falló: ${leerRes.error}`)
  const leerOk = leerRes as LeerOk

  const mapStr = await mapear_campos.execute(
    { caso, campos: leerOk.data.campos },
    ctx
  )
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`${caso}: mapear_campos falló: ${mapRes.error}`)
  const mapOk = mapRes as MapOk

  const genStr = await generar_formulario.execute(
    { caso, mapeo: mapOk.data },
    ctx
  )
  // Para xlsx/pdf debe ser ok; para portal (PA) devuelve error diferido — ambos aceptados.
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (!genRes.ok && !genRes.error.startsWith("formato portal no implementado")) {
    fail(`${caso}: generar_formulario falló inesperadamente: ${genRes.error}`)
  }

  const armStr = await armar_paquete.execute({ caso }, ctx)
  const armRes = JSON.parse(armStr) as ArmarOk | ArmarErr
  if (!armRes.ok) fail(`${caso}: armar_paquete falló: ${armRes.error}`)
  const arm = armRes as ArmarOk

  // 2. data.ruta exacta.
  const rutaEsperada = "out/" + caso + "/paquete/"
  if (arm.data.ruta !== rutaEsperada)
    fail(`${caso}: data.ruta = "${arm.data.ruta}" ≠ "${rutaEsperada}"`)

  // 3. listo_para_firma debe ser false (fixture 2026-10-06, camara_comercio vencido).
  if (arm.data.listo_para_firma !== false)
    fail(`${caso}: listo_para_firma = ${arm.data.listo_para_firma} (esperado false)`)
  if (arm.data.checklist.bloqueos.length === 0)
    fail(`${caso}: bloqueos.length = 0 (esperado >0)`)

  // 4. Expectativa de clasificación de soportes.
  const indexRaw = await fs.readFile(
    path.join(projectRoot, "fixtures", "repositorio", "soportes", "index.json"),
    "utf8"
  )
  const index = JSON.parse(indexRaw) as SoporteIndex
  const esperadoClas = clasificarSoportes(leerOk.data.soportes, index, new Date())
  const esperadoP = esperadoClas.presentes.map((s: SoporteIndexItem) => s.tipo).sort()
  const esperadoV = esperadoClas.vencidos.map((s: SoporteIndexItem) => s.tipo).sort()
  const esperadoA = [...esperadoClas.ausentes].sort()
  const realP = [...arm.data.checklist.soportes.presentes].sort()
  const realV = [...arm.data.checklist.soportes.vencidos].sort()
  const realA = [...arm.data.checklist.soportes.ausentes].sort()
  if (realP.join(",") !== esperadoP.join(","))
    fail(`${caso}: presentes [${realP.join(",")}] ≠ [${esperadoP.join(",")}]`)
  if (realV.join(",") !== esperadoV.join(","))
    fail(`${caso}: vencidos [${realV.join(",")}] ≠ [${esperadoV.join(",")}]`)
  if (realA.join(",") !== esperadoA.join(","))
    fail(`${caso}: ausentes [${realA.join(",")}] ≠ [${esperadoA.join(",")}]`)

  // 5. Archivos físicos de soportes en el paquete.
  const paqueteDir = path.join(projectRoot, "out", caso, "paquete")
  const soportesDir = path.join(paqueteDir, "soportes")
  const archivosReales = (await fs.readdir(soportesDir)).sort()
  const archivosEsperados = [
    ...esperadoClas.presentes.map((s) => s.archivo),
    ...esperadoClas.vencidos.map((s) => s.archivo),
  ].sort()
  if (archivosReales.join(",") !== archivosEsperados.join(","))
    fail(
      `${caso}: soportes/ [${archivosReales.join(",")}] ≠ [${archivosEsperados.join(",")}]`
    )

  // 6. Formulario copiado según formato.
  if (casosXlsx.has(caso)) {
    const ruta = path.join(paqueteDir, "formulario.xlsx")
    try {
      await fs.access(ruta)
    } catch {
      fail(`${caso}: formulario.xlsx ausente en paquete`)
    }
  } else if (casosPdf.has(caso)) {
    const ruta = path.join(paqueteDir, "formulario.pdf")
    try {
      await fs.access(ruta)
    } catch {
      fail(`${caso}: formulario.pdf ausente en paquete`)
    }
  } else if (casosPortal.has(caso)) {
    for (const nombre of ["formulario.xlsx", "formulario.pdf"]) {
      try {
        await fs.access(path.join(paqueteDir, nombre))
        fail(`${caso}: no debería existir ${nombre} para portal`)
      } catch {
        /* ok: no existe */
      }
    }
  }

  // 7. checklist.md tiene secciones esperadas.
  const checklistTxt = await fs.readFile(path.join(paqueteDir, "checklist.md"), "utf8")
  for (const regex of [
    /^# Checklist /m,
    /^## Soportes$/m,
    /^## Campos del mapeo$/m,
    /^## Bloqueos$/m,
    /\*\*listo_para_firma:\*\* `false`/,
  ]) {
    if (!regex.test(checklistTxt))
      fail(`${caso}: checklist.md no matchea ${regex}`)
  }

  // 8. RN2 scan sobre borrador-correo.md.
  const borradorPath = path.join(paqueteDir, "borrador-correo.md")
  const borradorTxt = await fs.readFile(borradorPath, "utf8")
  const borradorLower = borradorTxt.toLowerCase()
  for (const patron of PATRONES_RN2) {
    if (borradorLower.includes(patron.toLowerCase()))
      fail(`${caso}: borrador-correo.md contiene patrón RN2 prohibido "${patron}"`)
  }
  // 9. Firma genérica + asunto Re:.
  if (!borradorTxt.includes("Representante legal — Periferia IT Group S.A.S."))
    fail(`${caso}: borrador-correo.md no contiene firma genérica`)
  if (!borradorTxt.includes(`Re: ${leerOk.data.correo.asunto}`))
    fail(`${caso}: borrador-correo.md no contiene asunto Re:`)
}

const main = async (): Promise<void> => {
  const casos = [
    "co-industrias-delta",
    "ec-corp-andina",
    "hn-agroexport-sula",
    "pa-logistica-istmo",
  ]
  for (const caso of casos) {
    await verifyCase(caso)
  }
  console.log("ok: verify-paquete")
}

await main()
