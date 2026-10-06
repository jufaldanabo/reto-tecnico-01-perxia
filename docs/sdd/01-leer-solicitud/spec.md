# Spec — 01-leer-solicitud

**Slice:** herramienta `proveedor_leer_solicitud` (HU-1)
**Autoridad:** `reto-01/PRD.md` HU-1, §6.2, §7.1, §7.3 RN1, §6.3 CA4/CA5, §6.6
**Fecha:** 2026-10-05
**Depende de:** slice 00-esqueleto (cerrado)

## 1. Resumen en una frase
Implementar la primera herramienta real — `leer_solicitud` — que a partir del nombre de un caso lee `solicitud.json`, su plantilla y `soportes-exigidos.json`, y devuelve `{ pais, cliente, formato, campos[], soportes[] }` siguiendo el contrato §6.2.

## 2. Alcance

**En alcance**
- Exportar `leer_solicitud` desde `src/tools/proveedor.ts` con shape `{ description, args, execute }` (contrato §6.2).
- `args` zod: `{ caso: z.string().describe(...) }`.
- `execute({ caso }, ctx)` → **string JSON** con `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanza.
- `data` ok (shape mínimo PRD §6.2):
  - `pais: "CO" | "EC" | "PE" | "PA" | "HN"`
  - `cliente: string`
  - `formato: "xlsx" | "pdf" | "portal"`
  - `campos: { etiqueta: string, obligatorio: boolean, destino?: { hoja: string, celda_etiqueta: string, celda_valor: string } }[]`
  - `soportes: string[]`
  - Extra propuesto (ver duda 1): `correo: { de, para, asunto, fecha, cuerpo }` y `adjuntos: string[]` del `solicitud.json`.
- Normalización de `campos[]`:
  - **xlsx** (plantilla-celdas.json): un item por fila; `destino = { hoja, celda_etiqueta, celda_valor }`; `obligatorio = true` por default (el fixture no lo trae, pero el PDF/portal sí).
  - **pdf / portal** (plantilla-campos.json): un item por fila; sin `destino`; `obligatorio` tal cual.
- Detección de ambigüedad (criterio HU-1 segundo):
  - Lista literal cerrada de etiquetas ambiguas: `["Identificación tributaria", "Identificación fiscal", "Número tributario", "ID tributario"]` (case-insensitive, trim).
  - Si se detecta, se marca el campo con `requiere_confirmacion: true` y `nota_pais: "sugerido NIT|RUC|RTN según país"` según RN1.
  - Si la plantilla pide directamente la etiqueta del país (NIT/RUC/RTN), **no** se marca ambigua.
- Manejo de errores (CA5):
  - caso inexistente → `{ ok: false, error: "caso no encontrado: <nombre>" }`
  - plantilla ausente para el formato declarado → `{ ok: false, error: "plantilla ausente para formato <fmt> (caso <nombre>)" }`
  - JSON corrupto → `{ ok: false, error: "json inválido en <ruta>: <mensaje>" }`
  - Cualquier otra excepción capturada → `{ ok: false, error: "fallo leyendo <ruta>: <mensaje>" }`
- `demo.ts` reemplaza su placeholder: itera los 4 casos de `fixtures/casos/` y, para cada uno, llama `leer_solicitud` e imprime una línea resumen (`caso: X | pais: Y | formato: Z | N campos (M ambiguos) | K soportes`). Sin clave de LLM. Exit 0 si todos los casos retornan `ok: true`.
- Logging RN5 (ver duda 3): la herramienta escribe `out/<caso>/log.jsonl` con `{ ts, herramienta: "proveedor_leer_solicitud", ok, resumen }`.

**Fuera de alcance**
- Cualquier acceso al `maestro.json` (mapeo = slice 02).
- Generación de formulario xlsx/pdf (slice 03/04).
- Validación semántica de campos (ej. que el NIT tenga 10 dígitos).
- Chat, servidor HTTP, adaptador LLM (slice 06+).
- `simular_envio`, `armar_paquete`, `generar_formulario`.

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Export `leer_solicitud` cumple contrato §6.2 (zod args con `.describe`, `execute` devuelve **string**, nunca lanza). | §6.2 |
| AC-2 | Nombre expuesto al modelo = `proveedor_leer_solicitud` (= `<archivo>_<export>`). | §6.2 "El nombre que ve el modelo es `<archivo>_<export>`" |
| AC-3 | Para los 4 casos (`co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula`, `pa-logistica-istmo`), la herramienta devuelve `ok: true` con `pais`, `cliente`, `formato`, `campos[]` no vacío y `soportes[]` acorde al fixture. | HU-1 primer criterio |
| AC-4 | Para caso inexistente (`bogus`), devuelve `{ ok: false, error }` con mensaje accionable, sin lanzar. | §6.2 "nunca lanza", CA5 |
| AC-5 | Si existiera una etiqueta ambigua (test manual con fixture ad-hoc en tests o demo), se marca `requiere_confirmacion: true` con `nota_pais` acorde a RN1. (En los 4 casos reales no hay ambigüedad; AC-5 se valida inyectando un caso sintético o con un unit test). | HU-1 segundo criterio, RN1 |
| AC-6 | `demo.ts` recorre los 4 casos, imprime una línea resumen por caso y termina exit 0. Corre con `bun run demo` sin ninguna variable de LLM. | §6.6 |
| AC-7 | Determinismo: `bun run demo` produce stdout idéntico en 2 corridas consecutivas (salvo campo `ts` del log). | §8 Determinismo |
| AC-8 | Tras `bun run demo`, existe `out/<caso>/log.jsonl` para los 4 casos, cada archivo con 1 línea JSON válida con las claves `{ts, herramienta, ok, resumen}`. | RN5, CA4 |
| AC-9 | `bun x tsc --noEmit` sigue en verde; cero `any` en código nuevo. | §8 |
| AC-10 | Rutas resueltas desde `ctx.directory`; no hay rutas absolutas en el código de herramienta. | §6.2 "ctx.directory = raíz del proyecto; resuelve rutas desde aquí, nunca absolutas" |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export, zod, `{ok,data}` string, nunca lanza, `ctx.directory`.
- **§7.1 estructura del caso** — forma de `solicitud.json`, `plantilla-celdas.json`, `plantilla-campos.json`, `soportes-exigidos.json`.
- **§7.3 RN1 identificador tributario** — ambigüedad → `requiere_confirmacion` + nota por país.
- **§6.3 CA4** — tool call queda en `out/<caso>/log.jsonl` (empezamos a emitirlo aquí; el consumidor del log vive en slice 06).
- **§6.3 CA5** — errores de herramienta no matan nada; mensaje claro, sesión continúa.
- **§6.6 demo.ts** — corre sin clave de LLM; itera todos los casos.
- **§8** — sin `any`, determinismo, sin shell, dependencias justificadas.

## 5. Dependencias con otros slices

- **Requiere**: slice 00-esqueleto cerrado (scaffolding, Bun, zod).
- **Alimenta**:
  - slice 02 (`mapear_campos`) consume el shape `data` de este slice.
  - slice 03/04 (`generar_formulario`) consume `campos[]` con `destino` para xlsx y la lista plana para pdf/portal.
  - slice 06 (ciclo del agente) consume el log por caso.

## 6. Decisiones (resueltas)

1. **Shape de `data` extendido.** Se incluye `correo: { de, para, asunto, fecha, cuerpo }` y `adjuntos: string[]` además del contrato mínimo del PRD §6.2. Motivo: HU-4 (slice 05) necesita `asunto` y `de` para `borrador-correo.md`; releer el archivo entonces sería duplicación. PRD no lo prohíbe.
2. **Shape unificado de `campos[]`.** Un solo array `{ etiqueta, obligatorio, destino?, requiere_confirmacion?, nota_pais? }` para los tres formatos. `destino = { hoja, celda_etiqueta, celda_valor }` solo cuando `formato === "xlsx"`. Motivo: más simple para el modelo y para los slices downstream (`mapear_campos`, `generar_formulario`).
3. **Logging RN5 emitido desde la herramienta.** Cada herramienta escribe su entrada en `out/<caso>/log.jsonl` apéndice. El ciclo del agente (slice 06) solo lee y expone el log; no reescribe las herramientas. Esto convierte las herramientas en el único productor del log y simplifica el ciclo.
