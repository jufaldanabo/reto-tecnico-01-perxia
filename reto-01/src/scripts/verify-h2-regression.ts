import fs from "node:fs/promises"
import path from "node:path"
import { leer_solicitud } from "../tools/proveedor"
import type { Ctx } from "../tools/types"

const testRoot = path.join(import.meta.dir, "..", "..", "out", "_test")
const tempRoot = path.join(testRoot, "02-mapear-campos-h2")

type LeerErr = { ok: false; error: string }
type LeerOk = { ok: true; data: unknown }

function fail(msg: string): never {
  throw new Error(msg)
}

const writeJson = async (p: string, data: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8")
}

const solicitudBase = (overrides: Record<string, unknown>) => ({
  id: "x",
  de: "x@x",
  para: "y@y",
  asunto: "x",
  fecha: "2026-10-05",
  pais: "CO",
  cliente: "x",
  cuerpo: "x",
  formato: "pdf",
  adjuntos: [],
  ...overrides,
})

const casoFormato = "sintetico-formato"
const casoPais = "sintetico-pais"

const prepararCaso = async (nombre: string, solicitud: unknown): Promise<void> => {
  const dir = path.join(tempRoot, "fixtures", "casos", nombre)
  await writeJson(path.join(dir, "solicitud.json"), solicitud)
  await writeJson(path.join(dir, "plantilla-campos.json"), [{ etiqueta: "x", obligatorio: true }])
  await writeJson(path.join(dir, "soportes-exigidos.json"), [])
}

const main = async (): Promise<void> => {
  await fs.rm(testRoot, { recursive: true, force: true })

  // Caso 1: formato inválido.
  await prepararCaso(casoFormato, solicitudBase({ formato: "bogus" }))

  // Caso 2: pais inválido.
  await prepararCaso(casoPais, solicitudBase({ pais: "ZZ" }))

  const ctx: Ctx = { directory: tempRoot, sessionId: "verify-h2" }

  // Caso 1 assert.
  const r1Str = await leer_solicitud.execute({ caso: casoFormato }, ctx)
  const r1 = JSON.parse(r1Str) as LeerOk | LeerErr
  if (r1.ok) fail(`H2-caso1: se esperaba error, llegó ok`)
  const esperado1Prefix = `formato inválido en solicitud (caso ${casoFormato}): ver `
  if (!(r1 as LeerErr).error.startsWith(esperado1Prefix)) {
    fail(`H2-caso1: error no coincide. esperado prefix "${esperado1Prefix}", obtenido: "${(r1 as LeerErr).error}"`)
  }

  // Caso 2 assert.
  const r2Str = await leer_solicitud.execute({ caso: casoPais }, ctx)
  const r2 = JSON.parse(r2Str) as LeerOk | LeerErr
  if (r2.ok) fail(`H2-caso2: se esperaba error, llegó ok`)
  const esperado2Prefix = `pais inválido en solicitud (caso ${casoPais}): ver `
  if (!(r2 as LeerErr).error.startsWith(esperado2Prefix)) {
    fail(`H2-caso2: error no coincide. esperado prefix "${esperado2Prefix}", obtenido: "${(r2 as LeerErr).error}"`)
  }
}

try {
  await main()
  console.log("ok: verify-h2-regression")
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.log(`fail: ${msg}`)
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(1)
}
