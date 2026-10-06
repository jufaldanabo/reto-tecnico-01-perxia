import fs from "node:fs"
import PDFDocument from "pdfkit"
import { serializarValor, type Serializable } from "./serialize"

export type PlantillaCampo = {
  etiqueta: string
  obligatorio: boolean
}

export type EscribirPdfResultado = { n_escritos: number; n_vacios: number }

export type ContextoPdf = {
  titulo: string
  fecha: string
}

// Formato de línea:
//   "<etiqueta>[ (obligatorio)]: <valor-o-'___'>"
// Sufijo (obligatorio) va ANTES del ":" para que el verificador pueda
// afirmar startsWith("<etiqueta>") sobre el texto extraído.
const formatearLinea = (
  campo: PlantillaCampo,
  valor: unknown,
  tieneValor: boolean
): string => {
  const et = campo.obligatorio ? `${campo.etiqueta} (obligatorio)` : campo.etiqueta
  if (!tieneValor) return `${et}: ___`
  const s = serializarValor(valor as Serializable)
  return `${et}: ${s === null ? "___" : String(s)}`
}

export const escribirFormularioPdf = async (
  ruta: string,
  plantilla: PlantillaCampo[],
  valores: Map<string, unknown>,
  contexto: ContextoPdf
): Promise<EscribirPdfResultado> => {
  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(ruta)
  doc.pipe(stream)

  doc.fontSize(16).text(contexto.titulo)
  doc.moveDown(0.3)
  doc.fontSize(10).text(contexto.fecha)
  doc.moveDown(1)
  doc.fontSize(11)

  let n_escritos = 0
  let n_vacios = 0
  for (const p of plantilla) {
    const tieneValor = valores.has(p.etiqueta)
    doc.text(formatearLinea(p, valores.get(p.etiqueta), tieneValor))
    if (tieneValor) n_escritos++
    else n_vacios++
  }

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve())
    stream.on("error", (err) => reject(err))
  })

  return { n_escritos, n_vacios }
}
