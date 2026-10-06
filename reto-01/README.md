# Reto 01 — Agente "Registro como Proveedor"

Implementación del reto técnico definido en `PRD.md`.

## Arranque local

Requiere [Bun](https://bun.sh) instalado (Node 20+ es fallback aceptado pero no configurado aquí).

```bash
cd reto-01
bun install
bun run demo
```

Desde el slice 02, `demo` ejecuta `leer_solicitud` + `mapear_campos` sobre los 4 casos reales de `fixtures/casos/` y escribe `out/<caso>/log.jsonl` con una línea por herramienta llamada. Salida esperada:

```
caso: co-industrias-delta | pais: CO | formato: xlsx | 17 campos (0 ambiguos, 17 obligatorios) | 4 soportes
  mapeo: 17 llenos, 0 faltantes, 0 requiere_confirmacion
caso: ec-corp-andina | pais: EC | formato: pdf | 15 campos (0 ambiguos, 13 obligatorios) | 5 soportes
  mapeo: 13 llenos, 1 faltantes, 1 requiere_confirmacion
caso: hn-agroexport-sula | pais: HN | formato: xlsx | 11 campos (0 ambiguos, 11 obligatorios) | 3 soportes
  mapeo: 9 llenos, 1 faltantes, 1 requiere_confirmacion
caso: pa-logistica-istmo | pais: PA | formato: portal | 9 campos (0 ambiguos, 9 obligatorios) | 2 soportes
  mapeo: 8 llenos, 0 faltantes, 1 requiere_confirmacion
total: 4 casos | ok: 4 | error: 0
```

(Las cuentas exactas de campos pueden variar si cambian los fixtures; lo importante es `ok: 4 | error: 0` y que `llenos + faltantes + requiere_confirmacion === campos` por caso.)

## Scripts

| Script | Descripción |
|---|---|
| `bun run demo` | Ejecuta `demo.ts` sobre los 4 casos (herramientas sin LLM; ver PRD §6.6). |
| `bun run demo:clean` | Borra `out/` y re-corre `demo` (apoya determinismo). |
| `bun run verify:ambiguous` | Verifica RN1 (etiqueta ambigua marcada en `leer_solicitud`). |
| `bun run verify:mapeo` | Verifica `mapear_campos`: CA2 sin inventar, normalización, fuzzy ∈ [0.8,1.0). |
| `bun run verify:h2` | Regresión de la clasificación de errores de `leer_solicitud` tras el refactor H-2. |
| `bun run typecheck` | `tsc --noEmit` en modo estricto. |
| `bun run check` | Encadena `typecheck + demo:clean + verify:ambiguous + verify:mapeo + verify:h2`. |
| `bun run dev` | Placeholder — se implementa en el slice del servidor. |

## Variables de entorno

Copiar `.env.example` → `.env` y completar:

| Variable | Propósito | Default sugerido |
|---|---|---|
| `LLM_PROVIDER` | Proveedor del modelo (anthropic / openai / google / azure / mistral / local). | — |
| `LLM_API_KEY` | Clave del proveedor. Solo se lee en backend; **nunca** aparece en código, logs ni front. | — |
| `LLM_MODEL` | Identificador del modelo específico. | — |
| `AGENT_MAX_ITERATIONS` | Tope de iteraciones herramienta↔modelo por turno (PRD CA1). | `25` |
| `SESSION_TOKEN_LIMIT` | Tope de tokens por sesión (PRD §8 "Costo"). | — |

## Dependencias

- **Producción**: `zod` (obligatorio por PRD §6.2 — validación tipada de argumentos de herramientas).
- **Build**: `typescript` (type-check), `@types/bun` (tipos del runtime Bun).

## Layout de fixtures

El PRD §6.5 muestra las rutas como `fixtures/reto-01/...`. **En este repo los fixtures viven directamente bajo `reto-01/fixtures/`** (sin la carpeta intermedia); las herramientas de los slices posteriores usan esta ruta relativa a `ctx.directory`.

```
reto-01/fixtures/
├── casos/           # casos de prueba (co-industrias-delta, pa-logistica-istmo, ec-corp-andina, hn-agroexport-sula)
├── glosario-campos.json
└── repositorio/     # maestro.json + soportes/
```
