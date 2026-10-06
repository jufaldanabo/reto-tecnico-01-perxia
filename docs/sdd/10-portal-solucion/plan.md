# Plan — 10-portal-solucion

## 1. Objetivo

Completar la rama portal de `generar_formulario` (produce `valores-portal.md` en vez de error), escribir `SOLUCION.md` con las 10 secciones §9.1, y actualizar README con instrucciones de deploy.

## 2. Alcance

Cuatro archivos se modifican y uno se crea:

1. **`src/tools/proveedor.ts`** (editar): reemplazar el bloque `if (formato === "portal")` (líneas 743–749) con implementación real que lee `plantilla-campos.json`, oculta bancarios, escribe `valores-portal.md` y retorna `ok: true`.
2. **`demo.ts`** (editar): actualizar la rama `ok:false + "formato portal no implementado"` (líneas 109–115) para que cuando `generar_formulario` devuelva `ok: true` con `formato: "portal"`, se imprima `generar: ruta=out/pa-logistica-istmo/valores-portal.md (portal, N campos)` en lugar de `skipped`.
3. **`src/scripts/verify-xlsx.ts`** (editar): reemplazar la llamada `verifyCaseNoXlsx("pa-logistica-istmo", "formato portal no implementado")` (línea 232) por aserciones nuevas que verifican `ok: true`, `valores-portal.md` existe, contiene secciones esperadas, campos bancarios ocultos, y que **no** se creó `formulario.xlsx`.
4. **`reto-01/SOLUCION.md`** (crear): las 10 secciones obligatorias del PRD §9.1.
5. **`README.md`** (editar): añadir sección "Link de prueba" y actualizar nota del arranque.

**No se toca:** ningún otro archivo de herramientas, agent, llm, server, scripts de verify previos, fixtures.

## 3. Reglas del PRD que aplican

- **§6.2 HU-3 P2**: `valores-portal.md` con valores listos para copiar.
- **§7.3 RN2**: bancarios → `[enviar por canal seguro]` en documentos.
- **§7.4**: diseño documentado del portal web (sólo documentación, no implementación).
- **§9.1**: 10 secciones en `SOLUCION.md`.
- **§9.2/§9.3**: README con link de prueba.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/tools/proveedor.ts` | **editar** | Reemplazar placeholder portal por implementación real |
| `demo.ts` | **editar** | Actualizar rama portal de `skipped` a impresión de ruta |
| `src/scripts/verify-xlsx.ts` | **editar** | Adaptar aserción PA a nuevo comportamiento ok:true |
| `SOLUCION.md` | **crear** | 10 secciones obligatorias PRD §9.1 |
| `README.md` | **editar** | Sección "Link de prueba" + instrucciones deploy |

## 5. Diseño detallado

### 5.1 Rama portal en `proveedor.ts`

**Dónde:** líneas 743–749 del archivo actual. Reemplazar el bloque completo:

```
if (formato === "portal") {
  return { ok: false, error: "formato portal no implementado en slice 03; disponible en slice posterior", formato }
}
```

por la siguiente lógica (en prosa):

1. Leer `plantilla-campos.json` del directorio del caso (`path.join(dir, "plantilla-campos.json")`). Usar `PlantillaCamposSchema` que ya existe en el archivo para los casos pdf. Si no existe → `{ ok: false, error: "plantilla-campos.json ausente para caso <nombre>" }`.
2. Construir `Map<string, unknown>` de etiqueta→valor desde `input.mapeo.llenos` (igual que la rama pdf).
3. Definir la función helper inline `esBancario(etiqueta: string): boolean` — retorna true si `normalizar(etiqueta)` contiene alguna de las palabras `["banco", "cuenta", "swift", "iban"]`. Usar `normalizar` importada de `"../lib/normalize"` (ya importada en el archivo vía `src/lib/normalize.ts`).
4. Construir el contenido del archivo markdown:
   - Línea 1: `# Valores para portal — <solicitudRes.data.cliente>`
   - Línea 2 vacía
   - Línea 3: `**Caso:** <nombre> | **País:** <solicitudRes.data.pais> | **Generado:** <fecha ISO YYYY-MM-DD>`
   - Línea 4 vacía
   - Tabla:
     ```
     | Campo | Valor | Obligatorio |
     |---|---|---|
     | <etiqueta> | <valor o [enviar por canal seguro]> | Sí/No |
     ```
     Para cada campo en `plantillaPdfRes.data` (el array de `plantilla-campos.json`):
     - Valor: si `esBancario(campo.etiqueta)` → `[enviar por canal seguro]`; si no, buscar en el Map → si existe poner el valor como string, si no → vacío (campo no mapeado).
     - Obligatorio: `campo.obligatorio ? "Sí" : "No"`.
   - Línea después de tabla vacía
   - `**Nota: estos valores son para copiar manualmente en el portal del cliente. El agente no interactúa con portales web.**`
5. Crear el directorio de salida (`outDir(ctx, nombre)`) con `fs.mkdir({ recursive: true })`.
6. Escribir el archivo en `path.join(outDir(ctx, nombre), "valores-portal.md")`.
7. Ruta relativa: `path.join("out", nombre, "valores-portal.md")`.
8. Retornar `{ ok: true, data: { ruta: rutaRelativa, formato: "portal" }, n_escritos: N_campos_no_bancarios, n_vacios: N_campos_sin_valor }` donde `N_campos_no_bancarios` = campos con valor real escrito, `N_campos_sin_valor` = campos sin valor en el Map (excluye bancarios del conteo de vacíos).

**Tipos a extender:** `GenerarData` actualmente es `{ ruta: string; formato: "xlsx" | "pdf" }`. Extender a `{ ruta: string; formato: "xlsx" | "pdf" | "portal" }`. Y `GenerarRunResult` retorna ese tipo.

**Imports existentes a reusar:** `normalizar` ya está disponible vía `import { normalizar } from "../lib/normalize"` — verificar que está importada; si no, añadirla. `PlantillaCamposSchema` ya se usa en la rama pdf (línea 698).

### 5.2 Cambio en `demo.ts`

**Dónde:** líneas 104–119. El bloque actual:

```js
if (genRes.ok) {
  const nEsc = genRes.n_escritos ?? 0
  const nVac = genRes.n_vacios ?? 0
  console.log(`  generar: ruta=${genRes.data.ruta} (${nEsc} escritos, ${nVac} vacíos)`)
  okCount++
} else if (
  genRes.error.startsWith("formato pdf no implementado") ||
  genRes.error.startsWith("formato portal no implementado")
) {
  const fmt = res.data.formato
  console.log(`  generar: skipped (formato ${fmt})`)
  okCount++
} else { ... }
```

Cambio necesario: **eliminar la condición `genRes.error.startsWith("formato portal no implementado")`** del `else if`, ya que ahora `genRes.ok` será `true` para el portal. El bloque `if (genRes.ok)` ya imprime `ruta=...` correctamente. Solo queda limpiar la condición `else if` para que no quede referenciando un error que ya no ocurre.

El nuevo `console.log` para PA será:
```
  generar: ruta=out/pa-logistica-istmo/valores-portal.md (8 escritos, 0 vacíos)
```
(8 campos no-bancarios del total de 9, donde Banco/Número de cuenta/SWIFT son bancarios = 3 → pero "Banco", "Número de cuenta", "SWIFT" son los 3 bancarios → 9 - 3 = 6 no-bancarios. El conteo depende de qué se defina como `n_escritos`. Ver §5.1 punto 8 para la definición exacta. Lo importante es que la salida ya no dice "skipped".)

**Nota:** el `README.md` muestra la salida esperada de `demo:clean`; también debe actualizarse la línea de PA de `generar: skipped (formato portal)` a la nueva forma. Esto se hace en T14.

### 5.3 Actualización de `verify-xlsx.ts`

**Decisión: ampliar `verify-xlsx.ts`**, no crear archivo nuevo. El script ya cubre PA; simplemente la aserción cambia de `ok:false` a `ok:true + valores-portal.md`. Mantener todo en un solo archivo es consistente con el patrón del proyecto.

**Qué reemplazar:** línea 232:
```ts
await verifyCaseNoXlsx("pa-logistica-istmo", "formato portal no implementado")
```

**Por:** una función nueva `verifyCasePortal(caso: string)` definida antes del `main`, que:
1. Llama la cadena `leer → mapear → generar` sobre el caso.
2. Aserta `genRes.ok === true`.
3. Aserta `genRes.data.formato === "portal"`.
4. Aserta `genRes.data.ruta` termina en `"valores-portal.md"`.
5. Lee el archivo de `path.join(projectRoot, "out", caso, "valores-portal.md")`.
6. Aserta que el contenido incluye `# Valores para portal`.
7. Aserta que el contenido incluye `[enviar por canal seguro]` (RN2 — al menos un campo bancario oculto).
8. Aserta que `formulario.xlsx` NO existe (comportamiento anterior preservado).

### 5.4 SOLUCION.md — contenido completo de las 10 secciones

---

**Sección 1 — Problema en una frase**

El área administrativa de Periferia IT Group transcribe manualmente entre 8 y 12 formularios de registro como proveedor al mes, duplicando trabajo que ya existe en un repositorio interno y que varía en formato según el cliente (Excel, PDF o portal web). Le duele a la analista administrativa que ejecuta el proceso.

---

**Sección 2 — Arquitectura**

```
┌──────────────────┐  POST /api/chat   ┌────────────────────────────────────────┐
│  web/index.html  │ ────────────────▶ │  src/server.ts  (Bun.serve)            │
│  (chat vanilla)  │ ◀──────────────── │  └─ src/agent/ciclo.ts                 │
└──────────────────┘   {reply,         │     ├─ src/llm/anthropic.ts (Anthropic) │
                        toolCalls,     │     ├─ src/agent/sesiones.ts (memoria)  │
                        needsConf}     │     └─ src/agent/herramientas.ts        │
                                       │        ├─ src/tools/proveedor.ts        │
                                       │        └─ fixtures/ (solo lectura)      │
                                       └────────────────┬───────────────────────┘
                                                        │ escribe
                                                   out/ (formularios, paquetes, logs)
```

**Comportamiento:**
- `agent/prompt.md` — comportamiento del agente (CA2, CA3, flujo).
- `src/knowledge/registro-proveedor.md` — conocimiento del dominio (RN1–RN5).
- `src/tools/proveedor.ts` — ejecución (5 herramientas tipadas con zod).

Un cambio de reglas de negocio toca `src/knowledge/`, no el servidor.

---

**Sección 3 — Ciclo del agente**

Implementado en `src/agent/ciclo.ts`. Función `ejecutarTurno(opts)`:

1. Recupera o crea la sesión (`src/agent/sesiones.ts` — `Map<sessionId, Sesion>`).
2. Si hay `confirmacionPendiente` y el mensaje es afirmación verbal (`esConfirmacion`) → ejecuta directamente la herramienta pendiente, limpia el estado (CA3 bypass path).
3. Loop hasta `AGENT_MAX_ITERATIONS` (default 25, configurable — CA1):
   - Envía historial + specs de herramientas al LLM (`LlmAdapter.enviar`).
   - Si el LLM lanza → captura, devuelve `"error del proveedor LLM: ..."`, sesión sigue viva (CA5).
   - Si respuesta sin `tool_calls` → devuelve al usuario.
   - Por cada `tool_call`:
     - Si es `proveedor_simular_envio` con `confirmado:true` y el usuario NO confirmó verbalmente → bloquea, setea `confirmacionPendiente`, devuelve `needsConfirmation:true` (CA3).
     - Si herramienta desconocida → error al modelo.
     - Si args inválidos → error al modelo.
     - Si ok → ejecuta, appende resultado como `role:"tool"`, escribe línea en `out/log.jsonl` (CA4).
4. Al alcanzar el tope → devuelve `"alcancé el tope de N iteraciones; aquí lo que tengo: ..."` (CA1).

---

**Sección 4 — Elección del modelo**

**Proveedor:** Anthropic. **Modelo:** `claude-sonnet-4-5` (configurable vía `LLM_MODEL`).

**Por qué Anthropic/claude-sonnet-4-5:**
- Tool use nativo y maduro: el API de herramientas de Anthropic es estable y bien documentado.
- Calidad de razonamiento suficiente para el flujo leer→mapear→generar→armar→enviar sin confundir pasos.
- Claude Sonnet 4.5 equilibra costo y calidad; Claude Opus sería más caro sin ganancia observable para este flujo determinista.
- SDK oficial (`@anthropic-ai/sdk`) con TypeScript types.

**Costo estimado por caso procesado:**
- Flujo típico: 5 llamadas a herramientas + ~3 turnos de conversación ≈ 8 mensajes LLM.
- Estimación por caso: ~3 000 tokens de input + ~1 000 tokens de output.
- A precios de oct 2026 (Sonnet 4.5): ~$0.003 input + ~$0.003 output ≈ **$0.006 por caso** (~6 centavos de dólar).
- Con 12 casos/mes: ~$0.07/mes. Muy por debajo de cualquier presupuesto operativo.

---

**Sección 5 — Diseño del portal web**

El caso PA (`pa-logistica-istmo`) usa formato `portal` — el cliente exige completar sus datos en `https://vendorhub.logisticaistmo-ficticia.pa`. El agente **no interactúa con portales web** en esta versión; produce `out/<caso>/valores-portal.md` con los valores listos para copiar.

**Estrategia de automatización (diseño, no implementación):**
Para automatizar el llenado de un portal en una fase futura se usaría **Playwright** controlado por el agente (vía un tool `navegar_portal` que envuelva Playwright con comandos de alto nivel: `abrir(url)`, `rellenar(selector, valor)`, `clic(selector)`, `screenshot()`). Alternativamente, **browser-use** (librería que expone el DOM como texto al LLM) simplifica el razonamiento sin necesidad de selectores exactos.

**Límites:**
- **CAPTCHA**: bloquea la automatización completa. Solución: el agente prepara los valores y el humano completa el CAPTCHA manualmente.
- **MFA / OTP**: el humano ingresa el código de un solo uso; el agente espera confirmación.
- **Cambios de layout del portal**: selectores frágiles. Mitigación: usar texto visible + aria-labels en vez de IDs.

**Credenciales:**
- Nunca en el repo, nunca en el prompt, nunca en los logs.
- Se inyectan como variables de entorno del backend (`PORTAL_USER`, `PORTAL_PASS`) o se piden al usuario en tiempo de ejecución por un canal seguro.
- El agente nunca loguea ni devuelve en el chat las credenciales.

**División humano/agente:**
- **Agente**: navega al portal, rellena los campos con los valores del repositorio maestro, hace clic en "Guardar borrador".
- **Humano**: ingresa credenciales, resuelve CAPTCHA/MFA, revisa el borrador, hace clic en "Enviar" final.
- Este modelo asegura que ninguna acción externa irreversible ocurra sin intervención humana (RN4).

---

**Sección 6 — Decisiones y trade-offs**

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 1 | **Bun como runtime** (en vez de Node 20+) | Node + tsx/ts-node | Bun ejecuta TypeScript nativo sin build step, tiene `Bun.serve()` nativo (sin Express/Fastify), y bundler/test runner integrados. Para el reto, reduce la superficie de configuración a cero. |
| 2 | **vanilla HTML/JS para el front** (sin React/Vue/Svelte) | React + Vite | El reto evalúa el agente, no el front. Un único `web/index.html` sin build step es más simple de servir desde `Bun.serve()`, se despliega sin CI/CD adicional, y cumple los requisitos visuales (historial, tool calls, confirmación). |
| 3 | **Sesiones in-memory** (`Map<sessionId, Sesion>`) | Redis / SQLite / archivo JSON | El PRD §6.1 lo permite explícitamente. Para el reto (un usuario a la vez, sin HA) es suficiente. Añadir persistencia requeriría gestionar migraciones, TTL y backups — coste no justificado. |
| 4 | **JSON schemas de herramientas escritos a mano** (sin `zod-to-json-schema`) | `zod-to-json-schema` automático | Evita una dependencia extra. Los 5 schemas son simples y estables; no hay riesgo de divergencia porque los schemas del ciclo y los args zod de la herramienta se revisan en el mismo archivo. |
| 5 | **LlmAdapter como interfaz propia** (en vez de usar el SDK de Anthropic directamente en el ciclo) | Llamar `Anthropic.messages.create` desde `ciclo.ts` | Permite cambiar de proveedor editando solo `src/llm/<proveedor>.ts` + `factory.ts`. El ciclo no sabe qué modelo usa. Verificable: `ciclo.ts` no importa nada de `@anthropic-ai/sdk`. |

---

**Sección 7 — Supuestos**

1. Los fixtures representan fielmente la variabilidad de los clientes reales (diferentes países, formatos, soportes). En producción habrá plantillas con más campos y soportes más complejos.
2. El repositorio maestro (`fixtures/repositorio/maestro.json`) está actualizado. En producción necesita un dueño del dato y un proceso de actualización.
3. Un solo servidor Bun atiende a un usuario a la vez durante la defensa; no se requiere concurrencia real.
4. La clave de Anthropic del evaluador tiene saldo suficiente para procesar los 4 casos del fixture durante la demo.
5. `vigencia_hasta: 2026-09-30` del soporte `camara_comercio` es intencional en los fixtures para demostrar RN3 (bloqueo por soporte vencido). En producción el repositorio tendría vigencias actualizadas.
6. El PRD §6.2 dice "el agente responde con `formato no soportado`" para portal; interpretamos que el agente puede responder con `ok: true` + `valores-portal.md` (más útil) y mencionar en el reply que no interactúa con el portal.

---

**Sección 8 — Cobertura**

| Historia de usuario | Estado | Qué faltaría para producción |
|---|---|---|
| HU-1 · Leer solicitud (`proveedor_leer_solicitud`) | **Hecho** | Soporte para formatos de correo adicionales (HTML, adjuntos reales). Validación de firma del remitente. |
| HU-2 · Mapear campos (`proveedor_mapear_campos`) | **Hecho** | Repositorio maestro con cobertura completa de campos (hoy ~17 campos). Fuzzy matching tunable por área. |
| HU-3 · Generar formulario (`proveedor_generar_formulario`) | **Hecho** (xlsx P0, pdf P1, portal P2 → `valores-portal.md`) | AcroForms rellenables para PDF. Integración real con portales (Playwright). |
| HU-4 · Armar paquete + simular envío (`proveedor_armar_paquete` + `proveedor_simular_envio`) | **Hecho** | Integración con correo real (SMTP/SendGrid). Firma electrónica. Verificación de que los archivos del paquete no han sido modificados antes del envío. |
| HU-5 · Manejo de errores y sesión | **Hecho** (CA1–CA5 en ciclo) | Rate limiting distribuido. Persistencia de sesiones (Redis). Alertas operacionales (timeout, errores LLM reiterados). |

---

**Sección 9 — Uso de IA**

**Asistente principal:** Claude Code (modelo `claude-sonnet-4-6` de Anthropic), usado como orquestador SDD (Spec-Driven Development) para todo el desarrollo.

**Proceso:** El asistente actuó como coordinador de un equipo de agentes especializados:
- **Coordinator** (modelo principal): escribió specs, hizo gates humanos, revisó planes, coordinó commits.
- **Planner** (fork sonnet): para cada slice, leyó el spec + código existente y produjo `plan.md` con tareas atómicas.
- **Implementer** (fork sonnet): ejecutó las tareas del plan, corrió typecheck y scripts de verificación.
- **Reviewer** (fork sonnet): leyó código implementado de forma independiente y emitió `review.md` con veredicto.

**Tareas asistidas por IA:** análisis del PRD, diseño de la arquitectura de slices, generación de specs/planes/código/tests para los 10 slices, revisión de criterios de aceptación, debugging de errores de TypeScript.

**Lo descartado de las propuestas de IA:**
- Uso de React/Vite para el front: descartado por complejidad de build (se optó por vanilla HTML).
- `zod-to-json-schema` para generar schemas de herramientas automáticamente: descartado por dependencia innecesaria.
- Streaming SSE para el chat: descartado (PRD lo marca como "opcional"; la respuesta síncrona es suficiente).
- Uso de un ORM o SQLite para sesiones: descartado (in-memory es suficiente para el reto).
- Framework HTTP (Hono, Express): descartado (Bun.serve nativo es suficiente y evita dependencias).

---

**Sección 10 — Riesgos de producción**

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El modelo "alucina" un valor de campo | Media | Alto | Las herramientas son la única fuente de valores (CA2); el prompt prohíbe literalmente inventar. Mitigación adicional: mostrar siempre la fuente del valor al usuario. |
| La clave LLM se agota o el proveedor tiene downtime | Alta (a largo plazo) | Alto | `SESSION_TOKEN_LIMIT` y `AGENT_MAX_ITERATIONS` limitan el gasto. Fallback: mostrar error claro al usuario sin exponer la clave. Considerar multi-proveedor con `LlmAdapter`. |
| Soportes del repositorio maestro desactualizados | Alta | Medio | Añadir proceso de actualización periódica con dueño del dato. Añadir fecha de última actualización visible al usuario. |
| Portales con CAPTCHA o MFA bloquean automatización | Alta | Medio | Diseño humano-en-el-loop: el agente prepara, el humano completa (ya implementado con `valores-portal.md`). |
| Datos bancarios expuestos en logs o responses | Baja (mitigado) | Muy alto | RN2 implementado: bancarios → `[enviar por canal seguro]` en portal; `borrador-correo.md` escaneado por grep. Auditar en cada deploy. |
| Sesiones en memoria pérdidas al reiniciar el servidor | Alta | Bajo | Aceptable para el reto; en producción añadir Redis con TTL de 24h. |

---

### 5.5 Instrucciones de deploy en README

El implementer **NO debe intentar ejecutar el deploy real** (requiere CLI de Render/Fly/Railway y credenciales de cuenta cloud no disponibles en el proceso automatizado). En su lugar:

Añadir al `README.md` una sección **"Link de prueba"** con este contenido:

```markdown
## Link de prueba

> **Estado del deploy:** pendiente (-10 pts según PRD §9.3). Levantar localmente para la demo:

```bash
cp .env.example .env
# Completar LLM_API_KEY con clave de Anthropic
bun run dev
# Abrir http://localhost:3000
```

Para deploy en producción (Render, Fly.io, Railway):
1. Crear servicio web apuntando a este repo.
2. Configurar variables de entorno: `LLM_API_KEY`, `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-4-5`, `PORT=3000`.
3. Comando de inicio: `bun run src/server.ts`.
4. El front se sirve desde `GET /` — no se necesita configuración extra.
```

## 6. Tareas en orden

1. [ ] **T1 · Verificar imports en `proveedor.ts`** — confirmar que `normalizar` de `src/lib/normalize.ts` está importada. Si no, añadir al bloque de imports existente.
2. [ ] **T2 · Extender `GenerarData` y `GenerarRunResult`** en `proveedor.ts` — cambiar `formato: "xlsx" | "pdf"` a `formato: "xlsx" | "pdf" | "portal"` en el tipo `GenerarData` (línea ~658). Ajustar `GenerarRunResult` si hace falta.
3. [ ] **T3 · Implementar rama portal en `proveedor.ts`** — reemplazar las líneas 743–749 (bloque `if (formato === "portal") { return { ok: false ... } }`) con la implementación completa descrita en §5.1: leer plantilla-campos.json, construir mapa etiqueta→valor, detectar bancarios con `esBancario`, construir el markdown con tabla, escribir el archivo, retornar `ok:true`.
4. [ ] **T4 · Actualizar `demo.ts`** — en las líneas 109–115, eliminar la condición `genRes.error.startsWith("formato portal no implementado")` del `else if`. El bloque `if (genRes.ok)` ya cubre el nuevo comportamiento. Eliminar la rama `else if` que quede vacía o con solo `"formato pdf no implementado"` si ya no aplica (verificar que EC sigue siendo pdf ok:true, no entra ahí).
5. [ ] **T5 · Actualizar `verify-xlsx.ts`** — añadir función `verifyCasePortal(caso)` que corre leer→mapear→generar para PA y aserta: `ok:true`, `formato:"portal"`, ruta termina en `valores-portal.md`, archivo existe, contiene `# Valores para portal`, contiene `[enviar por canal seguro]`, `formulario.xlsx` no existe. Reemplazar línea 232 con llamada a `verifyCasePortal("pa-logistica-istmo")`.
6. [ ] **T6 · Typecheck** — `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit` → exit 0.
7. [ ] **T7 · `bun run demo:clean`** — verificar que PA imprime `generar: ruta=out/pa-logistica-istmo/valores-portal.md ...` (no "skipped"), y que los totales siguen `ok:4 | error:0 | expected-errors:8`.
8. [ ] **T8 · `bun run verify:xlsx`** — debe pasar incluyendo la nueva aserción de `verifyCasePortal`.
9. [ ] **T9 · Regresión completa** — correr `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:pdf`, `verify:paquete`, `verify:envio`, `verify:server` → todos ok.
10. [ ] **T10 · Crear `SOLUCION.md`** — escribir el archivo con el contenido de las 10 secciones documentado en §5.4 de este plan.
11. [ ] **T11 · Actualizar `README.md` sección "Link de prueba"** — añadir la sección descrita en §5.5. Actualizar también la línea de salida esperada de PA en la sección `demo` del README (de `generar: skipped (formato portal)` a la nueva forma).
12. [ ] **T12 · Verificar `SOLUCION.md`** — `grep -c "##" SOLUCION.md` ≥ 10; `grep -i "portal\|CAPTCHA\|credencial" SOLUCION.md` ≥ 3 (sección §7.4 cubierta); `grep -i "Claude Code\|claude-sonnet-4-6" SOLUCION.md` ≥ 1 (sección §9 cubierta).
13. [ ] **T13 · Seguridad** — `grep -i "api_key\|sk-ant-\|LLM_API_KEY" SOLUCION.md README.md web/index.html` → 0 matches en valores literales.
14. [ ] **T14 · Actualizar línea PA en README demo output** — cambiar `generar: skipped (formato portal)` a `generar: ruta=out/pa-logistica-istmo/valores-portal.md (portal, N campos)` en el bloque de salida esperada.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 — portal ok:true + valores-portal.md | T2, T3 | T8 verify:xlsx → `verifyCasePortal` aserta ok:true y archivo existe |
| AC-2 — bancarios ocultos (RN2) | T3 | T8 `verifyCasePortal` aserta `[enviar por canal seguro]` en contenido del archivo |
| AC-3 — demo:clean PA imprime ruta, totales iguales | T4 | T7 demo:clean → línea PA + totales ok:4|error:0|expected-errors:8 |
| AC-4 — verify:xlsx pasa con nuevas aserciones PA | T5, T8 | T8 `bun run verify:xlsx` → ok |
| AC-5 — SOLUCION.md con 10 secciones | T10 | T12 grep ≥ 10 encabezados ## |
| AC-6 — SOLUCION.md sección portal (§7.4) | T10 | T12 grep portal/CAPTCHA/credencial ≥ 3 |
| AC-7 — README link de prueba | T11 | `grep -i "link de prueba\|localhost:3000" README.md` ≥ 2 |
| AC-8 — typecheck exit 0 | T6 | T6 bun x tsc --noEmit exit 0 |
| AC-9 — verify:server 26/26 | T9 | T9 bun run verify:server → 26/26 |

## 8. Estrategia de verificación

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd reto-01

# A) Typecheck
bun x tsc --noEmit                                          # exit 0

# B) Demo regresión + nuevo output PA
bun run demo:clean 2>&1 | grep "pa-logistica\|total:"
# Esperado: "generar: ruta=out/pa-logistica-istmo/valores-portal.md"
# Esperado: "total: 4 casos | ok: 4 | error: 0 | expected-errors: 8"

# C) verify:xlsx (incluye verifyCasePortal)
bun run verify:xlsx                                         # ok: verify-xlsx

# D) Regresión completa
bun run verify:ambiguous && bun run verify:mapeo && bun run verify:h2 \
  && bun run verify:pdf && bun run verify:paquete && bun run verify:envio \
  && bun run verify:server                                  # todos ok

# E) SOLUCION.md estructura
grep -c "^##" SOLUCION.md                                   # ≥ 10
grep -i "CAPTCHA\|Playwright\|credencial" SOLUCION.md       # ≥ 1 match
grep -i "Claude Code\|claude-sonnet-4-6" SOLUCION.md        # ≥ 1 match

# F) Seguridad
grep -i "api_key\|sk-ant-" SOLUCION.md README.md web/index.html || echo "ok: sin claves"

# G) valores-portal.md generado correctamente
test -f out/pa-logistica-istmo/valores-portal.md && echo "ok: archivo existe"
grep "enviar por canal seguro" out/pa-logistica-istmo/valores-portal.md && echo "ok: RN2"
```

## 9. Riesgos y mitigaciones

- **R1 · `normalizar` no importada en `proveedor.ts`**: si no está importada, T1 la añade antes de implementar T3. El archivo ya importa `normalizar` para el fuzzy matching — verificar con `grep normalizar src/tools/proveedor.ts`.
- **R2 · `demo.ts` `GenOk` type no incluye `formato:"portal"`**: el tipo local `GenOk` en `demo.ts` puede tener `formato: "xlsx" | "pdf"`. Actualizar la definición del tipo para incluir `"portal"` o usar un type más amplio.
- **R3 · `verifyCasePortal` usa rutas absolutas de fixtures**: asegurarse de usar `casoDir` / `projectRoot` igual que los otros helpers del script, no rutas absolutas hardcodeadas.
- **R4 · README contiene bloque de código con salida esperada de PA**: hay que actualizarlo en T14 para no tener documentación que contradiga el comportamiento real.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

1. **`n_escritos` / `n_vacios` para portal**: el spec no define conteo para portal. El plan define `n_escritos` = número de campos con valor real escrito (excluye bancarios ocultos y campos sin valor), `n_vacios` = campos sin valor en el Map (excluidos bancarios). Esto es consistente con el patrón xlsx/pdf. El `console.log` del demo mostrará estos conteos como `(portal, N escritos, N vacíos)`.

2. **`verify-xlsx.ts` ampliado** (en vez de nuevo `verify-portal.ts`): el spec decía "actualizar `verify-xlsx.ts` o nuevo `verify:portal`". El plan elige ampliar `verify-xlsx.ts` para mantener el patrón de un script por formato-familia. No se añade entrada en `package.json`.

3. **Deploy marcado como pendiente** (no ejecutado): el spec decía "si el deploy no es posible en esta sesión, documentar". El plan lo documenta como pendiente desde el inicio, dado que el proceso automatizado no tiene acceso a CLI de Render/Fly/Railway ni a credenciales cloud.
