# Reto 01 — Agente "Registro como Proveedor"

Implementación del reto técnico definido en `PRD.md`.

## Arranque local

Requiere [Bun](https://bun.sh) instalado (Node 20+ es fallback aceptado pero no configurado aquí).

```bash
cd reto-01
bun install
bun run demo
```

Desde el slice 06, `demo` ejecuta `leer_solicitud` + `mapear_campos` + `generar_formulario` + `armar_paquete` + `simular_envio` (dos ramas: `confirmado:false` y `confirmado:true`) sobre los 4 casos reales de `fixtures/casos/`. Escribe `out/<caso>/log.jsonl` con una línea por herramienta llamada (6 líneas por caso) y genera el formulario en el formato pedido (xlsx para CO/HN, pdf para EC; PA sigue skipped porque portal se implementa en slice posterior). `armar_paquete` deja `out/<caso>/paquete/` con formulario copiado, soportes exigidos presentes/vencidos, `checklist.md` y `borrador-correo.md`. `simular_envio` NO escribe `ENVIO-SIMULADO.md` para los casos reales porque los 4 bloquean por `camara_comercio` vencido (RN3). Salida esperada:

```
caso: co-industrias-delta | pais: CO | formato: xlsx | 17 campos (0 ambiguos, 17 obligatorios) | 4 soportes
  mapeo: 17 llenos, 0 faltantes, 0 requiere_confirmacion
  generar: ruta=out/co-industrias-delta/formulario.xlsx (17 escritos, 0 vacíos)
  paquete: ruta=out/co-industrias-delta/paquete/ (listo=false; P/A/V=3/0/1)
  envio[1]: ERROR: requiere confirmación explícita
  envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…
caso: ec-corp-andina | pais: EC | formato: pdf | 15 campos (0 ambiguos, 13 obligatorios) | 5 soportes
  mapeo: 13 llenos, 1 faltantes, 1 requiere_confirmacion
  generar: ruta=out/ec-corp-andina/formulario.pdf (13 escritos, 2 vacíos)
  paquete: ruta=out/ec-corp-andina/paquete/ (listo=false; P/A/V=3/1/1)
  envio[1]: ERROR: requiere confirmación explícita
  envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…
caso: hn-agroexport-sula | pais: HN | formato: xlsx | 11 campos (0 ambiguos, 11 obligatorios) | 3 soportes
  mapeo: 9 llenos, 1 faltantes, 1 requiere_confirmacion
  generar: ruta=out/hn-agroexport-sula/formulario.xlsx (9 escritos, 2 vacíos)
  paquete: ruta=out/hn-agroexport-sula/paquete/ (listo=false; P/A/V=1/0/2)
  envio[1]: ERROR: requiere confirmación explícita
  envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…
caso: pa-logistica-istmo | pais: PA | formato: portal | 9 campos (0 ambiguos, 9 obligatorios) | 2 soportes
  mapeo: 8 llenos, 0 faltantes, 1 requiere_confirmacion
  generar: skipped (formato portal)
  paquete: ruta=out/pa-logistica-istmo/paquete/ (listo=false; P/A/V=1/0/1)
  envio[1]: ERROR: requiere confirmación explícita
  envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…
total: 4 casos | ok: 4 | error: 0 | expected-errors: 8
```

Todos los casos dan `listo=false` porque el soporte `camara_comercio` del repositorio tiene `vigencia_hasta: 2026-09-30` (vencido respecto a la fecha de ejecución). Este estado es intencional del fixture para ejercitar RN3 (soportes vencidos bloquean la firma). Los `expected-errors: 8` corresponden a las 2 ramas de error esperadas de `simular_envio` × 4 casos (CA3/RN4 "requiere confirmación explícita" + RN3 "no listo para firma").

(Las cuentas exactas de campos pueden variar si cambian los fixtures; lo importante es `ok: 4 | error: 0`, que `llenos + faltantes + requiere_confirmacion === campos` por caso y que los xlsx producidos sean releíbles.)

## Scripts

| Script | Descripción |
|---|---|
| `bun run demo` | Ejecuta `demo.ts` sobre los 4 casos (herramientas sin LLM; ver PRD §6.6). |
| `bun run demo:clean` | Borra `out/` y re-corre `demo` (apoya determinismo). |
| `bun run verify:ambiguous` | Verifica RN1 (etiqueta ambigua marcada en `leer_solicitud`). |
| `bun run verify:mapeo` | Verifica `mapear_campos`: CA2 sin inventar, normalización, fuzzy ∈ [0.8,1.0). |
| `bun run verify:h2` | Regresión de la clasificación de errores de `leer_solicitud` tras el refactor H-2. |
| `bun run verify:xlsx` | Verifica `generar_formulario` xlsx: fidelidad celda a celda vs plantilla, multi-sheet (CO), ausencia de xlsx (EC/PA) y determinismo del escritor. |
| `bun run verify:pdf` | Verifica `generar_formulario` pdf: fidelidad del texto extraído (EC), ausencia de pdf (PA) y determinismo del escritor. |
| `bun run verify:paquete` | Verifica `armar_paquete`: clasificación de soportes, copias en `paquete/`, secciones del `checklist.md`, RN2 scan sobre `borrador-correo.md`, `listo_para_firma=false` para los 4 casos. |
| `bun run verify:envio` | Verifica `simular_envio`: ramas de error (CA3/RN4 "requiere confirmación", RN3 "no listo"), ausencia de side effects, y happy path end-to-end con fixtures sintéticos (`vigencia_hasta: 2030-01-01`). |
| `bun run verify:server` | Verifica el ciclo del agente con `MockLlm`: CA3 lifecycle (bloqueo + confirmación), CA4 log global, CA1 tope de iteraciones, CA5 tolerancia a errores LLM, smoke HTTP. |
| `bun run typecheck` | `tsc --noEmit` en modo estricto. |
| `bun run check` | Encadena `typecheck + demo:clean + verify:ambiguous + verify:mapeo + verify:h2 + verify:xlsx + verify:pdf + verify:paquete + verify:envio + verify:server`. |
| `bun run dev` | Levanta el servidor HTTP en `PORT` (default 3000). |

## Arranque del servidor

```bash
cp .env.example .env
# Editar .env y completar LLM_API_KEY con tu clave de Anthropic
bun run dev
```

Endpoints disponibles:

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ reply, toolCalls, needsConfirmation, sessionId }` |
| `GET` | `/api/sessions/:id` | Historial de mensajes de la sesión (sin system prompt). 404 si no existe. |
| `GET` | `/api/health` | `{ ok: true, provider, model }` — sin claves. |

> **Seguridad**: `LLM_API_KEY` solo existe en el `.env` del backend. Nunca se incluye en el repositorio, en los logs ni en respuestas HTTP.

## Variables de entorno

Copiar `.env.example` → `.env` y completar:

| Variable | Propósito | Default |
|---|---|---|
| `LLM_PROVIDER` | Proveedor del modelo (`anthropic`). | `anthropic` |
| `LLM_API_KEY` | Clave del proveedor. Solo se lee en backend; **nunca** aparece en código, logs ni front. | — (requerido) |
| `LLM_MODEL` | Identificador del modelo específico. | `claude-sonnet-4-5` |
| `LLM_MAX_TOKENS` | Tope de tokens por respuesta del LLM. | `2048` |
| `AGENT_MAX_ITERATIONS` | Tope de iteraciones herramienta↔modelo por turno (PRD CA1). | `25` |
| `SESSION_TOKEN_LIMIT` | Tope de tokens por sesión (PRD §8 "Costo"). | `100000` |
| `PORT` | Puerto del servidor HTTP. | `3000` |

## Dependencias

- **Producción**:
  - `zod` — obligatorio por PRD §6.2 (validación tipada de argumentos de herramientas).
  - `exceljs` — escritura cell-level de `out/<caso>/formulario.xlsx` (HU-3 P0). Pure JS, API `ws.getCell("B3").value = ...`. Alternativa descartada: implementar OOXML a mano (fuera de alcance temporal del reto). Detalle completo irá a `SOLUCION.md` sección "Decisiones y trade-offs".
  - `pdfkit` — generación de `out/<caso>/formulario.pdf` desde cero (HU-3 P1). Pure JS, API `doc.text(...)` + streams. Alternativa descartada: `pdf-lib` (orientada a editar PDFs existentes), implementar PDF a mano.
- **Build / dev**: `typescript` (type-check), `@types/bun` (tipos del runtime Bun), `@types/pdfkit` (tipos de pdfkit — evita `any` en `src/lib/pdf.ts`), `pdf-parse` (solo verificación: `verify:pdf` extrae texto del pdf generado para asertos de fidelidad y determinismo; nunca se usa en runtime).

## Layout de fixtures

El PRD §6.5 muestra las rutas como `fixtures/reto-01/...`. **En este repo los fixtures viven directamente bajo `reto-01/fixtures/`** (sin la carpeta intermedia); las herramientas de los slices posteriores usan esta ruta relativa a `ctx.directory`.

```
reto-01/fixtures/
├── casos/           # casos de prueba (co-industrias-delta, pa-logistica-istmo, ec-corp-andina, hn-agroexport-sula)
├── glosario-campos.json
└── repositorio/     # maestro.json + soportes/
```
