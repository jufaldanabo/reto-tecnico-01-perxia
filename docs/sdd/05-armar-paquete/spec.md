# Spec — 05-armar-paquete

**Slice:** herramienta `proveedor_armar_paquete` (HU-4)
**Autoridad:** `reto-01/PRD.md` HU-4, §6.2, §7.2 (soportes/index.json), §7.3 RN2/RN3/RN5, §6.3 CA2/CA4/CA5
**Fecha:** 2026-10-06
**Depende de:** slice 00 + 01 + 02 + 03 + 04 (todos cerrados)

## 1. Resumen en una frase
Implementar `armar_paquete` que, dado un caso, cree `out/<caso>/paquete/` conteniendo el formulario (si existe), copias de los soportes exigidos presentes en el repositorio, un `checklist.md` que marca presentes/ausentes/vencidos (RN3) y un `borrador-correo.md` que **jamás** incluye datos bancarios (RN2), y devuelva `{ ruta, listo_para_firma, checklist }`.

## 2. Alcance

**En alcance**
- Nuevo export `armar_paquete` en `src/tools/proveedor.ts` cumpliendo contrato §6.2.
- `args` zod: `{ caso: z.string().min(1) }`.
- `data` ok: `{ ruta: string, listo_para_firma: boolean, checklist: ChecklistResumen }` donde:
  - `ruta` = `out/<caso>/paquete/` (relativa).
  - `listo_para_firma` = `true` sólo si **todos** los soportes exigidos están presentes y vigentes.
  - `checklist` resumen: `{ soportes: { presentes: string[], ausentes: string[], vencidos: string[] }, bloqueos: string[] }`.
- Flujo interno:
  1. Reutilizar `leer_solicitud` para obtener `pais`, `cliente`, `formato`, `soportes` exigidos, `correo` original.
  2. Leer `fixtures/repositorio/soportes/index.json` (nuevo loader `cargarSoportes` en `src/lib/soportes.ts` reutilizable).
  3. Clasificar cada soporte exigido en {presente, ausente, vencido} comparando `vigencia_hasta` contra la fecha de ejecución (`new Date()`; `vigencia_hasta: null` ⇒ nunca vence).
  4. Crear directorio `out/<caso>/paquete/soportes/` + copiar los archivos de los soportes **que existen en el repo** (sean vigentes o vencidos; HU-4 dice "los que existan"; ver duda 4). Omite los ausentes del todo.
  5. Si existe `out/<caso>/formulario.xlsx` ⇒ copiar a `paquete/`. Else si `out/<caso>/formulario.pdf` ⇒ copiar. Else (caso portal pendiente) ⇒ no copiar, nota en checklist (ver duda 1).
  6. Escribir `paquete/checklist.md` con: encabezado, tabla de soportes con estado + archivo + vigencia, lista de campos del mapeo con `faltantes` + `requiere_confirmacion` (para que el analista sepa qué celdas quedan con `___` / vacías en el formulario), estado final `listo_para_firma: true/false` + lista de bloqueos.
  7. Escribir `paquete/borrador-correo.md` con: destinatario (`solicitud.de`), asunto (`Re: <asunto original>`), cuerpo breve que lista los soportes incluidos **sin** mencionar banco/cuenta/SWIFT (RN2 estricto), firma genérica (`Representante legal — Periferia IT Group S.A.S.`).
- Nueva lib compartida `src/lib/soportes.ts`:
  - `SoporteIndexItem = { tipo, archivo, vigencia_hasta: string|null, pais_emisor, descripcion }`
  - `cargarSoportes(ctx): Promise<Resultado<SoporteIndexItem[]>>`
  - `estadoSoporte(item, exigidos, now): "presente" | "ausente" | "vencido"` + predicados.
- Reutilizar `leer_solicitud` + `mapear_campos` internamente (importarlos del mismo archivo). Resolver el pais vía re-lectura directa (patrón slice 02).
- Logging RN5/CA4: `appendLog` con `{ formato: "paquete", ruta, listo_para_firma, n_presentes, n_ausentes, n_vencidos }`.
- `demo.ts`: tras `generar_formulario`, llamar `armar_paquete` por caso y añadir una línea `  paquete: ruta=out/<caso>/paquete/ (listo=<true|false>; P/A/V = N/N/N)` (stdout determinista: contadores no incluyen la fecha).
- Verificación: nuevo `verify:paquete` que para cada uno de los 4 casos:
  - afirma que `out/<caso>/paquete/soportes/` contiene exactamente los archivos de los soportes presentes/vencidos (no los ausentes).
  - afirma que el formulario del formato correspondiente fue copiado si existe.
  - lee `checklist.md` y afirma secciones esperadas (presentes, ausentes, vencidos, bloqueos, estado final).
  - lee `borrador-correo.md` y afirma que **no contiene** las palabras `Bancolombia`, `03100012345`, `COLOCOBM`, `SWIFT`, `Número de cuenta`, `cuenta bancaria` (RN2 scan).
  - afirma que `data.listo_para_firma` concuerda con la fecha de ejecución (en el fixture actual, 2026-10-06, los 4 casos deben ser `false` por `camara_comercio` vencido 2026-09-30).

**Fuera de alcance**
- `simular_envio` / `ENVIO-SIMULADO.md` (slice 08 posterior).
- Rama `portal` del formulario (sigue siendo stub skipped; se maneja aquí como "sin formulario, nota en checklist").
- Ciclo del agente, servidor HTTP, front.
- Firma electrónica, envío real.
- Validación de contenido de los soportes (son placeholders `.txt`).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Export `armar_paquete` cumple contrato §6.2 (zod + string JSON + nunca lanza). Nombre expuesto = `proveedor_armar_paquete`. | §6.2 |
| AC-2 | Para los 4 casos (CO/EC/HN/PA), la herramienta devuelve `{ ok: true, data: { ruta: "out/<caso>/paquete/", listo_para_firma: boolean, checklist } }` y el directorio existe en disco. | HU-4 primer criterio |
| AC-3 | **Copias de soportes**: `out/<caso>/paquete/soportes/` contiene exactamente los archivos de los soportes presentes **y** vencidos (ambos "existen" en el repo); los soportes ausentes NO están. | HU-4 "copias de los soportes exigidos que existan" |
| AC-4 | **Formulario copiado**: para CO/HN (xlsx) y EC (pdf), el formulario correspondiente está en `paquete/`. Para PA (portal, aún sin formulario), no hay archivo de formulario, y el `checklist.md` lo nota explícitamente. | HU-4 "paquete con el formulario" |
| AC-5 | **RN3 vencidos y ausentes bloquean**: `data.listo_para_firma === false` para los 4 casos del fixture actual (todos tienen `camara_comercio` vencido al 2026-10-06); `data.checklist.bloqueos` lista los motivos exactos. | §7.3 RN3 |
| AC-6 | **RN3 campo faltante no bloquea**: `data.listo_para_firma` NO depende de `mapeo.faltantes` ni `mapeo.requiere_confirmacion` (sólo de soportes). Esos sí aparecen en el checklist, pero no en los bloqueos. | §7.3 RN3 (literal) |
| AC-7 | **RN2 bancarios fuera del correo**: `borrador-correo.md` **no contiene** ninguna de las palabras `Bancolombia`, `03100012345`, `COLOCOBM`, `SWIFT`, `Número de cuenta`, `cuenta bancaria` (grep case-insensitive). | §7.3 RN2 (literal "nunca se incluyen en borrador-correo.md") |
| AC-8 | **CA2 — nunca inventa**: ningún valor del `checklist.md` ni del `borrador-correo.md` que no provenga de `maestro`/`solicitud`/`soportes-index`. Verificable por grep sobre strings esperadas. | §6.3 CA2 |
| AC-9 | **Error path**: caso inexistente, `index.json` corrupto, o fallo copiando archivos devuelven `{ ok: false, error }` sin lanzar. | CA5 |
| AC-10 | **CA4/RN5 logging**: tras `demo:clean && demo`, `out/<caso>/log.jsonl` para los 4 casos contiene 4 líneas (`leer`, `mapear`, `generar`, `armar`); todas con las 4 claves `{ts, herramienta, ok, resumen}`. | CA4, RN5 |
| AC-11 | **Determinismo stdout**: `bun run demo:clean` produce stdout idéntico en 2 corridas consecutivas; la fecha de ejecución **no** aparece en stdout (sí dentro de `checklist.md`, que es contenido no-stdout). | §8 |
| AC-12 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. | §8 |
| AC-13 | **Sin rutas absolutas**: `rg` en `src/tools` + `src/lib` → sin matches literales. | §6.2 |
| AC-14 | **Regresión slices 01–04**: `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx`, `verify:pdf` siguen todos verdes tras el cambio. | Regresión controlada |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export; `data` extendido respeta el contrato mínimo literal `{ ruta, listo_para_firma, checklist }`.
- **HU-4** — paquete con formulario + soportes + checklist + borrador-correo; pregunta explícita de confirmación (esta última se aborda en slice de envío).
- **§6.3 CA2** — no inventar valores en checklist ni correo.
- **§6.3 CA4** — tool call en log.
- **§6.3 CA5** — errores no matan; mensaje claro.
- **§7.2** — `soportes/index.json` con `tipo, archivo, vigencia_hasta, pais_emisor`.
- **§7.3 RN2** — datos bancarios NUNCA en el borrador-correo.md.
- **§7.3 RN3** — soporte vencido o ausente bloquea `listo_para_firma`; campo `faltante` no bloquea pero aparece en checklist.
- **§7.3 RN5** — log por caso.
- **§8** — sin `any`, determinismo (modulo fecha de ejecución), sin shell.

## 5. Dependencias con otros slices

- **Requiere**: slice 01 (leer_solicitud), slice 02 (mapear_campos para los faltantes/req_conf del checklist), slice 03 (xlsx para copiar), slice 04 (pdf para copiar).
- **Alimenta**: slice de envío (`proveedor_simular_envio` consumirá `data.listo_para_firma`).

## 6. Decisiones (resueltas)

1. **Paquete para PA (portal) se arma sin archivo de formulario.** `checklist.md` incluye nota explícita `"formulario pendiente — formato portal diferido"`. `data.listo_para_firma = false` igual (por soportes vencidos; la ausencia del formulario también suma como bloqueo "sin formulario generado"). Motivo: mantiene el flujo end-to-end del demo para los 4 casos sin casos especiales fuera de la herramienta; cuando la rama portal se implemente, el flujo pasa a `listo` automáticamente.
2. **Fecha de ejecución dinámica (`new Date()`); stdout del demo omite fecha absoluta.** Los contadores P/A/V no cambian entre dos corridas del mismo día ⇒ `diff` vacío. `checklist.md` sí imprime la fecha (como contenido de archivo, no como stdout). Alternativa B (env `AGENT_NOW`) descartada: complica demo sin ganar nada operativo hoy; se puede añadir en slice posterior si evaluamos tests con fecha fija.
3. **`borrador-correo.md` minimalista.** Saludo + "Adjuntamos el formulario diligenciado y los siguientes soportes:" (lista de tipos presentes/vencidos, nombres de archivo) + firma genérica `Representante legal — Periferia IT Group S.A.S.`. **RN2 estricto**: ninguna palabra bancaria (verificado por grep en `verify:paquete`).
4. **Soportes vencidos se copian al paquete** `out/<caso>/paquete/soportes/`, marcados como `vencido` en el checklist. Motivo: PRD HU-4 dice "los que existan"; el analista recibe todos los archivos físicos y puede decidir si pedir una renovación al dueño del dato antes de firmar.
