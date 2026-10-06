import fs from "node:fs/promises"
import path from "node:path"
import { mapear_campos } from "../tools/proveedor"
import type { Ctx } from "../tools/types"

const testRoot = path.join(import.meta.dir, "..", "..", "out", "_test")
const tempRoot = path.join(testRoot, "02-mapear-campos")

type MapOk = {
  ok: true
  data: {
    llenos: Array<{ etiqueta: string; ruta_maestro: string; valor: unknown; confianza: number }>
    faltantes: Array<{ etiqueta: string; motivo: string }>
    requiere_confirmacion: Array<{
      etiqueta: string
      ruta_maestro?: string
      valor?: unknown
      confianza?: number
      motivo: string
      nota_pais?: string
    }>
  }
}
type MapErr = { ok: false; error: string }

function fail(msg: string): never {
  throw new Error(msg)
}

const writeJson = async (p: string, data: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8")
}

const prepararCaso = async (
  root: string,
  nombre: string,
  solicitud: Record<string, unknown>,
  plantilla: unknown,
  plantillaNombre: "plantilla-campos.json" | "plantilla-celdas.json",
  soportes: string[]
): Promise<void> => {
  const dir = path.join(root, "fixtures", "casos", nombre)
  await writeJson(path.join(dir, "solicitud.json"), solicitud)
  await writeJson(path.join(dir, plantillaNombre), plantilla)
  await writeJson(path.join(dir, "soportes-exigidos.json"), soportes)
}

const solicitudBase = (pais: string, formato: "pdf" | "xlsx" | "portal", nombre: string) => ({
  id: nombre,
  de: "test@example.com",
  para: "recepcion@periferia-ficticia.com",
  asunto: `sintético — ${nombre}`,
  fecha: "2026-10-05",
  pais,
  cliente: "Cliente Sintético S.A.",
  cuerpo: "cuerpo mínimo de prueba",
  formato,
  adjuntos: [],
})

const subAC3 = async (): Promise<void> => {
  // AC-3 (CA2): maestro sin razon_social → faltante y JSON no contiene valores "inventados".
  const root = path.join(tempRoot, "ac3")
  await writeJson(path.join(root, "fixtures", "repositorio", "maestro.json"), {
    // razon_social AUSENTE a propósito
    nit: "900123456",
    pais: "CO",
  })
  await writeJson(path.join(root, "fixtures", "glosario-campos.json"), {
    "Razón social": "razon_social",
    NIT: "nit",
  })
  await prepararCaso(
    root,
    "ac3",
    solicitudBase("CO", "pdf", "ac3"),
    [{ etiqueta: "Razón social", obligatorio: true }],
    "plantilla-campos.json",
    []
  )

  const ctx: Ctx = { directory: root, sessionId: "verify-mapeo-ac3" }
  const resStr = await mapear_campos.execute(
    { caso: "ac3", campos: [{ etiqueta: "Razón social", obligatorio: true }] },
    ctx
  )
  const res = JSON.parse(resStr) as MapOk | MapErr
  if (!res.ok) fail(`AC-3: error inesperado: ${res.error}`)
  const data = (res as MapOk).data

  if (data.llenos.length !== 0) fail(`AC-3: se esperaba 0 llenos, hay ${data.llenos.length}`)
  if (data.faltantes.length !== 1) fail(`AC-3: se esperaba 1 faltante, hay ${data.faltantes.length}`)
  const f = data.faltantes[0]
  if (f.etiqueta !== "Razón social") fail(`AC-3: etiqueta faltante inesperada: ${f.etiqueta}`)
  if (!f.motivo.includes("razon_social")) fail(`AC-3: motivo no cita la ruta: ${f.motivo}`)

  // Asserción fuerte: la respuesta no contiene ningún valor "inventado" (p.ej. "Periferia IT Group").
  const raw = JSON.stringify(data)
  if (raw.includes("Periferia IT Group")) {
    fail(`AC-3: la salida inventó un valor del maestro real: ${raw}`)
  }
}

const subAC5 = async (): Promise<void> => {
  // AC-5 (normalización): "RAZON SOCIAL" (sin tilde, mayúsculas) → match exacto normalizado.
  const root = path.join(tempRoot, "ac5")
  await writeJson(path.join(root, "fixtures", "repositorio", "maestro.json"), {
    razon_social: "Acme S.A.",
  })
  await writeJson(path.join(root, "fixtures", "glosario-campos.json"), {
    "Razón social": "razon_social",
  })
  await prepararCaso(
    root,
    "ac5",
    solicitudBase("CO", "pdf", "ac5"),
    [{ etiqueta: "RAZON SOCIAL", obligatorio: true }],
    "plantilla-campos.json",
    []
  )

  const ctx: Ctx = { directory: root, sessionId: "verify-mapeo-ac5" }
  const resStr = await mapear_campos.execute(
    { caso: "ac5", campos: [{ etiqueta: "RAZON SOCIAL", obligatorio: true }] },
    ctx
  )
  const res = JSON.parse(resStr) as MapOk | MapErr
  if (!res.ok) fail(`AC-5: error inesperado: ${res.error}`)
  const data = (res as MapOk).data

  if (data.llenos.length !== 1) fail(`AC-5: se esperaba 1 lleno, hay ${data.llenos.length}`)
  const l = data.llenos[0]
  if (l.ruta_maestro !== "razon_social") fail(`AC-5: ruta_maestro inesperada: ${l.ruta_maestro}`)
  if (l.valor !== "Acme S.A.") fail(`AC-5: valor inesperado: ${JSON.stringify(l.valor)}`)
  if (l.confianza !== 1.0) fail(`AC-5: confianza esperada 1.0, obtenida ${l.confianza}`)
}

const subAC6 = async (): Promise<void> => {
  // AC-6 (fuzzy ∈ [0.8, 1.0)): "Correo electronicos" (plural) vs "Correo electrónico" (singular).
  const root = path.join(tempRoot, "ac6")
  await writeJson(path.join(root, "fixtures", "repositorio", "maestro.json"), {
    contacto_comercial: { email: "test@example.com" },
  })
  await writeJson(path.join(root, "fixtures", "glosario-campos.json"), {
    "Correo electrónico": "contacto_comercial.email",
  })
  await prepararCaso(
    root,
    "ac6",
    solicitudBase("CO", "pdf", "ac6"),
    [
      { etiqueta: "Correo electronicos", obligatorio: true },
      { etiqueta: "ZZZZZZZZZZZZZZZZZZZZ-totalmente-distinto", obligatorio: true },
    ],
    "plantilla-campos.json",
    []
  )

  const ctx: Ctx = { directory: root, sessionId: "verify-mapeo-ac6" }
  const resStr = await mapear_campos.execute(
    {
      caso: "ac6",
      campos: [
        { etiqueta: "Correo electronicos", obligatorio: true },
        { etiqueta: "ZZZZZZZZZZZZZZZZZZZZ-totalmente-distinto", obligatorio: true },
      ],
    },
    ctx
  )
  const res = JSON.parse(resStr) as MapOk | MapErr
  if (!res.ok) fail(`AC-6: error inesperado: ${res.error}`)
  const data = (res as MapOk).data

  // Fuzzy en [0.8, 1.0) → requiere_confirmacion
  const fuzzy = data.requiere_confirmacion.find((c) => c.etiqueta === "Correo electronicos")
  if (!fuzzy) fail(`AC-6: el campo fuzzy no cayó en requiere_confirmacion`)
  if (fuzzy.confianza === undefined) fail(`AC-6: confianza ausente en item fuzzy`)
  if (!(fuzzy.confianza! >= 0.8 && fuzzy.confianza! < 1.0)) {
    fail(`AC-6: confianza fuera de [0.8, 1.0): ${fuzzy.confianza}`)
  }
  if (!fuzzy.motivo.includes("Correo electrónico")) {
    fail(`AC-6: motivo no cita etiqueta sugerida del glosario: ${fuzzy.motivo}`)
  }

  // Confianza < 0.8 → faltantes
  const bajo = data.faltantes.find((f) => f.etiqueta.startsWith("ZZZZZZZZZZ"))
  if (!bajo) fail(`AC-6: el campo totalmente distinto debería ser faltante`)
  if (!bajo.motivo.includes("confianza <0.8")) {
    fail(`AC-6: motivo de faltante no menciona confianza: ${bajo.motivo}`)
  }
}

const main = async (): Promise<void> => {
  await fs.rm(testRoot, { recursive: true, force: true })
  await subAC3()
  await subAC5()
  await subAC6()
}

try {
  await main()
  console.log("ok: verify-mapeo")
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.log(`fail: ${msg}`)
  await fs.rm(testRoot, { recursive: true, force: true })
  process.exit(1)
}
