import fs from "node:fs/promises"
import path from "node:path"

export type Correo = {
  de: string
  para: string
  asunto: string
  fecha: string
  cuerpo: string
}

export type EnvioAdjuntos = {
  formulario?: string
  soportes: Array<{ tipo: string; archivo: string }>
}

export type EnvioConfig = {
  caso: string
  cliente: string
  pais: string
  formato: "xlsx" | "pdf" | "portal"
  correo: Correo
  adjuntos: EnvioAdjuntos
  envioPath: string
  fecha: string
}

export const renderEnvioSimulado = (c: EnvioConfig): string => {
  const lines: string[] = []
  lines.push(`# Envío simulado — ${c.cliente}`)
  lines.push("")
  lines.push(`**Para:** ${c.correo.de}`)
  lines.push(`**Asunto:** Re: ${c.correo.asunto}`)
  lines.push(`**Fecha:** ${c.fecha}`)
  lines.push(`**Caso:** ${c.caso}`)
  lines.push(`**País:** ${c.pais}`)
  lines.push(`**Formato:** ${c.formato}`)
  lines.push("")
  lines.push(`## Adjuntos`)
  lines.push("")
  if (c.adjuntos.formulario) {
    lines.push(`- Formulario: \`${c.adjuntos.formulario}\``)
  } else {
    lines.push(`- Formulario: pendiente (formato ${c.formato} diferido)`)
  }
  if (c.adjuntos.soportes.length === 0) {
    lines.push(`- Soportes: —`)
  } else {
    lines.push(`- Soportes:`)
    for (const s of c.adjuntos.soportes) {
      lines.push(`  - ${s.tipo} (\`${s.archivo}\`)`)
    }
  }
  lines.push("")
  lines.push(
    `**Nota: este envío es SIMULADO. Ninguna acción externa (correo, portal, firma) fue ejecutada por el agente.**`
  )
  lines.push("")
  lines.push(`Cordialmente,`)
  lines.push("")
  lines.push(`Representante legal — Periferia IT Group S.A.S.`)
  lines.push("")
  return lines.join("\n")
}

export const armarEnvioFS = async (c: EnvioConfig): Promise<void> => {
  await fs.mkdir(path.dirname(c.envioPath), { recursive: true })
  await fs.writeFile(c.envioPath, renderEnvioSimulado(c), "utf8")
}
