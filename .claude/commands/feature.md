# Feature Ticket

Genera un ticket de tipo **Feature** a partir del contexto de la sesión actual.

---

## Ejecución

### Fase 1 — Investigador: Detectar modo

PERSONA: Investigator

Determiná el modo de operación ejecutando estos pasos en orden:

1. Ejecutá: `git status --short`
2. Ejecutá: `git diff HEAD --name-only`
3. Evaluá el resultado:

**Si hay archivos modificados en el diff** → **modo RETROACTIVO**
→ Para cada archivo modificado, leé `git diff HEAD -- <archivo>` y entendé qué se implementó.
→ Registrá internamente: qué funcionalidad nueva fue agregada, desde el punto de vista del usuario.

**Si no hay cambios Y `$ARGUMENTS` no está vacío** → **modo DESCRIPCIÓN**
→ Usá el texto de `$ARGUMENTS` como descripción base para el ticket.

**Si no hay cambios Y `$ARGUMENTS` está vacío** → **modo PROMPT**
→ Escribí exactamente esta línea y nada más:

"Describí brevemente la feature para generar el ticket:"

→ STOP. No ejecutes Fase 2 ni Fase 3.

---

### Fase 2 — Artesano: Generar ticket

PERSONA: Artisan

Generá el ticket de Feature completo.

**Nombre del ticket**
Antes del cuerpo, incluí:
`**Nombre:** [título breve, accionable, sin tecnicismos — describe la capacidad nueva]`

**Si modo RETROACTIVO**: encuadrá el ticket como si los cambios no existieran todavía.
Escribí desde la perspectiva de alguien que está pidiendo la funcionalidad, no reportando lo que se hizo.
- Usá tiempo presente/futuro ("quiero poder", "debe mostrar"), no pasado ("se implementó", "se agregó")
- Describí la necesidad del usuario, no los archivos o funciones modificadas

**Si modo DESCRIPCIÓN**: expandí el texto provisto en el template completo.

Usá **exactamente** este template, sin adiciones ni omisiones:

---

## Historia de Usuario

[Describí desde el punto de vista del usuario qué quiere lograr y qué esperaría que ocurra.
Breve, sin tecnicismos. Formato: "Como [rol], quiero [acción], para [beneficio]."]

## Criterios de Aceptación

[Lista de condiciones que deben cumplirse para considerar la feature implementada.
Cada ítem comienza con un verbo en infinitivo: "Poder hacer X", "Ver Y cuando Z".]

## Aspectos Técnicos | Reglas

[Solo si aplica. Criterios desde perspectiva técnica, de negocio o del dominio.
Si no hay nada relevante, omitir esta sección.]

## Sugerencias UX

[Flujo del usuario paso a paso, componentes involucrados, feedback visual esperado.]

---

### Fase 3 — Ofrecer personas (solo si modo DESCRIPCIÓN)

Si el modo fue DESCRIPCIÓN, después del ticket agregá exactamente esto:

---

"¿Querés invocar las personas recomendadas para planificar e implementar este ticket?
Secuencia sugerida: `PERSONA: Planner` → `PERSONA: Artisan` → `PERSONA: Implementer`"
