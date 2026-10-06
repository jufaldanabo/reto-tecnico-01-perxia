import type { Ctx } from "../tools/types"
import type { HerramientaSpec } from "../llm/adapter"
import {
  armar_paquete,
  generar_formulario,
  leer_solicitud,
  mapear_campos,
  simular_envio,
} from "../tools/proveedor"

export type AnyTool = {
  description: string
  execute(args: Record<string, unknown>, ctx: Ctx): Promise<string>
}

// Wrapper que oculta la variance Zod sin introducir `any`.
const wrap = (tool: {
  description: string
  execute(args: never, ctx: Ctx): Promise<string>
}): AnyTool => ({
  description: tool.description,
  execute: (args, ctx) => tool.execute(args as never, ctx),
})

export const CATALOGO: Record<string, AnyTool> = {
  proveedor_leer_solicitud: wrap(leer_solicitud),
  proveedor_mapear_campos: wrap(mapear_campos),
  proveedor_generar_formulario: wrap(generar_formulario),
  proveedor_armar_paquete: wrap(armar_paquete),
  proveedor_simular_envio: wrap(simular_envio),
}

export const TOOLS_CONFIRMACION = new Set<string>(["proveedor_simular_envio"])

export const TOOL_SCHEMAS: HerramientaSpec[] = [
  {
    name: "proveedor_leer_solicitud",
    description:
      "Lee la solicitud (correo), su plantilla y los soportes exigidos de un caso en reto-01/fixtures/casos/<caso>/. Devuelve país, cliente, formato, campos normalizados y soportes exigidos.",
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description:
            "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta').",
        },
      },
      required: ["caso"],
      additionalProperties: false,
    },
  },
  {
    name: "proveedor_mapear_campos",
    description:
      "Cruza los campos solicitados (de proveedor_leer_solicitud) contra el repositorio maestro y el glosario. Devuelve tres listas: llenos (con valor y ruta), faltantes y requiere_confirmacion. Nunca inventa valores.",
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en reto-01/fixtures/casos/.",
        },
        campos: {
          type: "array",
          description:
            "Lista de campos tal como la devuelve proveedor_leer_solicitud en data.campos[].",
          items: {
            type: "object",
            properties: {
              etiqueta: { type: "string" },
              obligatorio: { type: "boolean" },
            },
            required: ["etiqueta", "obligatorio"],
          },
          minItems: 1,
        },
      },
      required: ["caso", "campos"],
      additionalProperties: false,
    },
  },
  {
    name: "proveedor_generar_formulario",
    description:
      "Genera el formulario del cliente a partir del mapeo. Soporta xlsx (escribe out/<caso>/formulario.xlsx siguiendo plantilla-celdas.json) y pdf (escribe out/<caso>/formulario.pdf siguiendo plantilla-campos.json). Portal devuelve error de 'no implementado'.",
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Nombre del caso." },
        mapeo: {
          type: "object",
          description:
            "Mapeo producido por proveedor_mapear_campos: { llenos[], faltantes[], requiere_confirmacion[] }.",
          properties: {
            llenos: { type: "array" },
            faltantes: { type: "array" },
            requiere_confirmacion: { type: "array" },
          },
          required: ["llenos", "faltantes", "requiere_confirmacion"],
        },
      },
      required: ["caso", "mapeo"],
      additionalProperties: false,
    },
  },
  {
    name: "proveedor_armar_paquete",
    description:
      "Arma el paquete para firma: copia soportes exigidos presentes/vencidos, copia formulario si existe, escribe checklist.md y borrador-correo.md (sin datos bancarios, RN2). Devuelve ruta del paquete, listo_para_firma y resumen del checklist.",
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Nombre del caso." },
      },
      required: ["caso"],
      additionalProperties: false,
    },
  },
  {
    name: "proveedor_simular_envio",
    description:
      "Simula el envío del paquete: valida confirmación explícita y listo_para_firma, y escribe out/<caso>/ENVIO-SIMULADO.md SOLO si ambas condiciones se cumplen. En otro caso devuelve error sin side effects (RN4).",
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Nombre del caso." },
        confirmado: {
          type: "boolean",
          description:
            "Debe ser true explícito y además el usuario debe haber confirmado verbalmente en el turno anterior.",
          default: false,
        },
      },
      required: ["caso"],
      additionalProperties: false,
    },
  },
]
