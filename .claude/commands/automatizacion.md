# Automatización Ticket

Genera un ticket de tipo **Automatización** a partir del contexto de la sesión actual.

---

## Ejecución

### Fase 1 — Investigador: Detectar modo

PERSONA: Investigator

Determiná el modo de operación ejecutando estos pasos en orden:

1. Ejecutá: `git status --short`
2. Ejecutá: `git diff HEAD --name-only`
3. Evaluá el resultado:

**Si hay archivos modificados en el diff** → **modo RETROACTIVO**
→ Para cada archivo modificado, leé `git diff HEAD -- <archivo>` y entendé qué proceso manual fue automatizado.
→ Registrá internamente: cuál era el proceso manual antes, qué lo dispara, qué produce, y qué fricción eliminó.

**Si no hay cambios Y `$ARGUMENTS` no está vacío** → **modo DESCRIPCIÓN**
→ Usá el texto de `$ARGUMENTS` como descripción base para el ticket.

**Si no hay cambios Y `$ARGUMENTS` está vacío** → **modo PROMPT**
→ Escribí exactamente esta línea y nada más:

"Describí brevemente la automatización para generar el ticket:"

→ STOP. No ejecutes Fase 2 ni Fase 3.

---

### Fase 2 — Artesano: Generar ticket

PERSONA: Artisan

Generá el ticket de Automatización completo. Este ticket se escribe desde el **punto de vista del desarrollador** — foco en cómo mejora el flujo de trabajo, reduce tareas manuales o previene errores.

**Nombre del ticket**
Antes del cuerpo, incluí:
`**Nombre:** [título breve que describe qué proceso se automatiza — sin tecnicismos]`

**Si modo RETROACTIVO**: encuadrá el ticket como si la automatización no existiera todavía.
Describí el proceso manual que existía antes como el "Estado Actual", y el flujo automatizado como la "Automatización Deseada".
- El "Estado Actual" describe la fricción y los pasos manuales que existían ANTES
- La "Automatización Deseada" describe el flujo como si fuera el objetivo a implementar
- Usá tiempo presente/futuro, no pasado ("el hook detecta", no "el hook detectó")

**Si modo DESCRIPCIÓN**: expandí el texto provisto en el template completo.

Usá **exactamente** este template, sin adiciones ni omisiones:

---

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

---

### Fase 3 — Ofrecer personas (solo si modo DESCRIPCIÓN)

Si el modo fue DESCRIPCIÓN, después del ticket agregá exactamente esto:

---

"¿Querés invocar las personas recomendadas para diseñar e implementar esta automatización?
Secuencia sugerida: `PERSONA: Inventor` → `PERSONA: Planner` → `PERSONA: Implementer`"
