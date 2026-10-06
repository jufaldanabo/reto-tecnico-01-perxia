import ExcelJS from "exceljs"
import { serializarValor, type Serializable } from "./serialize"

export type PlantillaCelda = {
  hoja: string
  celda_etiqueta: string
  etiqueta: string
  celda_valor: string
}

export type ValorCelda = Serializable

export type EscribirResultado = { n_escritos: number; n_vacios: number }

export const escribirFormulario = async (
  ruta: string,
  plantilla: PlantillaCelda[],
  valores: Map<string, unknown>
): Promise<EscribirResultado> => {
  const wb = new ExcelJS.Workbook()
  let n_escritos = 0
  let n_vacios = 0
  for (const p of plantilla) {
    const ws = wb.getWorksheet(p.hoja) ?? wb.addWorksheet(p.hoja)
    ws.getCell(p.celda_etiqueta).value = p.etiqueta
    if (valores.has(p.etiqueta)) {
      ws.getCell(p.celda_valor).value = serializarValor(valores.get(p.etiqueta) as ValorCelda)
      n_escritos++
    } else {
      ws.getCell(p.celda_valor).value = null
      n_vacios++
    }
  }
  await wb.xlsx.writeFile(ruta)
  return { n_escritos, n_vacios }
}
