# Spec — 09-front-chat

**Slice:** Front de chat (PRD §6.1 componente obligatorio)
**Autoridad:** `reto-01/PRD.md` §6.1, §6.3 CA3, §6.4, §8 Seguridad, §9.2 README, §11 Prompt de ejemplo
**Fecha:** 2026-10-06
**Depende de:** slice 07+08 cerrado (backend HTTP con 3 endpoints listos).

## 1. Resumen en una frase

Implementar el front de chat en `web/index.html` (HTML/CSS/JS sin framework) que consuma los 3 endpoints del backend, muestre el historial con cada tool call visible, y resalte el estado `needsConfirmation` con una UI explícita.

## 2. Alcance

**En alcance**
- **`web/index.html`** (único archivo entregable del front): HTML + CSS embebido + JS embebido, sin bundler, sin dependencias npm extra.
  - Campo de texto + botón "Enviar" (también Enter).
  - Indicador de "pensando…" mientras espera respuesta del backend.
  - Historial de mensajes con burbujas diferenciadas: usuario (derecha), agente (izquierda).
  - **Tool calls visibles**: cada llamada a herramienta dentro de una respuesta se muestra como bloque colapsable con `nombre`, `argumentos` (JSON resumido) y `resultado` (resumen del ciclo).
  - **Estado `needsConfirmation`**: cuando el backend devuelve `needsConfirmation: true`, la UI muestra un banner o recuadro resaltado ("El agente espera tu confirmación: escribe sí/confirmo/ok para proceder") y el campo de texto cambia de estilo visual.
  - `sessionId` generado en el cliente al cargar la página (UUID v4 simple) y reutilizado en todas las llamadas de la misma sesión.
  - La URL del backend es configurable: leer `window.BACKEND_URL` (inyectable en producción) con fallback a `http://localhost:3000`.
  - Botón "Nueva sesión" que reinicia `sessionId` y limpia el historial.
- **Ajuste `bun run dev`**: actualmente solo levanta el servidor backend (`src/server.ts`). Ampliar para que también sirva `web/index.html` en el mismo proceso. El servidor backend ya usa `Bun.serve()`; añadir una ruta catch-all que sirva el archivo estático si la ruta no empieza por `/api/`.
  - `GET /` → devuelve `web/index.html` con `Content-Type: text/html`.
  - `GET /index.html` → idem.
  - Cualquier ruta no-`/api/` que no exista → 404 JSON como hasta ahora (o bien redirigir a `/`).
- **`README.md` actualizado**: añadir que `bun run dev` levanta front + backend en el mismo puerto; añadir URL de prueba local `http://localhost:3000`.

**Fuera de alcance**
- Framework JS (React, Vue, Svelte, etc.) — no requerido; HTML/JS vanilla es suficiente y más simple de desplegar.
- Streaming SSE (PRD §6.1 "opcional").
- Autenticación.
- Historial persistente entre recargas (in-memory es suficiente por el reto).
- Tests E2E automatizados del front (verificación manual).
- Internacionalización o temas oscuros.

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | `web/index.html` existe y es un archivo HTML válido (sin frameworks). Al abrirlo en el browser apuntando al backend, muestra un chat funcional. | §6.1 "Front de chat" obligatorio |
| AC-2 | **Historial visible**: los mensajes del usuario y del agente se muestran en orden, diferenciados visualmente. El campo de texto se limpia tras enviar. | §6.1 "historial de la conversación" |
| AC-3 | **Indicador "pensando"**: mientras el backend procesa, el UI muestra un estado de carga visible (spinner, puntos, o texto). El botón enviar se deshabilita durante el proceso. | §6.1 "indicador de pensando" |
| AC-4 | **Tool calls visibles**: cada objeto en `toolCalls[]` del response aparece en el historial como un bloque con al menos: nombre de la herramienta, y resultado resumido (`ok: true/false`). Los argumentos son opcionales de mostrar pero el nombre y resultado son obligatorios. | §6.1 "mostrar cada llamada a herramienta", §6.3 CA4 |
| AC-5 | **Estado confirmación resaltado**: cuando `needsConfirmation: true`, la UI cambia de estado visualmente (banner, color distinto, texto de instrucción explícito). Al recibir `needsConfirmation: false` en la siguiente respuesta, el estado se resetea. | §6.1 "resaltar cuando el agente pide confirmación", §6.3 CA3 |
| AC-6 | **`sessionId` persistido por sesión**: se genera al cargar la página y se envía en cada POST /api/chat. El botón "Nueva sesión" genera un nuevo ID y limpia el historial. | §6.4 API |
| AC-7 | **`bun run dev` sirve front + backend**: `GET /` devuelve `web/index.html`; `POST /api/chat` sigue funcionando. Un solo puerto atiende ambos. | §9.2 "Un comando levanta front y backend" |
| AC-8 | **Seguridad front**: el HTML/JS no contiene la `LLM_API_KEY` ni ninguna clave. La URL del backend usa `window.BACKEND_URL ?? "http://localhost:3000"`. | §8 "Nunca en el front" |
| AC-9 | **Flujo PRD §11**: el prompt de ejemplo del PRD funciona end-to-end: escribir "Procesa el caso ec-corp-andina…" → el agente responde con tool calls visibles y resumen; segundo mensaje "envía" → `needsConfirmation:true` resaltado; tercer mensaje "sí confirmo" → se ejecuta. | §11 Prompt de ejemplo |
| AC-10 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0 tras los cambios a `src/server.ts`. El HTML/JS no pasa por tsc (es JS vanilla). | §8 |
| AC-11 | **Regresión backend**: `bun run verify:server` sigue pasando 26/26; endpoints /api/chat, /api/health, /api/sessions/:id funcionan igual. | Regresión |

## 4. Reglas del PRD que aplican

- **§6.1 Front de chat** — componente obligatorio; historial, tool calls, confirmación, indicador de carga.
- **§6.3 CA3** — el front resalta el estado de confirmación pendiente.
- **§6.3 CA4** — tool calls visibles en el historial del chat.
- **§6.4 API** — consume POST /api/chat con `{sessionId, message}` → `{reply, toolCalls, needsConfirmation, sessionId}`.
- **§8 Seguridad** — sin claves en el front.
- **§9.2 README** — un comando levanta todo.
- **§11** — el prompt de ejemplo debe funcionar.

## 5. Dependencias con otros slices

- **Requiere**: slice 07+08 cerrado (backend listo con 3 endpoints).
- **Alimenta**: slice 10+11 (deploy público, donde la URL de producción reemplaza `localhost:3000`).

## 6. Decisiones

1. **HTML/CSS/JS vanilla, sin framework**: el reto no exige framework. Un solo archivo es trivial de servir, no requiere build step, y funciona en cualquier browser moderno. Alternativa (React/Vite) descartada por complejidad de build en Bun sin config extra.
2. **Mismo proceso para front + backend**: `Bun.serve()` sirve el HTML estático en las rutas no-API. Alternativa (puerto separado) descartada porque el PRD pide "un comando levanta front y backend".
3. **`sessionId` en cliente**: UUID v4 generado con `crypto.randomUUID()` (nativo en todos los browsers modernos). No requiere librería.
4. **Tool calls como bloque colapsable**: por defecto colapsado (solo muestra nombre + ok/error); expandible con click para ver args y resultado completo. Mejora legibilidad sin ocultar información.
5. **Verificación manual del front**: no hay `verify:front` automatizado porque requeriría un browser headless (Playwright/Puppeteer) que añade peso. La AC-9 (flujo PRD §11) se verifica manualmente o con el browser embebido del IDE.

## 7. Dudas abiertas

Ninguna. El PRD §6.1 es suficientemente preciso para este slice.
