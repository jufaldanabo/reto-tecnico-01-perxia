# Plan — 09-front-chat

## 1. Objetivo

Crear `web/index.html` (HTML/CSS/JS vanilla) que consuma el backend del slice 07+08 y cumpla los requisitos obligatorios del PRD §6.1: historial, tool calls visibles, indicador de carga y resaltado de confirmación. Extender `src/server.ts` para servir el HTML estático en el mismo proceso/puerto que la API.

## 2. Alcance

Dos archivos se tocan:

1. **`web/index.html`** (crear nuevo): toda la UI del chat en un solo archivo autocontenido.
2. **`src/server.ts`** (editar): añadir rutas estáticas para `GET /` y `GET /index.html` antes del fallback 404.
3. **`README.md`** (editar): actualizar sección "Arranque del servidor" con la URL local y nota sobre el front.

No se tocan: `package.json` (scripts ya correctos — `dev` ya apunta a `src/server.ts`), fixtures, herramientas, ciclo, ni ningun otro archivo.

## 3. Reglas del PRD que aplican

- **§6.1**: historial, tool calls visibles, indicador de carga, resaltado de confirmación — todos obligatorios.
- **§6.3 CA3**: el front debe comunicar visualmente cuando el agente espera confirmación explícita del usuario.
- **§6.3 CA4**: cada tool call del array `toolCalls[]` debe aparecer en el historial del chat.
- **§6.4**: `POST /api/chat` con `{sessionId, message}` → `{reply, toolCalls, needsConfirmation, sessionId}`.
- **§8 Seguridad**: sin `LLM_API_KEY` ni ninguna clave en el HTML/JS; URL del backend configurable via `window.BACKEND_URL`.
- **§9.2**: `bun run dev` levanta front + backend; URL de prueba en README.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `web/index.html` | **crear** | Front de chat completo (HTML + CSS + JS vanilla) |
| `src/server.ts` | **editar** | Añadir rutas `GET /` y `GET /index.html` que sirven el HTML estático |
| `README.md` | **editar** | Actualizar sección de arranque con URL local `http://localhost:3000` y nota del front |

**No se toca:** `package.json`, `agent/prompt.md`, `src/knowledge/`, `src/agent/`, `src/llm/`, `src/tools/`, `demo.ts`, fixtures, scripts verify.

## 5. Diseño detallado

### 5.1 Estructura HTML (`web/index.html`)

```
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registro como Proveedor — Periferia IT Group</title>
  <style> /* CSS embebido — ver §5.2 */ </style>
</head>
<body>
  <header>
    <h1>Registro como Proveedor</h1>
    <button id="btn-nueva-sesion">Nueva sesión</button>
  </header>

  <!-- Banner de confirmación (oculto por defecto) -->
  <div id="banner-confirmacion" class="hidden">
    ⚠️ El agente espera tu confirmación. Escribe <strong>sí</strong>, <strong>confirmo</strong> o <strong>ok</strong> para proceder.
  </div>

  <!-- Historial del chat -->
  <main id="historial"></main>

  <!-- Área de entrada -->
  <footer>
    <textarea id="input-mensaje" placeholder="Escribe tu mensaje..." rows="2"></textarea>
    <button id="btn-enviar">Enviar</button>
  </footer>

  <script> /* JS embebido — ver §5.3 */ </script>
</body>
</html>
```

### 5.2 CSS mínimo

Variables de color para los 3 estados:
- **Normal**: fondo blanco, borde gris.
- **Confirmación pendiente**: banner amarillo/naranja, campo de texto con borde naranja.
- **Error**: burbuja agente con fondo rojo claro.

Estilos clave:
- `.burbuja-usuario`: alineada a la derecha, fondo azul claro.
- `.burbuja-agente`: alineada a la izquierda, fondo gris claro.
- `.bloque-tool`: fondo oscuro (`#f5f5f5`), monospace, `cursor: pointer`; expandible via clase `.expandido`.
- `.bloque-tool .tool-args`, `.bloque-tool .tool-resumen`: visibles solo cuando `.expandido`.
- `#banner-confirmacion.hidden`: `display: none`.
- `#banner-confirmacion` visible: fondo `#fff3cd`, borde `#ffc107`, padding visible.
- `#input-mensaje.confirmacion-pendiente`: borde `2px solid #ffc107`.
- Spinner: `@keyframes spin` en un `<span class="spinner">`.

### 5.3 Lógica JS (funciones clave)

**Estado de la aplicación (variables globales):**
```js
let sessionId = crypto.randomUUID()
let confirmacionPendiente = false
const BACKEND_URL = window.BACKEND_URL ?? 'http://localhost:3000'
```

**`renderMensajeUsuario(texto)`**
- Crea `<div class="burbuja-usuario">` con el texto.
- Appende a `#historial`.
- Hace scroll al final.

**`renderMensajeAgente(reply, toolCalls)`**
- Si `toolCalls.length > 0`, primero renderiza cada tool call con `renderToolCall(tc)`.
- Luego crea `<div class="burbuja-agente">` con `reply` (vacío si solo hay tool calls).
- Appende a `#historial` y hace scroll.

**`renderToolCall(tc)`** — bloque colapsable:
```
[▶] proveedor_leer_solicitud  ok: ✓
    args: { "caso": "co-industrias-delta" }   ← oculto hasta expandir
    resultado: {"ok":true,"data":{"pais":"CO"...  ← oculto hasta expandir
```
- `<details><summary>▶ {tc.name} — ok: {tc.ok ? '✓' : '✗'}</summary><pre>args: ...\nresumen: ...</pre></details>`
- Usar `<details>/<summary>` HTML nativo para evitar JS de toggle.

**`setConfirmacionPendiente(estado: boolean)`**
- Si `true`: mostrar `#banner-confirmacion` (quitar clase `hidden`), añadir clase `confirmacion-pendiente` a `#input-mensaje`.
- Si `false`: ocultar banner, quitar clase del input.
- Actualiza la variable global `confirmacionPendiente`.

**`mostrarPensando()`** / **`ocultarPensando()`**
- Crea/destruye un `<div id="pensando" class="burbuja-agente">` con el texto `Pensando…` y un spinner animado.
- `ocultarPensando()` hace `document.getElementById('pensando')?.remove()`.

**`sendMessage()`** — función principal:
```js
async function sendMessage() {
  const texto = input.value.trim()
  if (!texto || enviando) return
  enviando = true
  btnEnviar.disabled = true
  input.value = ''
  renderMensajeUsuario(texto)
  mostrarPensando()
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message: texto })
    })
    const data = await res.json()
    ocultarPensando()
    renderMensajeAgente(data.reply, data.toolCalls ?? [])
    setConfirmacionPendiente(data.needsConfirmation === true)
  } catch (err) {
    ocultarPensando()
    renderMensajeAgente(`Error de conexión: ${err.message}`, [])
  } finally {
    enviando = false
    btnEnviar.disabled = false
    input.focus()
  }
}
```

**`nuevaSesion()`**
- `sessionId = crypto.randomUUID()`
- `historial.innerHTML = ''`
- `setConfirmacionPendiente(false)`
- Muestra mensaje de sistema: "Nueva sesión iniciada."

**Event listeners:**
- `btnEnviar.addEventListener('click', sendMessage)`
- `input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } })`
- `btnNuevaSesion.addEventListener('click', nuevaSesion)`

### 5.4 Cambios a `src/server.ts`

Añadir **antes** del fallback `return json({ ok: false, error: "ruta no encontrada" }, 404)` al final del handler `fetch`:

```ts
// Servir web/index.html para GET / y GET /index.html
if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
  const htmlPath = path.join(rootDir, "web", "index.html")
  try {
    const html = await fs.readFile(htmlPath, "utf8")
    return new Response(html, {
      headers: { ...CORS_HEADERS, "content-type": "text/html; charset=utf-8" },
    })
  } catch {
    return json({ ok: false, error: "front no disponible" }, 404)
  }
}
```

Posición exacta: entre el bloque `GET /api/sessions/:id` (línea ~100) y el `return json(... 404)` (línea ~109). No se toca ninguna otra línea.

### 5.5 Actualización de `README.md`

En la sección "Arranque del servidor", añadir debajo del bloque `bun run dev`:

```
Abre http://localhost:3000 en el browser — el front de chat carga automáticamente.
```

Actualizar la descripción de `bun run dev` en la tabla de Scripts:
- Antes: "Levanta el servidor HTTP en `PORT` (default 3000)."
- Después: "Levanta backend + front de chat en `PORT` (default 3000). Abre `http://localhost:3000`."

## 6. Tareas en orden

1. [ ] **T1 · Crear directorio `web/`** si no existe: `mkdir -p reto-01/web`.
2. [ ] **T2 · Crear `web/index.html`** — estructura HTML completa con `<head>`, header (`<h1>` + botón "Nueva sesión"), `<div id="banner-confirmacion" class="hidden">`, `<main id="historial">`, footer con `<textarea>` + botón "Enviar".
3. [ ] **T3 · CSS embebido en `web/index.html`** — estilos para: `.burbuja-usuario`, `.burbuja-agente`, `.bloque-tool` (con `<details>`/`<summary>`), `#banner-confirmacion` (visible/hidden), `.confirmacion-pendiente` sobre el `<textarea>`, spinner `@keyframes`, layout responsive básico (max-width 800px centrado).
4. [ ] **T4 · Variables de estado JS** — `let sessionId`, `let enviando = false`, `const BACKEND_URL`, referencias DOM a los elementos.
5. [ ] **T5 · `renderMensajeUsuario(texto)`** — burbuja derecha, scroll al final.
6. [ ] **T6 · `renderToolCall(tc)`** — `<details><summary>` con nombre + ok/✗; contenido expandible con args JSON + resumen.
7. [ ] **T7 · `renderMensajeAgente(reply, toolCalls)`** — primero renderiza tool calls, luego la burbuja de texto (omitida si reply es vacío o null).
8. [ ] **T8 · `mostrarPensando()` / `ocultarPensando()`** — elemento con `id="pensando"` + spinner CSS; `ocultarPensando` lo elimina del DOM.
9. [ ] **T9 · `setConfirmacionPendiente(estado)`** — toggle del banner + clase CSS en el textarea.
10. [ ] **T10 · `sendMessage()`** — fetch POST /api/chat con guard `enviando`, deshabilita botón, llama render* y setConfirmacionPendiente según respuesta, manejo de error de red.
11. [ ] **T11 · `nuevaSesion()`** — nuevo UUID, limpia `#historial`, resetea banner, muestra mensaje de sistema.
12. [ ] **T12 · Event listeners** — Enter en textarea (sin Shift), click en botón Enviar, click en botón Nueva sesión. DOMContentLoaded o al final del `<body>`.
13. [ ] **T13 · Editar `src/server.ts`** — añadir bloque `GET /` + `GET /index.html` que sirve `web/index.html`; posición: entre `GET /api/sessions/:id` y el fallback 404.
14. [ ] **T14 · Editar `README.md`** — añadir "Abre `http://localhost:3000`" en la sección arranque; actualizar descripción de `bun run dev` en la tabla de scripts.
15. [ ] **T15 · Typecheck** — `cd reto-01 && bun x tsc --noEmit` → exit 0 (solo valida los cambios a `src/server.ts`).
16. [ ] **T16 · verify:server regresión** — `bun run verify:server` → 26/26 (los endpoints /api/* no deben verse afectados).
17. [ ] **T17 · Smoke manual del front** — `bun run dev`, abrir `http://localhost:3000`, verificar: (a) HTML carga, (b) enviar mensaje "hola" → burbuja usuario + pensando… + burbuja agente, (c) enviar "procesa co-industrias-delta" → tool calls visibles, (d) banner de confirmación al recibir `needsConfirmation:true`.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 — `web/index.html` existe y funcional | T1, T2 | `ls reto-01/web/index.html`; smoke manual |
| AC-2 — Historial visible, campo limpio | T5, T7, T10 | Smoke manual: mensajes aparecen ordenados; campo vacío tras enviar |
| AC-3 — Indicador "pensando" + botón deshabilitado | T8, T10 | Smoke manual: spinner visible entre envío y respuesta; botón no clicable |
| AC-4 — Tool calls visibles (nombre + ok/error) | T6, T7 | Smoke manual: bloque `<details>` por cada toolCall; `proveedor_leer_solicitud — ✓` visible |
| AC-5 — Confirmación resaltada | T9, T10 | Smoke manual: banner naranja + borde textarea naranja cuando `needsConfirmation:true` |
| AC-6 — `sessionId` persistido + Nueva sesión | T4, T11, T12 | DevTools Network: `sessionId` igual en todas las peticiones de una sesión; al click Nueva sesión cambia |
| AC-7 — `bun run dev` sirve front + backend | T13 | `curl http://localhost:3000/` → HTML; `curl -X POST http://localhost:3000/api/chat` → JSON |
| AC-8 — Sin claves en front | T2–T12 | `grep -i "api_key\|sk-ant-\|LLM_API_KEY" web/index.html` → 0 matches |
| AC-9 — Flujo PRD §11 end-to-end | T2–T12 | Smoke manual con `LLM_API_KEY` real: prompt del PRD §11 funciona |
| AC-10 — Typecheck exit 0 | T13, T15 | `bun x tsc --noEmit` exit 0 |
| AC-11 — Regresión verify:server | T13, T16 | `bun run verify:server` → 26/26 |

## 8. Estrategia de verificación

**Automatizable:**
```bash
export PATH="$HOME/.bun/bin:$PATH"
cd reto-01

# A) Typecheck — valida cambios a server.ts
bun x tsc --noEmit                      # exit 0

# B) Regresión backend — endpoints /api/* intactos
bun run verify:server                   # 26/26

# C) Archivo existe y sin claves
test -f web/index.html && echo "ok: web/index.html existe"
grep -i "api_key\|sk-ant-\|LLM_API_KEY" web/index.html && echo "FALLO: clave en front" || echo "ok: sin claves"

# D) Server sirve el HTML (curl, sin LLM_API_KEY real)
# Levantar server con LLM_PROVIDER=mock en background, curl /, parar.
```

**Manual (requiere browser + LLM_API_KEY real):**
- AC-3: spinner visible (~1-3 segundos con Anthropic).
- AC-4: bloque de tool calls con `<details>` expandibles.
- AC-5: banner naranja cuando `needsConfirmation:true`.
- AC-9: flujo completo del PRD §11.

## 9. Riesgos y mitigaciones

- **R1 · CORS al abrir `index.html` como `file://`**: si el usuario abre el HTML directamente desde el sistema de archivos (no via el servidor), el browser bloquea las peticiones fetch a `localhost:3000` por CORS. **Mitigación**: el spec ya requiere que `bun run dev` sirva el HTML en el mismo origen; en la documentación (README) se instruye abrir `http://localhost:3000`, no el archivo directamente. El server ya tiene `CORS_HEADERS` permisivos, pero el origen `null` (file://) puede bloquearse dependiendo del browser.

- **R2 · `crypto.randomUUID()` no disponible en browsers muy antiguos**: IE y Edge Legacy no lo soportan. **Mitigación**: el reto es para Periferia IT Group con infraestructura moderna; aceptable. Alternativa de fallback: `Math.random().toString(36).slice(2)` como polyfill de una línea si se detecta ausencia.

- **R3 · `<details>/<summary>` colapsable no funciona en IE**: mismo contexto; aceptable para el reto.

- **R4 · `server.ts` sirve HTML con `await fs.readFile` en cada request**: en producción sería un bottleneck leve. **Mitigación**: para el reto (un usuario a la vez) es completamente aceptable. Si fuera producción, se cachearía el HTML en memoria al arrancar el servidor.

- **R5 · El textarea con Enter envía pero el usuario puede querer escribir saltos de línea**: se usa `Shift+Enter` para salto de línea y `Enter` para enviar, que es el patrón estándar de chat apps. **Mitigación**: documentado en el placeholder del textarea o en un tooltip.

- **R6 · `toolCalls[].resumen` puede ser un JSON string largo**: el bloque `<details>` lo muestra en `<pre>` truncado a los primeros 500 chars + `…`. **Mitigación**: truncado en JS al renderizar; el texto completo sigue en el DOM para copiar.

- **R7 · Typecheck no valida el JS vanilla**: el HTML/JS no pasa por tsc. Errores de tipo en el JS del front solo se detectan en runtime. **Mitigación**: el JS es deliberadamente simple (no hay tipos complejos); el smoke manual detecta errores de sintaxis/runtime.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

1. **`<details>/<summary>` en vez de toggle JS para tool calls**: el spec dice "bloque colapsable"; el plan usa el elemento HTML nativo `<details>/<summary>` en vez de manejar el toggle con JS y clases CSS. **Motivo**: menos código, comportamiento nativo del browser, accesible por defecto. El resultado visual es equivalente.

2. **Spinner CSS puro en vez de imagen/SVG**: el spec no especifica el tipo de indicador de carga. El plan usa `@keyframes spin` sobre un `<span>` con borde. **Motivo**: sin dependencias externas; funciona offline.

3. **`src/server.ts` lee `web/index.html` del disco en cada request** (no lo cachea en memoria al arrancar): el spec dice "sirve el archivo estático"; el plan lo lee en cada GET. **Motivo**: simplicidad y consistencia con el patrón de `cargarPrompt()` ya existente. En el reto (un usuario) el overhead es despreciable.

4. **No se añade script `verify:front` a `package.json`**: el spec §6.5 dice verificación manual. El plan confirma esta decisión: la verificación automatizable (typecheck + verify:server) cubre los ACs estructurales; el smoke manual cubre los visuales. No se añaden dependencias de browser headless.
