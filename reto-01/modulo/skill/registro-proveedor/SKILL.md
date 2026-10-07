---
name: registro-proveedor
description: Reglas de negocio del proceso de inscripción de proveedores en Periferia IT Group (RN1-RN5)
---

# Conocimiento del proceso — Registro como Proveedor

Este archivo describe las reglas de negocio que rigen el proceso de inscripción de proveedores en **Periferia IT Group**. El agente lo consulta para interpretar los resultados de las herramientas y orientar al usuario.

---

## RN1 — Identificador tributario por país

Cada país usa un identificador fiscal diferente. El agente debe reconocer el término correcto según el país del caso:

| País | Código | Identificador tributario |
|---|---|---|
| Colombia | CO | NIT (Número de Identificación Tributaria) |
| Ecuador | EC | RUC (Registro Único de Contribuyentes) |
| Perú | PE | RUC (Registro Único de Contribuyentes) |
| Panamá | PA | RUC (Registro Único de Contribuyentes) |
| Honduras | HN | RTN (Registro Tributario Nacional) |

Si el usuario menciona un identificador incorrecto para el país (p.ej. "NIT" para un caso de Ecuador), el agente debe aclarar que el identificador correcto es el RUC sin inventar el valor.

---

## RN2 — Datos bancarios: opt-in, canal seguro

Los datos bancarios del proveedor (número de cuenta, banco, tipo de cuenta, IBAN, SWIFT) son **opcionales** y se recopilan únicamente si el proveedor decide incluirlos ("opt-in").

Restricciones:
- Los datos bancarios **nunca** se incluyen en el borrador de correo (`borrador-correo.md`) generado por `proveedor_armar_paquete`.
- Si `proveedor_mapear_campos` devuelve un campo bancario como `requiere_confirmacion`, el agente debe indicar al usuario que lo entregue por un canal seguro fuera del chat (correo cifrado, portal seguro).
- El agente no solicita ni almacena datos bancarios por su cuenta.

---

## RN3 — Soportes vencidos o ausentes bloquean `listo_para_firma`

El paquete solo puede enviarse si **todos** los soportes exigidos están presentes y vigentes. Un soporte se clasifica como:

- **Presente (P)**: existe en el repositorio y su `vigencia_hasta` es mayor o igual a la fecha del día.
- **Ausente (A)**: no existe en el repositorio.
- **Vencido (V)**: existe pero su `vigencia_hasta` es anterior a la fecha del día.

Si algún soporte tiene estado A o V, `proveedor_armar_paquete` devuelve `listo_para_firma: false` con la lista de bloqueos. En ese caso:
- El agente debe informar al usuario cuáles soportes están vencidos o ausentes.
- El agente debe sugerir que se actualicen los documentos antes de intentar el envío.
- `proveedor_simular_envio` también rechazará el envío con un error `"no listo para firma: <bloqueos>"`.

---

## RN4 — Ninguna acción externa sin confirmación explícita del turno anterior

Antes de ejecutar `proveedor_simular_envio` con `confirmado: true`, el sistema exige que el usuario haya emitido una confirmación verbal en el turno **inmediatamente anterior**. Esta regla existe para evitar envíos accidentales.

Palabras que el sistema reconoce como confirmación (case-insensitive, sin acentos):
`sí`, `si`, `confirmo`, `confirmar`, `ok`, `dale`, `yes`, `confirmed`

Si el usuario escribe "no" como primera palabra, no se trata como confirmación aunque contenga otras palabras de la lista (p.ej. "no, ok" → no confirma).

El agente debe respetar este flujo y nunca saltarse el turno de confirmación.

---

## RN5 — Registro de cada llamada a herramienta

Cada vez que el ciclo del agente ejecuta una herramienta, se registra una línea en `out/log.jsonl` (log global por sesión) y en `out/<caso>/log.jsonl` (log por caso, escrito por las herramientas directamente).

Cada línea de log tiene el formato:
```json
{"ts":"<ISO8601>","sessionId":"<id>","caso":"<nombre>","tool":"<proveedor_xxx>","ok":true,"resumen":{...}}
```

Este log es auditable y permite reconstruir el historial de acciones del agente sobre cada caso.

---

## Formatos de formulario por país

| País | Formato | Herramienta de generación |
|---|---|---|
| CO | xlsx | `proveedor_generar_formulario` (escribe `out/<caso>/formulario.xlsx`) |
| HN | xlsx | `proveedor_generar_formulario` (escribe `out/<caso>/formulario.xlsx`) |
| EC | pdf | `proveedor_generar_formulario` (escribe `out/<caso>/formulario.pdf`) |
| PE | pdf | `proveedor_generar_formulario` (escribe `out/<caso>/formulario.pdf`) |
| PA | portal | `proveedor_generar_formulario` devuelve error "no implementado" para portal (slice posterior) |

---

## Proceso completo paso a paso

1. **Leer solicitud** (`proveedor_leer_solicitud`): obtener país, cliente, formato, lista de campos exigidos y soportes requeridos.
2. **Mapear campos** (`proveedor_mapear_campos`): cruzar campos contra el repositorio maestro y glosario. Identificar llenos, faltantes y los que requieren confirmación del proveedor.
3. **Generar formulario** (`proveedor_generar_formulario`): crear el archivo en el formato correcto con los valores disponibles.
4. **Armar paquete** (`proveedor_armar_paquete`): reunir formulario, soportes, checklist y borrador de correo. Verificar `listo_para_firma`.
5. **Confirmar con el usuario**: presentar el estado del paquete y pedir autorización explícita.
6. **Simular envío** (`proveedor_simular_envio`): solo tras confirmación verbal. Escribe `out/<caso>/ENVIO-SIMULADO.md` si el paquete está listo.
