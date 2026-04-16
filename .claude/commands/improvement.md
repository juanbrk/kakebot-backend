# Improvement Ticket

Genera un ticket de tipo **Mejora** a partir del contexto de la sesión actual.

---

## Ejecución

### Fase 1 — Investigador: Detectar modo

PERSONA: Investigator

Determiná el modo de operación ejecutando estos pasos en orden:

1. Ejecutá: `git status --short`
2. Ejecutá: `git diff HEAD --name-only`
3. Evaluá el resultado:

**Si hay archivos modificados en el diff** → **modo RETROACTIVO**
→ Para cada archivo modificado, leé `git diff HEAD -- <archivo>` y entendé qué se mejoró.
→ Registrá internamente: cómo funcionaba antes y cómo funciona ahora, desde la perspectiva del usuario.

**Si no hay cambios Y `$ARGUMENTS` no está vacío** → **modo DESCRIPCIÓN**
→ Usá el texto de `$ARGUMENTS` como descripción base para el ticket.

**Si no hay cambios Y `$ARGUMENTS` está vacío** → **modo PROMPT**
→ Escribí exactamente esta línea y nada más:

"Describí brevemente la mejora para generar el ticket:"

→ STOP. No ejecutes Fase 2 ni Fase 3.

---

### Fase 2 — Artesano: Generar ticket

PERSONA: Artisan

Generá el ticket de Mejora completo.

**Nombre del ticket**
Antes del cuerpo, incluí:
`**Nombre:** [título breve que describe el cambio de comportamiento — sin tecnicismos]`

**Si modo RETROACTIVO**: encuadrá el ticket como si la mejora no hubiera sido implementada todavía.
Describí la situación previa al cambio como el estado actual, y la situación post-cambio como el estado deseado.
- La "Situación Actual" describe cómo funcionaba ANTES del cambio
- La "Situación Deseada" describe cómo debería funcionar (lo que ya fue implementado, pero presentado como objetivo)
- Usá tiempo presente en ambas secciones

**Si modo DESCRIPCIÓN**: expandí el texto provisto en el template completo.

Usá **exactamente** este template, sin adiciones ni omisiones:

---

## Historia de Usuario

[Desde el punto de vista del usuario involucrado. Objetivo claro y sin tecnicismos.
Formato recomendado: "Como [rol], quiero [mejora], para [beneficio]."]

## Situación Actual

[Describí cómo funciona hoy la funcionalidad que se va a mejorar.]

## Situación Deseada

[Describí cómo debería funcionar, basado en la situación actual y el resultado esperado.]

## Criterios de Aceptación

[Lista de condiciones que deben cumplirse para considerar la mejora completa.
Cada ítem comienza con un verbo en infinitivo.]

---

### Fase 3 — Ofrecer personas (solo si modo DESCRIPCIÓN)

Si el modo fue DESCRIPCIÓN, después del ticket agregá exactamente esto:

---

"¿Querés invocar las personas recomendadas para analizar e implementar esta mejora?
Secuencia sugerida: `PERSONA: Investigator` → `PERSONA: Artisan` → `PERSONA: Implementer`"
