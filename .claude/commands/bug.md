# Bug Ticket

Genera un ticket de tipo **Bug** a partir del contexto de la sesión actual.

---

## Ejecución

### Fase 1 — Investigador: Detectar modo

PERSONA: Investigator

Determiná el modo de operación ejecutando estos pasos en orden:

1. Ejecutá: `git status --short`
2. Ejecutá: `git diff HEAD --name-only`
3. Evaluá el resultado:

**Si hay archivos modificados en el diff** → **modo RETROACTIVO**
→ Para cada archivo modificado, leé `git diff HEAD -- <archivo>` y entendé qué se corrigió.
→ Registrá internamente: cuál era el comportamiento incorrecto antes del fix, y cuál debería ser el comportamiento correcto.

**Si no hay cambios Y `$ARGUMENTS` no está vacío** → **modo DESCRIPCIÓN**
→ Usá el texto de `$ARGUMENTS` como descripción base para el ticket.

**Si no hay cambios Y `$ARGUMENTS` está vacío** → **modo PROMPT**
→ Escribí exactamente esta línea y nada más:

"Describí brevemente el bug para generar el ticket:"

→ STOP. No ejecutes Fase 2 ni Fase 3.

---

### Fase 2 — Artesano: Generar ticket

PERSONA: Artisan

Generá el ticket de Bug completo.

**Nombre del ticket**
Antes del cuerpo, incluí:
`**Nombre:** [título breve que describe el comportamiento incorrecto — sin tecnicismos]`

**Si modo RETROACTIVO**: encuadrá el ticket como si el bug no hubiera sido corregido todavía.
Describí el problema tal como existía antes del fix, no lo que se hizo para resolverlo.
- Usá tiempo presente ("sucede", "muestra", "falla"), no pasado ("se corrigió", "se arregló")
- Describí el comportamiento incorrecto desde la perspectiva del usuario, no los cambios de código
- Los "Pasos para replicar" deben reproducir el bug original, no el estado actual del código

**Si modo DESCRIPCIÓN**: expandí el texto provisto en el template completo.

Usá **exactamente** este template, sin adiciones ni omisiones:

---

## Comportamiento Actual

[Describí la situación actual y cómo está funcionando la funcionalidad incorrectamente.]

Pasos para replicar:
1. ...
2. ...
3. ...

## Comportamiento Deseado

[¿Qué debería pasar en lugar de lo que sucede? Basado en el comportamiento actual y el esperado.]

## Aspectos Técnicos

[Solo si aplica. Criterios de aceptación desde el punto de vista técnico.
Si no hay nada relevante, omitir esta sección.]

---

### Fase 3 — Ofrecer personas (solo si modo DESCRIPCIÓN)

Si el modo fue DESCRIPCIÓN, después del ticket agregá exactamente esto:

---

"¿Querés invocar las personas recomendadas para investigar e implementar este fix?
Secuencia sugerida: `PERSONA: Investigator` → `PERSONA: Implementer`"
