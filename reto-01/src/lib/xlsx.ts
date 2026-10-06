import ExcelJS from "exceljs"

export type PlantillaCelda = {
  hoja: string
  celda_etiqueta: string
  etiqueta: string
  celda_valor: string
}

export type ValorCelda = string | number | boolean | null | undefined | object | unknown[]

export type EscribirResultado = { n_escritos: number; n_vacios: number }

// Serializa un valor para una celda xlsx:
//   string→string, number→number, boolean→"Sí"|"No" (D7),
//   null/undefined→null (celda vacía), object/array→JSON.stringify (defensivo).
export const serializarValor = (v: ValorCelda): string | number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}

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
