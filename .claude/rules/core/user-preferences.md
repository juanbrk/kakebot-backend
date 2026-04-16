# User Preferences

## Bot UI

### Button Order
When presenting multiple action buttons in an inline keyboard row:
- **Left**: negative/dismissive actions (Cancelar, Volver, Salir, Anterior)
- **Right**: positive/affirmative actions (Confirmar, Continuar, Crear, Siguiente)

### Context Messages After Submenu Actions

When the user selects a submenu option that triggers a delivery action (e.g., sending a file, a report, or a data export), send a brief context message **before** the payload:

- Describe what is being sent, in plain language, without emojis
- Include the relevant identifiers (month, card name, service name, etc.)
- Use the format: `Acá tenés [el/los/la] [tipo de contenido] de [identificador] [complemento]`

Examples:
- `Acá tenés el resumen de Abril 2026 para Visa 5477 - Galicia en formato PDF`
- `Acá tenés el comprobante de Mayo 2026 para Telecentro`

This applies to: file downloads, report generation, document delivery.

### Emoji Usage
Only use emojis in:
- **Success confirmations**: e.g., `✅ Guardado.`, `✅ Actualizado.`
- **Error messages**: e.g., `❌ Error al guardar.`
- **Explicit user request**: when the user explicitly asks for an emoji

Never use emojis in:
- Button labels
- Descriptive UI text (titles, prompts, field labels)
- Status text that is not a direct action result (e.g., "Método de pago: Tarjeta de Crédito")

## Ticket Format

When requesting improvements (bug), bugs (error), features (feature), or automations (automatizacion), use the templates below. Provide ONLY the information defined in each template — no additions, no omissions.

### Feature (Funcionalidad)

```
## Historia de Usuario

Describe la historia desde el punto de vista del usuario involucrado. Ten en cuenta lo que esperaría que ocurra cuando esta nueva funcionalidad sea implementada.

Consejos para una buena historia de usuario:
- Sé breve y conciso
- Explica el resultado esperado desde el punto de vista del usuario
- Establece un objetivo claro que debe alcanzarse
- Omite tecnicismos

Ejemplo:
Como administrador, quiero poder seleccionar un color desde un selector al crear una nueva capa, para poder visualizar el color seleccionado.

## Criterios de Aceptación

Describe qué se necesita para que la funcionalidad esté lista para ser implementada.

Ejemplo:
- Al crear una nueva capa, quiero poder elegir un color desde un selector
- Al visualizar la lista de capas, quiero ver una previsualización del color de cada capa

## Aspectos Técnicos | Reglas

(Si es necesario) Agrega criterios de aceptación desde una perspectiva técnica, de negocio o del dominio.

## Sugerencias UX

Incluye sugerencias sobre experiencia de usuario: flujo del usuario, componentes, colores, etc.

Ejemplo:
- En la página de lista, el usuario hace clic en el botón Crear
- Aparece un modal con un formulario que pide: color (obligatorio)
- Se envía un POST y aparece feedback visual
```

### Bug (Error)

```
## Comportamiento Actual

Describe la situación actual y cómo está funcionando la funcionalidad que necesita ser corregida.

Pasos para replicar:
1. ...
2. ...
3. ...

Ejemplo:
Al crear una nueva capa desde la página de lista de capas, si se utiliza la paginación en la tabla, esto impacta la consulta de proyectos, resultando en que no se muestren proyectos en el modal.

## Comportamiento Deseado

¿Qué es lo que queremos corregir? Basado en lo que actualmente sucede y lo que deseamos que suceda.

Ejemplo:
La consulta para obtener proyectos debería ser independiente de la paginación de la lista de capas.

## Aspectos Técnicos

Si es necesario, agrega criterios de aceptación desde el punto de vista técnico.

Ejemplo:
- Las peticiones dentro de los modales no deberían leer de los parámetros de la URL
```

### Improvement (Mejora)

```
## Historia de Usuario

Sé breve y conciso. Explica el resultado esperado desde el punto de vista del usuario involucrado. Establece un objetivo claro. Omite tecnicismos.

Ejemplo:
Como usuario, quiero que los metros sean la métrica predeterminada al navegar en la página de navegación del proyecto, para que se muestren en el control de imagen.

## Situación Actual

Describe la situación actual y cómo funciona la funcionalidad que se mejorará.

Ejemplo:
En la página de navegación del proyecto, un usuario puede desplazarse utilizando los controles de imagen ingresando la cantidad de metros o poses deseada. Actualmente, este control tiene las poses como métrica predeterminada.

## Situación Deseada

Describe lo que queremos mejorar, basándonos en cómo funciona actualmente y en el resultado esperado.

Ejemplo:
En la página de navegación del proyecto, se debe mostrar los metros como la métrica de navegación predeterminada en el control de imagen.

## Criterios de Aceptación

¿Qué se necesita para considerar esta mejora como completa?

Ejemplo:
- Mostrar metros como métrica predeterminada en el control de imagen
```

### Automatización (Automatizacion)

Escribir desde el **punto de vista del desarrollador**. Foco en cómo mejora el flujo de trabajo, reduce tareas manuales repetitivas o previene errores.

```
Intención: [¿Cuál es el propósito central de la automatización? 1-2 oraciones describiendo el problema del desarrollador que se resuelve]

Estado Actual: [¿Cuál es el proceso o flujo manual hoy? ¿Qué fricción o pasos repetitivos existen?]

Automatización Deseada: [Describir el flujo automatizado como si ya estuviera funcionando — qué lo dispara, qué hace, qué produce, y cómo interactúa el desarrollador con él]

Mejoras:
- [Qué se vuelve más rápido, fácil o confiable]
- [Qué carga cognitiva se elimina]

Criterios de Aceptación:
- [Requisito específico y verificable — e.g., "se dispara ante el evento X"]
- [e.g., "bloquea el merge ante la condición Y"]
- [e.g., "se integra con la herramienta Z"]
```
