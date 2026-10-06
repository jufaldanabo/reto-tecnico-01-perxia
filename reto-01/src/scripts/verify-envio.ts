import fs from "node:fs/promises"
import path from "node:path"
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "../tools/proveedor"
import type { Ctx } from "../tools/types"

const projectRoot = path.join(import.meta.dir, "..", "..")

type EnvioOk = { ok: true; data: { ruta: string } }
type EnvioErr = { ok: false; error: string }

type LeerOk = {
  ok: true
  data: {
    pais: string
    cliente: string
    formato: string
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

function fail(msg: string): never {
  console.log(`fail: ${msg}`)
  process.exit(1)
}

const CASOS_REALES = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
] as const

const verifyCaseReal = async (caso: string, ctx: Ctx): Promise<void> => {
  // Correr cadena previa (leer → mapear → generar → armar) para dejar el paquete.
  const leerStr = await leer_solicitud.execute({ caso }, ctx)
  const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
  if (!leerRes.ok) fail(`${caso}: leer_solicitud falló: ${leerRes.error}`)

  const mapStr = await mapear_campos.execute(
    { caso, campos: (leerRes as LeerOk).data.campos },
    ctx
  )
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) fail(`${caso}: mapear_campos falló: ${mapRes.error}`)

  const genStr = await generar_formulario.execute(
    { caso, mapeo: (mapRes as MapOk).data },
    ctx
  )
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (!genRes.ok && !genRes.error.startsWith("formato portal no implementado")) {
    fail(`${caso}: generar_formulario falló inesperadamente: ${genRes.error}`)
  }

  const armStr = await armar_paquete.execute({ caso }, ctx)
  const armRes = JSON.parse(armStr) as ArmarOk | ArmarErr
  if (!armRes.ok) fail(`${caso}: armar_paquete falló: ${armRes.error}`)

  const envioPath = path.join(ctx.directory, "out", caso, "ENVIO-SIMULADO.md")

  // Rama 1: confirmado:false → "requiere confirmación explícita"
  const env1Str = await simular_envio.execute({ caso, confirmado: false }, ctx)
  const env1 = JSON.parse(env1Str) as EnvioOk | EnvioErr
  if (env1.ok) fail(`${caso}: envio con confirmado:false devolvió ok (esperado error)`)
  if (env1.error !== "requiere confirmación explícita")
    fail(`${caso}: error envio[1] = "${env1.error}" ≠ "requiere confirmación explícita"`)
  // Side effects estrictos (AC-2): no debe existir ENVIO-SIMULADO.md.
  try {
    await fs.access(envioPath)
    fail(`${caso}: ENVIO-SIMULADO.md NO debería existir tras confirmado:false`)
  } catch {
    /* ok: no existe */
  }

  // Rama 2: confirmado:true → "no listo para firma: ..."
  const env2Str = await simular_envio.execute({ caso, confirmado: true }, ctx)
  const env2 = JSON.parse(env2Str) as EnvioOk | EnvioErr
  if (env2.ok) fail(`${caso}: envio con confirmado:true devolvió ok (esperado error no listo)`)
  if (!env2.error.startsWith("no listo para firma:"))
    fail(`${caso}: error envio[2] = "${env2.error}" NO empieza con "no listo para firma:"`)
  // Side effects estrictos (AC-3): no debe existir ENVIO-SIMULADO.md.
  try {
    await fs.access(envioPath)
    fail(`${caso}: ENVIO-SIMULADO.md NO debería existir tras confirmado:true + no listo`)
  } catch {
    /* ok: no existe */
  }
}

// --- Happy path: fixtures sintéticos con vigencia_hasta: 2030-01-01 ---------

const SOLICITUD_SINTETICA = {
  id: "sintetico-ok",
  de: "contratos@acme-sintetica.com",
  para: "recepcion@periferia-ficticia.com",
  asunto: "Registro como proveedor",
  fecha: "2026-10-06",
  pais: "CO",
  cliente: "Acme Sintética S.A.S.",
  cuerpo:
    "Buenos días, agradecemos diligenciar el formato adjunto y remitirlo firmado por el representante legal.",
  formato: "pdf",
  adjuntos: ["Formato_Sintetico.pdf"],
}

const PLANTILLA_SINTETICA = [
  { etiqueta: "Razón social", obligatorio: true },
  { etiqueta: "NIT", obligatorio: true },
]

const SOPORTES_EXIGIDOS_SINTETICOS = ["camara_comercio", "rut"]

const MAESTRO_SINTETICO = {
  razon_social: "Periferia IT Group S.A.S.",
  nit: "900123456",
}

const GLOSARIO_SINTETICO = {
  "Razón social": "razon_social",
  NIT: "nit",
}

const SOPORTES_INDEX_SINTETICO = [
  {
    tipo: "camara_comercio",
    archivo: "camara-sintetica.txt",
    vigencia_hasta: "2030-01-01",
    pais_emisor: "CO",
    descripcion: "Cámara de Comercio sintética",
  },
  {
    tipo: "rut",
    archivo: "rut-sintetico.txt",
    vigencia_hasta: null as string | null,
    pais_emisor: "CO",
    descripcion: "RUT sintético",
  },
]

const verifyHappyPath = async (): Promise<void> => {
  const testRoot = path.join(projectRoot, "out", "_test", "06-simular-envio")
  const caso = "sintetico-ok"

  try {
    // Montar estructura de fixtures.
    const fixturesCasoDir = path.join(testRoot, "fixtures", "casos", caso)
    const fixturesRepoDir = path.join(testRoot, "fixtures", "repositorio")
    const fixturesSoportesDir = path.join(fixturesRepoDir, "soportes")
    await fs.mkdir(fixturesCasoDir, { recursive: true })
    await fs.mkdir(fixturesSoportesDir, { recursive: true })

    await fs.writeFile(
      path.join(fixturesCasoDir, "solicitud.json"),
      JSON.stringify(SOLICITUD_SINTETICA, null, 2),
      "utf8"
    )
    await fs.writeFile(
      path.join(fixturesCasoDir, "plantilla-campos.json"),
      JSON.stringify(PLANTILLA_SINTETICA, null, 2),
      "utf8"
    )
    await fs.writeFile(
      path.join(fixturesCasoDir, "soportes-exigidos.json"),
      JSON.stringify(SOPORTES_EXIGIDOS_SINTETICOS, null, 2),
      "utf8"
    )
    await fs.writeFile(
      path.join(fixturesRepoDir, "maestro.json"),
      JSON.stringify(MAESTRO_SINTETICO, null, 2),
      "utf8"
    )
    await fs.writeFile(
      path.join(testRoot, "fixtures", "glosario-campos.json"),
      JSON.stringify(GLOSARIO_SINTETICO, null, 2),
      "utf8"
    )
    await fs.writeFile(
      path.join(fixturesSoportesDir, "index.json"),
      JSON.stringify(SOPORTES_INDEX_SINTETICO, null, 2),
      "utf8"
    )
    // Archivos físicos de los soportes.
    await fs.writeFile(
      path.join(fixturesSoportesDir, "camara-sintetica.txt"),
      "Cámara de Comercio sintética — placeholder.",
      "utf8"
    )
    await fs.writeFile(
      path.join(fixturesSoportesDir, "rut-sintetico.txt"),
      "RUT sintético — placeholder.",
      "utf8"
    )

    const ctxSintetico: Ctx = { directory: testRoot, sessionId: "verify-envio-sintetico" }

    // Cadena completa.
    const leerStr = await leer_solicitud.execute({ caso }, ctxSintetico)
    const leerRes = JSON.parse(leerStr) as LeerOk | LeerErr
    if (!leerRes.ok) fail(`sintetico: leer falló: ${leerRes.error}`)

    const mapStr = await mapear_campos.execute(
      { caso, campos: (leerRes as LeerOk).data.campos },
      ctxSintetico
    )
    const mapRes = JSON.parse(mapStr) as MapOk | MapErr
    if (!mapRes.ok) fail(`sintetico: mapear falló: ${mapRes.error}`)

    const genStr = await generar_formulario.execute(
      { caso, mapeo: (mapRes as MapOk).data },
      ctxSintetico
    )
    const genRes = JSON.parse(genStr) as GenOk | GenErr
    if (!genRes.ok) fail(`sintetico: generar_formulario falló: ${genRes.error}`)

    const armStr = await armar_paquete.execute({ caso }, ctxSintetico)
    const armRes = JSON.parse(armStr) as ArmarOk | ArmarErr
    if (!armRes.ok) fail(`sintetico: armar_paquete falló: ${armRes.error}`)
    if (!(armRes as ArmarOk).data.listo_para_firma)
      fail(
        `sintetico: listo_para_firma=false (esperado true); bloqueos=${JSON.stringify(
          (armRes as ArmarOk).data.checklist.bloqueos
        )}`
      )

    // Happy path: confirmado:true + listo:true → ok + archivo escrito.
    const envStr = await simular_envio.execute({ caso, confirmado: true }, ctxSintetico)
    const envRes = JSON.parse(envStr) as EnvioOk | EnvioErr
    if (!envRes.ok) fail(`sintetico: envio falló: ${(envRes as EnvioErr).error}`)
    const rutaEsperada = path.join("out", caso, "ENVIO-SIMULADO.md")
    if ((envRes as EnvioOk).data.ruta !== rutaEsperada)
      fail(
        `sintetico: data.ruta = "${(envRes as EnvioOk).data.ruta}" ≠ "${rutaEsperada}"`
      )

    const envioPathAbs = path.join(testRoot, "out", caso, "ENVIO-SIMULADO.md")
    try {
      await fs.access(envioPathAbs)
    } catch {
      fail(`sintetico: ENVIO-SIMULADO.md no existe en ${envioPathAbs}`)
    }

    const contenido = await fs.readFile(envioPathAbs, "utf8")
    const regexEsperados: Array<RegExp> = [
      /^# Envío simulado — /m,
      /^\*\*Para:\*\* /m,
      /^\*\*Asunto:\*\* Re: /m,
      /^\*\*Fecha:\*\* \d{4}-\d{2}-\d{2}$/m,
      /^## Adjuntos$/m,
      /Nota: este envío es SIMULADO/,
      /Representante legal — Periferia IT Group S\.A\.S\./,
    ]
    for (const regex of regexEsperados) {
      if (!regex.test(contenido))
        fail(`sintetico: ENVIO-SIMULADO.md no matchea ${regex}`)
    }
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

const main = async (): Promise<void> => {
  const ctx: Ctx = { directory: projectRoot, sessionId: "verify-envio" }
  for (const caso of CASOS_REALES) {
    await verifyCaseReal(caso, ctx)
  }
  await verifyHappyPath()
  console.log("ok: verify-envio")
}

await main()
