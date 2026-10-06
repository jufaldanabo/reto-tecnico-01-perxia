import fs from "node:fs/promises"
import path from "node:path"
import { leer_solicitud } from "../tools/proveedor"
import type { Ctx } from "../tools/types"

const testRoot = path.join(import.meta.dir, "..", "..", "out", "_test")
const tempRoot = path.join(testRoot, "01-leer-solicitud")
const casoDir = path.join(tempRoot, "fixtures", "casos", "sintetico")

type Fail = { msg: string }

const fail = (msg: string): never => {
  throw new Error(msg) as never
}

const main = async (): Promise<void> => {
  await fs.rm(tempRoot, { recursive: true, force: true })
  await fs.mkdir(casoDir, { recursive: true })

  const solicitud = {
    id: "sintetico",
    de: "test@example.com",
    para: "recepcion@periferia-ficticia.com",
    asunto: "sintético — verify ambiguous",
    fecha: "2026-10-05",
    pais: "EC",
    cliente: "Cliente Sintético S.A.",
    cuerpo: "cuerpo mínimo de prueba",
    formato: "pdf",
    adjuntos: [],
  }
  const plantillaCampos = [
    { etiqueta: "Identificación tributaria", obligatorio: true },
    { etiqueta: "Razón social", obligatorio: true },
  ]
  const soportes: string[] = []

  await fs.writeFile(path.join(casoDir, "solicitud.json"), JSON.stringify(solicitud, null, 2), "utf8")
  await fs.writeFile(path.join(casoDir, "plantilla-campos.json"), JSON.stringify(plantillaCampos, null, 2), "utf8")
  await fs.writeFile(path.join(casoDir, "soportes-exigidos.json"), JSON.stringify(soportes, null, 2), "utf8")

  const ctx: Ctx = { directory: tempRoot, sessionId: "verify-ambiguous" }
  const resStr = await leer_solicitud.execute({ caso: "sintetico" }, ctx)
  const res = JSON.parse(resStr) as
    | { ok: true; data: { campos: Array<{ etiqueta: string; requiere_confirmacion?: true; nota_pais?: string }> } }
    | { ok: false; error: string }

  if (!res.ok) fail(`herramienta devolvió error: ${res.error}`)
  if (!("data" in res)) fail("sin data")

  const data = (res as { ok: true; data: { campos: Array<{ etiqueta: string; requiere_confirmacion?: true; nota_pais?: string }> } }).data

  const ambiguos = data.campos.filter((c) => c.requiere_confirmacion === true)
  if (ambiguos.length !== 1) fail(`se esperaba 1 campo ambiguo, hay ${ambiguos.length}`)
  const amb = ambiguos[0]
  if (amb.etiqueta !== "Identificación tributaria") fail(`etiqueta ambigua inesperada: ${amb.etiqueta}`)
  if (!amb.nota_pais || !amb.nota_pais.startsWith("sugerido: RUC")) {
    fail(`nota_pais inesperada para EC: ${amb.nota_pais}`)
  }

  const benigno = data.campos.find((c) => c.etiqueta === "Razón social")
  if (!benigno) fail("campo benigno 'Razón social' no está presente")
  if (benigno?.requiere_confirmacion) fail("campo benigno marcado como ambiguo")
}

try {
  await main()
  console.log("ok: verify-ambiguous")
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.log(`fail: ${msg}`)
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(1)
}
