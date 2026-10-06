export const PAISES = ["CO", "EC", "PE", "PA", "HN"] as const
export type Pais = (typeof PAISES)[number]

export const IDENT_POR_PAIS: Record<Pais, "NIT" | "RUC" | "RTN"> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
}

export const NOTA_POR_PAIS: Record<Pais, string> = {
  CO: "sugerido: NIT (identificador tributario de Colombia)",
  EC: "sugerido: RUC (identificador tributario de Ecuador)",
  PE: "sugerido: RUC (identificador tributario de Perú)",
  PA: "sugerido: RUC (identificador tributario de Panamá)",
  HN: "sugerido: RTN (identificador tributario de Honduras)",
}

export const notaIdentExtranjero = (pais: Pais): string =>
  `identificador extranjero: Periferia solo tiene NIT colombiano; para ${pais} se espera ${IDENT_POR_PAIS[pais]}`
