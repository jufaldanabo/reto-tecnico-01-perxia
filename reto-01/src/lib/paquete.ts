import fs from "node:fs/promises"
import path from "node:path"
import type { ClasificacionSoportes, SoporteIndexItem } from "./soportes"

export type Correo = {
  de: string
  para: string
  asunto: string
  fecha: string
  cuerpo: string
}

export type MapeoRef = {
  faltantes: Array<{ etiqueta: string; motivo: string }>
  requiere_confirmacion: Array<{ etiqueta: string; motivo: string }>
}

export type ArmarPaqueteConfig = {
  caso: string
  cliente: string
  pais: string
  formato: "xlsx" | "pdf" | "portal"
  correo: Correo
  clasificacion: ClasificacionSoportes
  mapeo: MapeoRef
  formulario?: { rutaOrigen: string; nombreDestino: string }
  paqueteDir: string
  soportesRepoDir: string
  fecha: string
}

export type ArmarPaqueteResultado = {
  listo_para_firma: boolean
  bloqueos: string[]
  n_presentes: number
  n_vencidos: number
  n_ausentes: number
}

// Display names RN2-safe: ninguno contiene "cuenta" / "SWIFT" / "número de cuenta" / "bancolombia".
const DISPLAY_SOPORTE: Record<string, string> = {
  camara_comercio: "Cámara de Comercio",
  rut: "RUT",
  certificacion_bancaria: "Certificación bancaria",
  parafiscales: "Parafiscales",
  estados_financieros: "Estados financieros",
  certificado_iso_9001: "Certificado ISO 9001",
}

const displayTipo = (tipo: string): string =>
  DISPLAY_SOPORTE[tipo] ?? tipo.replace(/_/g, " ")

export const renderChecklist = (
  c: ArmarPaqueteConfig,
  bloqueos: string[],
  listo: boolean
): string => {
  const lines: string[] = []
  lines.push(`# Checklist — ${c.cliente}`)
  lines.push("")
  lines.push(`**Caso:** ${c.caso}`)
  lines.push(`**Fecha:** ${c.fecha}`)
  lines.push(`**País:** ${c.pais}`)
  lines.push(`**Formato:** ${c.formato}`)
  lines.push("")
  lines.push("## Formulario")
  lines.push("")
  if (c.formulario) {
    lines.push(`- Incluido: \`${c.formulario.nombreDestino}\` (formato: ${c.formato})`)
  } else {
    lines.push(`- Formulario pendiente — formato ${c.formato} diferido`)
  }
  lines.push("")
  lines.push("## Soportes")
  lines.push("")
  lines.push("| tipo | estado | archivo | vigencia_hasta |")
  lines.push("|---|---|---|---|")
  for (const s of c.clasificacion.presentes) {
    lines.push(`| ${s.tipo} | presente | ${s.archivo} | ${s.vigencia_hasta ?? "—"} |`)
  }
  for (const s of c.clasificacion.vencidos) {
    lines.push(`| ${s.tipo} | vencido | ${s.archivo} | ${s.vigencia_hasta} |`)
  }
  for (const tipo of c.clasificacion.ausentes) {
    lines.push(`| ${tipo} | ausente | — | — |`)
  }
  lines.push("")
  lines.push(`### Resumen soportes`)
  lines.push("")
  lines.push(
    `- Presentes (${c.clasificacion.presentes.length}): ${
      c.clasificacion.presentes.map((s) => s.tipo).join(", ") || "—"
    }`
  )
  lines.push(
    `- Vencidos (${c.clasificacion.vencidos.length}): ${
      c.clasificacion.vencidos.map((s) => s.tipo).join(", ") || "—"
    }`
  )
  lines.push(
    `- Ausentes (${c.clasificacion.ausentes.length}): ${c.clasificacion.ausentes.join(", ") || "—"}`
  )
  lines.push("")
  lines.push("## Campos del mapeo")
  lines.push("")
  lines.push(`### Faltantes (${c.mapeo.faltantes.length})`)
  lines.push("")
  if (c.mapeo.faltantes.length === 0) lines.push("- —")
  else for (const f of c.mapeo.faltantes) lines.push(`- **${f.etiqueta}**: ${f.motivo}`)
  lines.push("")
  lines.push(`### Requiere confirmación (${c.mapeo.requiere_confirmacion.length})`)
  lines.push("")
  if (c.mapeo.requiere_confirmacion.length === 0) lines.push("- —")
  else for (const r of c.mapeo.requiere_confirmacion) lines.push(`- **${r.etiqueta}**: ${r.motivo}`)
  lines.push("")
  lines.push("## Bloqueos")
  lines.push("")
  if (bloqueos.length === 0) lines.push("- —")
  else for (const b of bloqueos) lines.push(`- ${b}`)
  lines.push("")
  lines.push("## Estado final")
  lines.push("")
  lines.push(`**listo_para_firma:** \`${listo}\``)
  lines.push("")
  return lines.join("\n")
}

export const renderBorradorCorreo = (c: ArmarPaqueteConfig): string => {
  const lines: string[] = []
  lines.push(`# Borrador — correo de respuesta`)
  lines.push("")
  lines.push(`**Para:** ${c.correo.de}`)
  lines.push(`**Asunto:** Re: ${c.correo.asunto}`)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(`Buenos días,`)
  lines.push("")
  if (c.formulario) {
    lines.push(
      `Adjuntamos el formulario diligenciado para el registro como proveedor y los siguientes soportes:`
    )
  } else {
    lines.push(`Adjuntamos los siguientes soportes para el registro como proveedor:`)
  }
  lines.push("")
  const incluir: SoporteIndexItem[] = [
    ...c.clasificacion.presentes,
    ...c.clasificacion.vencidos,
  ]
  if (incluir.length === 0) lines.push("- —")
  else for (const s of incluir) lines.push(`- ${displayTipo(s.tipo)} (${s.archivo})`)
  lines.push("")
  lines.push(`Quedamos atentos a su confirmación.`)
  lines.push("")
  lines.push(`Cordialmente,`)
  lines.push("")
  lines.push(`Representante legal — Periferia IT Group S.A.S.`)
  lines.push("")
  return lines.join("\n")
}

export const armarPaqueteFS = async (c: ArmarPaqueteConfig): Promise<ArmarPaqueteResultado> => {
  const soportesDir = path.join(c.paqueteDir, "soportes")
  await fs.mkdir(soportesDir, { recursive: true })

  for (const s of [...c.clasificacion.presentes, ...c.clasificacion.vencidos]) {
    const src = path.join(c.soportesRepoDir, s.archivo)
    const dst = path.join(soportesDir, s.archivo)
    try {
      await fs.copyFile(src, dst)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`fallo copiando soporte ${s.archivo}: ${msg}`)
    }
  }

  if (c.formulario) {
    const dst = path.join(c.paqueteDir, c.formulario.nombreDestino)
    try {
      await fs.copyFile(c.formulario.rutaOrigen, dst)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`fallo copiando formulario ${c.formulario.nombreDestino}: ${msg}`)
    }
  }

  const bloqueos: string[] = []
  for (const s of c.clasificacion.vencidos) {
    bloqueos.push(`Soporte vencido: ${s.tipo} (vigencia_hasta ${s.vigencia_hasta})`)
  }
  for (const tipo of c.clasificacion.ausentes) {
    bloqueos.push(`Soporte ausente: ${tipo}`)
  }
  if (!c.formulario) {
    bloqueos.push(`Formulario pendiente — formato ${c.formato} diferido`)
  }
  const listo = bloqueos.length === 0

  await fs.writeFile(
    path.join(c.paqueteDir, "checklist.md"),
    renderChecklist(c, bloqueos, listo),
    "utf8"
  )
  await fs.writeFile(
    path.join(c.paqueteDir, "borrador-correo.md"),
    renderBorradorCorreo(c),
    "utf8"
  )

  return {
    listo_para_firma: listo,
    bloqueos,
    n_presentes: c.clasificacion.presentes.length,
    n_vencidos: c.clasificacion.vencidos.length,
    n_ausentes: c.clasificacion.ausentes.length,
  }
}
