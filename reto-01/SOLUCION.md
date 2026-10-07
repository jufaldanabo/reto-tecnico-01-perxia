# SOLUCION.md — Registro como Proveedor (Periferia IT Group)

## 1. Problema en una frase

El área administrativa de Periferia IT Group transcribe manualmente entre 8 y 12 formularios de registro como proveedor al mes, duplicando trabajo que ya existe en un repositorio interno y que varía en formato según el cliente (Excel, PDF o portal web). Le duele a la analista administrativa que ejecuta el proceso.

## 2. Arquitectura

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

- `modulo/agent.md` — fuente canónica del system prompt (frontmatter YAML + body); `server.ts` lo lee y hace strip del frontmatter antes de enviarlo al LLM.
- `src/knowledge/registro-proveedor.md` — conocimiento del dominio (RN1–RN5); espejado en `modulo/skill/registro-proveedor/SKILL.md`.
- `src/tools/proveedor.ts` — ejecución (5 herramientas tipadas con zod); re-exportado desde `modulo/tools/proveedor.ts`.

Un cambio de reglas de negocio toca `src/knowledge/`, no el servidor.

## 3. Ciclo del agente

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

## 4. Elección del modelo

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

## 5. Diseño del portal web

El caso PA (`pa-logistica-istmo`) usa formato `portal` — el cliente exige completar sus datos en un portal web del cliente. El agente **no interactúa con portales web** en esta versión; produce `out/<caso>/valores-portal.md` con los valores listos para copiar.

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

## 6. Módulo reutilizable (bonus §9.4)

La carpeta `modulo/` empaqueta el agente para integrarse a otras plataformas sin depender del servidor HTTP:

```
modulo/
├── agent.md                              ← frontmatter (description, mode: primary, permission: {edit: deny, bash: deny})
│                                           + body = system prompt completo (fuente canónica; server.ts lo lee)
├── tools/proveedor.ts                    ← re-export de src/tools/proveedor (export * from "../../src/tools/proveedor")
└── skill/registro-proveedor/SKILL.md    ← frontmatter (name, description) + body = reglas RN1-RN5
```

**Diseño de no-divergencia:**
- `modulo/agent.md` es la fuente canónica: `src/server.ts` lee este archivo, hace strip del bloque YAML frontmatter (`stripFrontmatter`) y usa el body como `systemPrompt`. No existen dos copias del system prompt.
- `modulo/tools/proveedor.ts` es un barrel re-export de una línea: `export * from "../../src/tools/proveedor"`. Las herramientas viven en un solo lugar; `modulo/` solo expone el punto de entrada.
- `modulo/skill/registro-proveedor/SKILL.md` replica el body de `src/knowledge/registro-proveedor.md` con frontmatter añadido. Es la única pieza que tiene riesgo de divergencia; se mitiga documentando en ambos archivos la relación de espejo.

**Para usar en otra plataforma de agentes** (p.ej. Claude Code, Cursor, un orquestador propio):
1. Copiar `modulo/` al repo de la plataforma destino.
2. Apuntar el agente a `agent.md` (frontmatter lo configura como agente primario con permisos de solo-lectura).
3. Importar `tools/proveedor.ts` y registrar las 5 herramientas en el catálogo del orquestador destino.
4. Cargar `skill/registro-proveedor/SKILL.md` como skill de conocimiento del dominio.

## 7. Decisiones y trade-offs



| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 1 | **Bun como runtime** (en vez de Node 20+) | Node + tsx/ts-node | Bun ejecuta TypeScript nativo sin build step, tiene `Bun.serve()` nativo (sin Express/Fastify), y bundler/test runner integrados. Para el reto, reduce la superficie de configuración a cero. |
| 2 | **vanilla HTML/JS para el front** (sin React/Vue/Svelte) | React + Vite | El reto evalúa el agente, no el front. Un único `web/index.html` sin build step es más simple de servir desde `Bun.serve()`, se despliega sin CI/CD adicional, y cumple los requisitos visuales (historial, tool calls, confirmación). |
| 3 | **Sesiones in-memory** (`Map<sessionId, Sesion>`) | Redis / SQLite / archivo JSON | El PRD §6.1 lo permite explícitamente. Para el reto (un usuario a la vez, sin HA) es suficiente. Añadir persistencia requeriría gestionar migraciones, TTL y backups — coste no justificado. |
| 4 | **JSON schemas de herramientas escritos a mano** (sin `zod-to-json-schema`) | `zod-to-json-schema` automático | Evita una dependencia extra. Los 5 schemas son simples y estables; no hay riesgo de divergencia porque los schemas del ciclo y los args zod de la herramienta se revisan en el mismo archivo. |
| 5 | **LlmAdapter como interfaz propia** (en vez de usar el SDK de Anthropic directamente en el ciclo) | Llamar `Anthropic.messages.create` desde `ciclo.ts` | Permite cambiar de proveedor editando solo `src/llm/<proveedor>.ts` + `factory.ts`. El ciclo no sabe qué modelo usa. Verificable: `ciclo.ts` no importa nada de `@anthropic-ai/sdk`. |

## 8. Supuestos

1. Los fixtures representan fielmente la variabilidad de los clientes reales (diferentes países, formatos, soportes). En producción habrá plantillas con más campos y soportes más complejos.
2. El repositorio maestro (`fixtures/repositorio/maestro.json`) está actualizado. En producción necesita un dueño del dato y un proceso de actualización.
3. Un solo servidor Bun atiende a un usuario a la vez durante la defensa; no se requiere concurrencia real.
4. La clave de Anthropic del evaluador tiene saldo suficiente para procesar los 4 casos del fixture durante la demo.
5. `vigencia_hasta: 2026-09-30` del soporte `camara_comercio` es intencional en los fixtures para demostrar RN3 (bloqueo por soporte vencido). En producción el repositorio tendría vigencias actualizadas.
6. El PRD §6.2 dice "el agente responde con `formato no soportado`" para portal; interpretamos que el agente puede responder con `ok: true` + `valores-portal.md` (más útil) y mencionar en el reply que no interactúa con el portal.

## 9. Cobertura

| Historia de usuario | Estado | Qué faltaría para producción |
|---|---|---|
| HU-1 · Leer solicitud (`proveedor_leer_solicitud`) | **Hecho** | Soporte para formatos de correo adicionales (HTML, adjuntos reales). Validación de firma del remitente. |
| HU-2 · Mapear campos (`proveedor_mapear_campos`) | **Hecho** | Repositorio maestro con cobertura completa de campos (hoy ~17 campos). Fuzzy matching tunable por área. |
| HU-3 · Generar formulario (`proveedor_generar_formulario`) | **Hecho** (xlsx P0, pdf P1, portal P2 → `valores-portal.md`) | AcroForms rellenables para PDF. Integración real con portales (Playwright). |
| HU-4 · Armar paquete + simular envío (`proveedor_armar_paquete` + `proveedor_simular_envio`) | **Hecho** | Integración con correo real (SMTP/SendGrid). Firma electrónica. Verificación de integridad de archivos antes del envío. |
| HU-5 · Manejo de errores y sesión | **Hecho** (CA1–CA5 en ciclo) | Rate limiting distribuido. Persistencia de sesiones (Redis). Alertas operacionales (timeout, errores LLM reiterados). |
| **Bonus §9.4** · Módulo reutilizable (`modulo/`) | **Hecho** | Publicar como paquete npm. Añadir tests de integración para el re-export. Mantener `SKILL.md` en sync con `src/knowledge/` via CI. |

## 10. Uso de IA

**Asistente principal:** Claude Code (modelo `claude-sonnet-4-6` de Anthropic), usado como orquestador SDD (Spec-Driven Development) para todo el desarrollo.

**Proceso:** El asistente actuó como coordinador de un equipo de agentes especializados:
- **Coordinator** (modelo principal): escribió specs, hizo gates humanos, revisó planes, coordinó commits.
- **Planner** (fork sonnet): para cada slice, leyó el spec + código existente y produjo `plan.md` con tareas atómicas.
- **Implementer** (fork sonnet): ejecutó las tareas del plan, corrió typecheck y scripts de verificación.
- **Reviewer** (fork sonnet): leyó código implementado de forma independiente y emitió `review.md` con veredicto.

**Tareas asistidas por IA:** análisis del PRD, diseño de la arquitectura de slices, generación de specs/planes/código/tests para los 11 slices (incluyendo bonus), revisión de criterios de aceptación, debugging de errores de TypeScript.

**Lo descartado de las propuestas de IA:**
- Uso de React/Vite para el front: descartado por complejidad de build (se optó por vanilla HTML).
- `zod-to-json-schema` para generar schemas de herramientas automáticamente: descartado por dependencia innecesaria.
- Streaming SSE para el chat: descartado (PRD lo marca como "opcional"; la respuesta síncrona es suficiente).
- Uso de un ORM o SQLite para sesiones: descartado (in-memory es suficiente para el reto).
- Framework HTTP (Hono, Express): descartado (Bun.serve nativo es suficiente y evita dependencias).

## 11. Riesgos de producción

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El modelo "alucina" un valor de campo | Media | Alto | Las herramientas son la única fuente de valores (CA2); el prompt prohíbe literalmente inventar. Mitigación adicional: mostrar siempre la fuente del valor al usuario. |
| La clave LLM se agota o el proveedor tiene downtime | Alta (a largo plazo) | Alto | `SESSION_TOKEN_LIMIT` y `AGENT_MAX_ITERATIONS` limitan el gasto. Fallback: mostrar error claro al usuario sin exponer la clave. Considerar multi-proveedor con `LlmAdapter`. |
| Soportes del repositorio maestro desactualizados | Alta | Medio | Añadir proceso de actualización periódica con dueño del dato. Añadir fecha de última actualización visible al usuario. |
| Portales con CAPTCHA o MFA bloquean automatización | Alta | Medio | Diseño humano-en-el-loop: el agente prepara, el humano completa (ya implementado con `valores-portal.md`). |
| Datos bancarios expuestos en logs o responses | Baja (mitigado) | Muy alto | RN2 implementado: bancarios → `[enviar por canal seguro]` en portal; `borrador-correo.md` escaneado por grep. Auditar en cada deploy. |
| Sesiones en memoria pérdidas al reiniciar el servidor | Alta | Bajo | Aceptable para el reto; en producción añadir Redis con TTL de 24h. |
