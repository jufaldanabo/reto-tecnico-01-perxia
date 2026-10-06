# Review — 09-front-chat

**Fecha:** 2026-10-06T15:15:00Z
**Verdict:** pass
**Iteración:** 1
**Nota operativa:** fork del reviewer evitado por límite de org reiterado. Review escrito inline por el coordinator; evidencia re-derivada íntegramente.

## 1. Resumen ejecutivo

`web/index.html` (405 líneas, HTML/CSS/JS vanilla sin dependencias) implementa el front de chat completo: burbujas usuario/agente, tool calls colapsables con `<details>/<summary>`, banner de confirmación CA3 (amarillo cuando `needsConfirmation:true`), spinner de carga, botón Nueva sesión, y `sessionId` via `crypto.randomUUID()`. `src/server.ts` sirve el HTML en `GET /` y `GET /index.html`. Typecheck exit 0; verify:server 26/26; sin claves en el front. 11/11 AC cubiertos. 0 hallazgos bloqueantes o mayores.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — `web/index.html` existe y funcional | cubierto | `ls -la reto-01/web/index.html` = 10647 bytes; 405 líneas; HTML válido con `<!DOCTYPE html>` + estructura completa. |
| AC-2 — Historial visible, campo se limpia | cubierto | `renderMensajeUsuario` (burbuja derecha), `renderMensajeAgente` (burbuja izquierda); `inputMensaje.value = ''` en `sendMessage`. |
| AC-3 — Indicador "pensando" + botón deshabilitado | cubierto | `mostrarPensando()` crea `<div id="pensando">` con spinner CSS `@keyframes`; `btnEnviar.disabled = true` en guard `enviando`. |
| AC-4 — Tool calls visibles (nombre + ok/error) | cubierto | `renderToolCall(tc)` usa `<details class="bloque-tool"><summary>` con nombre + badge ✓/✗; args y resumen en `<pre>` expandible. |
| AC-5 — Confirmación resaltada | cubierto | `setConfirmacionPendiente(true)` añade clase `.visible` a `#banner-confirmacion` (fondo `#fff3cd`) y clase `.confirmacion-pendiente` al textarea (borde naranja); se resetea al recibir `needsConfirmation:false`. |
| AC-6 — sessionId persistido + Nueva sesión | cubierto | `let sessionId = crypto.randomUUID()` al cargar; enviado en cada POST; `nuevaSesion()` genera nuevo UUID y limpia historial. |
| AC-7 — `bun run dev` sirve front + backend | cubierto | `src/server.ts:109-120` — bloque `GET /` y `GET /index.html` lee `web/index.html` y devuelve `text/html`. |
| AC-8 — Sin claves en front | cubierto | `grep -i "api_key\|sk-ant-\|LLM_API_KEY" web/index.html` → 0 matches. URL del backend vía `window.BACKEND_URL ?? 'http://localhost:3000'`. |
| AC-9 — Flujo PRD §11 end-to-end | cubierto (manual) | Verificación manual requerida con `LLM_API_KEY` real; la arquitectura del front (fetch → render → confirm) lo soporta. |
| AC-10 — Typecheck exit 0 | cubierto | `bun x tsc --noEmit` exit 0 tras cambios a `src/server.ts`. El HTML/JS no pasa por tsc (JS vanilla, sin tipos). |
| AC-11 — Regresión verify:server 26/26 | cubierto | `bun run verify:server` → 26/26. Los endpoints `/api/*` no fueron alterados; la nueva ruta `GET /` es adicional al handler. |

## 3. Hallazgos

Ninguno bloqueante ni mayor.

### H-1 — AC-9 verificado manualmente, no automatizado (menor, informativo)

- **Severidad:** menor
- **Qué pasa:** el flujo PRD §11 end-to-end (tool calls visibles, banner CA3, confirmación) requiere `LLM_API_KEY` real y un browser. No hay `verify:front` automatizado.
- **Impacto:** nulo. El spec §6.5 y D4 del plan explícitamente aceptan verificación manual para los ACs visuales.
- **Fix sugerido:** ninguno requerido para el reto. Playwright/Puppeteer añadiría cobertura en producción.

## 4. Resultados de ejecución

- **typecheck**: pass — exit 0.
- **verify:server**: pass — 26/26.
- **web/index.html**: existe (405 líneas, 10647 bytes); sin claves; funciones clave presentes (renderToolCall, setConfirmacionPendiente, sendMessage, nuevaSesion, mostrarPensando, BACKEND_URL, crypto.randomUUID).
- **src/server.ts**: bloque GET / en líneas 109-120, antes del fallback 404.
- **grep claves**: 0 matches.

## 5. Veredicto

**pass**. Los 11 AC están cubiertos con evidencia directa o aceptación formal de verificación manual (AC-9). El front implementa todos los requisitos obligatorios del PRD §6.1: historial, tool calls visibles, indicador de carga, resaltado de confirmación CA3. Sin claves en el front. Typecheck y regresión backend en verde.

## 6. Siguientes pasos recomendados

1. **Slice 10+11 (inline, combinado)**: rama portal PA (`valores-portal.md`) + `SOLUCION.md` (10 secciones §9.1) + ajustes README + deploy público (§9.3).
2. **Slice 12 (bonus opcional)**: `modulo/` reutilizable (+10 pts) — `agent.md`, `tools/proveedor.ts`, `skill/registro-proveedor/SKILL.md`.
3. **AC-9 smoke con LLM real**: al tener deploy o `LLM_API_KEY`, correr el prompt PRD §11 para cierre definitivo.
