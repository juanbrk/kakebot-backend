# Session Log

## 2026-09-21 – 2026-09-22: Modificar comprobante de impuesto — completo

### Completado
- Feature completa: botón "Modificar comprobante" en detalle de cuota pagada, limpieza GCS del archivo viejo, helper `extractGcsPath`. Refactor DRY post-QA. `/technician-check` + `/audit-pr` APPROVE.

### Pendiente
- Merge a main (a cargo de Juan). Borrar `scripts/seed-qa-replace-receipt.js` (tooling descartable).

## 2026-09-14 – 2026-09-21: Migrar parse_mode de Markdown a HTML + escaping de texto de usuario — completo

### Completado
- Migración completa de `parse_mode: "Markdown"` a `"HTML"` en 46 archivos (307 parse_mode, ~314 negrita, 7 itálica). Bug vivo de categorías resuelto (slug con `_` → lookup del nombre real).
- `escapeHtml()` en toda interpolación de texto de usuario en contexto HTML (~50 sitios directos + 5 chokepoints compartidos). `normalizeUserText()` + topes de largo en 8 entry points.
- Red de transporte: `isParseEntitiesError` + retry sin formatting en `replyOrEdit`/`editOrReply`. Hook advisory `check-escape-html.js`. Script de auditoría read-only.
- Split de `wizard-scenes.md` en referencia terse + rationale. QA 38/42 + 2 bugs corregidos. `/technician-check` + `/audit-pr` APPROVE.

### Pendiente
- Commit(s) y merge a main (a cargo de Juan).
- Correr `audit-html-chars.js` contra producción para detectar datos existentes con `& < >`.

## 2026-09-09 – 2026-09-12: Botón "Marcar como pagado" en el detalle de la tarjeta — completo

### Completado
- El detalle de una tarjeta ofrece "Marcar como pagado" cuando el resumen del mes en curso existe y
  sigue impago, disparando el mismo flujo de pago que ya existía desde el detalle del resumen. De
  paso, las dos pantallas de tarjetas arman el mes actual con el helper compartido.
- `/technician-check` (1 fix / 2 defer / 1 avoid) y `/audit-pr` (APPROVE; 3 menores, todos de
  registro) cerrados. Único cambio de comportamiento que salió de las revisiones: el botón bajó de
  la fila 1 a la 2 — pagar es irreversible y los resúmenes de tarjeta no tienen unmark, así que la
  fila donde el dedo va por costumbre queda para lo reversible.
- QA manual (14 casos + 1 de regresión) validada en botitio_testitoBot. Build + lint limpios
  (128 warnings = baseline).

### Pendiente
- Commit(s) y merge a main (a cargo de Juan) — feature y refactor del mes actual son cambios
  lógicamente separados, ver TICKET.md.

## 2026-09-07 – 2026-09-09: El resultado del mes incluye la venta de dólares — completo

### Completado
- El balance mensual deja de tratar la venta de USD como neutra: lo liquidado suma al "Resultado
  del mes" y se muestra en una sección propia entre INGRESOS y EGRESOS, para no confundirlo con
  ingreso nuevo; reemplaza la línea informativa que antes colgaba del resultado sin sumar. El
  total de Ingresos por moneda no cambió — el ingreso original en USD se cuenta una sola vez, en
  su mes. Revierte la parte "venta neutra" de la decisión del 2026-08-28/31.
- QA manual 9/9 en botitio_testitoBot; `/technician-check` y `/audit-pr` cerrados con APPROVE.
  Único hallazgo del audit: dos comentarios afirmaban que el piso de confiabilidad del TCM cubría
  toda lectura en dólares, y este cambio agrega justo la excepción — corregidos en el pase.
- Build + lint limpios (128 warnings = baseline) durante toda la rama.

### Pendiente
- Commit y merge a `main` — a cargo de Juan. Tres riesgos diferidos a tickets propios; el más
  pesado: `usd_sales` no tiene edición ni carga retroactiva, y ahora gobierna el resultado del mes.
- Ticket propio para `ticket-backfill.js`: su marcador acepta SHA de 7 a 40 chars pero compara
  contra `rev-parse --short`, así que un marcador de 40 lo hace resolver siempre en el mensaje
  siguiente y atribuir el trabajo a un commit que no lo contiene. Segunda vez que da una falsa
  atribución (ver 2026-09-04); acá se destapó al marcar M1 como commiteado sin estarlo.

## 2026-09-04: Arreglado el deploy de índices de Firestore en CI

### Completado
- El workflow de índices fallaba con un 403 al validar las reglas de Firestore, algo que ni siquiera
  necesitaba hacer. Ahora deploya con una config propia que no las menciona, sin tocar permisos de
  producción. Verificado: el deploy corre limpio y los 15 índices siguen `READY`.
- El workflow ahora también se dispara al tocar su propia config o `firebase.json`, del que esa
  config es copia: una config de CI rota sale a la luz en el próximo push a main y no meses
  después. No compara los dos archivos entre sí — eso pediría una assertion aparte.
- `/audit-pr` cerrado sin hallazgos sobre el fix. El único real fue de registro: dos entradas de
  memoria figuraban commiteadas sin estarlo, porque el hook de backfill resolvió su `PENDING-SHA`
  contra el commit siguiente sin chequear que ese commit tocara los archivos.

### Pendiente
- Commit y merge a `main` (a cargo de Juan). El merge ya dispara el workflow solo, así que alcanza
  con mirar que corra verde con las credenciales del CI.

## 2026-08-28 – 2026-09-03: Registro de venta de dólares y cierre bimonetario del balance — completo

### Completado
- Comando `/ventausd` (WizardScene, monto → cotización con guard de plausibilidad → confirmación), colección propia `usd_sales`, índice compuesto deployado y `READY` en prod.
- Sección "VENTA DE USD" en el detalle del reporte mensual, con cotización promedio ponderada (TCM = Σ ARS/Σ USD); neutral para el balance.
- Balance bimonetario: INGRESOS, EGRESOS y Resultado del mes muestran cada uno su propio sufijo en USD (TCM + monto nativo, concatenados vía `buildUsdSuffix`); `tarjetasPendingUSD` renombrado a `tarjetasTotalUSD`.
- `/technician-check` y `/audit-pr` (2 corridas) cerrados con APPROVE: hallazgos corregidos (incluido el signo del sufijo, que imprimía `+ U$S -800,00`) o diferidos con rationale en `TICKET.md`.
- Build + lint limpios en toda la rama (0 errores, 128 warnings = baseline).

### Pendiente
- Ninguno de bloqueante — merge a `main` a cargo de Juan.

## 2026-08-26: Ingresos agrupados por motivo en el reporte mensual

### Completado
- La sección INGRESOS del reporte mensual muestra una sola línea por motivo con el total acumulado, en vez de un renglón por ingreso registrado. Motivos con distinta capitalización o espacios sobrantes se unifican, y ARS y USD nunca se suman entre sí.
- Corregido un hallazgo de `technician-check` (T1): en meses cargados retroactivamente, el motivo mostrado por grupo ahora respeta el orden real de registro en vez del desempate de Firestore por doc ID. QA validada en botitio_testitoBot, mes actual y retroactivo.
- `/audit-pr` cerrado con APPROVE — sin bloqueantes ni mayores. Único cambio aplicado: renombrar la función de agrupamiento para que el nombre cargue la moneda, que forma parte de la clave pero solo figuraba en el JSDoc.

### Pendiente
- Commit a cargo de Juan.

## 2026-08-24: Registro de ingreso en dólares — moneda ARS/USD en wizard, header dual en reporte, sin backfill de producción
## 2026-08-21: Reporte "Estado de impuestos" — submenú propio en Reportes, agrupamiento compartido con Estado de servicios vía `buildStatusReportText`
## 2026-08-05: Registrar resumen de tarjeta enviando PDF al bot — opción "Resumen" en doc-router, escena liviana nueva
## 2026-08-01: Eliminado `buildTaxMonthKeyboard` (código muerto) — no se renombra `buildFilteredTaxMonthKeyboard`
## 2026-07-31: Convención TICKET.md instalada — hooks `ticket-check.js` y `ticket-backfill.js`, `commit-dream-check.js` migrado a UserPromptSubmit
## 2026-07-29: "Estado de servicios" — reporte nuevo en Reportes → Servicios, solo lectura, agrupado por estado de pago de cuota del mes
## 2026-07-29: Listado de entidades en submenús raíz de Impuestos/Servicios/Tarjetas — helper `buildNameListText`, eliminadas pantallas "Mis impuestos"/"Mis servicios"
## 2026-07-29: DRY en keyboards de impuesto paginados + merge de main (PR #72) y QA post-merge (33 casos)
## 2026-07-27: Comprobantes de impuesto desde envío directo de archivo — paso Servicios/Impuestos en doc-router, escena `tax-receipt.scene.ts`
## 2026-07-23: Desmarcar cuota de impuesto pagada — patrón "unmark", borrado en GCS, sub-flujo Conservar/Borrar dentro de WizardScene
## 2026-07-23: Cierre del ticket session-state-handler-guard — obsoleto tras migración a WizardScene
## 2026-07-23: Auditoría post-QA — fix de `editOrReply` fallback, `replyOrEdit` deja de tragar en silencio, docs de deploy corregidas
## 2026-07-16: Unificación de 88 edits cosméticos bajo `replyOrEdit` + hook `check-raw-edit-message.js` — regla de tres vías cerrada
## 2026-07-15: Helper `editOrReply` (write-then-edit, 16 sitios) + eliminación del subsistema de cuota duplicada (código inalcanzable)
## 2026-07-12/13: Botón "Marcar como pagado" en submenú de impuesto + fix validación comprobante entrando a la escena
## 2026-07-10–11: Vencimiento por cuota de impuesto — eliminado `estimatedDueDay`, edición por cuota, `formatDueDateDayMonth`, sección IMPUESTOS del reporte con sufijo de vencimiento
## 2026-07-08: Documentar patrón de archivo como input primario en WizardScenes (§7.3)
## 2026-07-06: Ordenar Métodos de Pago por vencimiento ascendente — helper `sortByDueDateAscending`
## 2026-07-05: Estado vacío en submenú de Impuestos — `buildTaxesEmptyStateKeyboard`
## 2026-07-03: Editar mensajes al marcar resumen de tarjeta como pagado — cumplir "nunca dos mensajes con botones activos"
## 2026-07-03: Sección "Vencen hoy" en Próximos Vencimientos — buckets robustos, `buildDueDate` anclado a mediodía UTC
## 2026-07-02: Omitir prompt de comprobante si cuota ya tiene `receiptUrl` — retorno al origen por entry point
## 2026-06-16: Mostrar USD en Próximos Vencimientos y balance de Egresos
## 2026-06-12–14: Migración completa a WizardScene (9 dominios) + fix pipeline de deploy (Node 22, WIF keyless, Gen 1)
## 2026-06-02: Consolidación de memoria (/mem-consolidate) — 15 sesiones colapsadas, tipos actualizados
## 2026-05-25: POC WizardScene + migración masiva — 9 flujos migrados de sesión Firestore a `Scenes.WizardScene`, session.service.ts eliminado, ~30 campos legacy removidos
## 2026-05-21: Recordatorio percepción RG 5617 al pagar resumen en USD
## 2026-05-21: Bug fix — Selector de mes filtra cuotas existentes (servicios e impuestos)
## 2026-05-18: Sección TARJETAS completa en reporte mensual — montos ARS/USD, TCV, desglose en balance
## 2026-05-04: Pulido UX del flujo de pago multicurrency — prompts TCV simplificados

## Collapsed Sessions (older)

## 2026-04-29: UX de pago multicurrency en resúmenes de tarjeta (Commit 2b) — Flujo completo con selección moneda ARS/USD, TCV, handlers de skip/upload y buildPaymentSummaryText
## 2026-04-28: Comprobantes multicurrency en resúmenes de tarjeta (Commit 1) — Schema CardStatement migrado a receiptUrlARS/receiptUrlUSD/exchangeRate; nuevos keyboards y handlers
## 2026-04-27: Ordenamiento cronológico en historial de cuotas — getInstallmentsByService corregido a sort ascendente; JSDoc corregido en tax.ts
## 2026-04-19: Automatización de creación de worktrees (/worktree) — Script new-worktree.sh + skill /worktree; crea worktree con npm install, .env copiado y emulator-data
## 2026-04-19: Logging estructurado con firebase-functions/logger — Módulo helpers/logger.ts; 16 console.error reemplazados en 8 archivos; AttachInvoiceParams/AttachReceiptParams en handlers.types.ts
## 2026-04-18: Bug fix — Parsing de decimales con punto en ingreso de montos — parseArgentineAmount() corregido; AMOUNT_PATTERN reescrito con 3 alternativas; regla documentada en conventions.md
## 2026-04-17: Reporte Métodos de Pago + reestructuración del menú Reportes — Nuevo payment-method-report.ts; menú con submenúes Balances/Pagos/Servicios; reports-menu.md creado
## 2026-04-16: Método de pago en impuestos — Campo paymentMethod en Tax; flujo de registro y edición; método visible en reporte mensual
## 2026-04-16: Comandos de generación de tickets — 4 comandos /feature, /bug, /improvement, /automatizacion con detección retroactivo/descripción/prompt
## 2026-04-15: Mejora — Listado de servicios agrupado en secciones por estado — 5 secciones (Vencidos/Próximos/Pagados/Pendientes/Sin cuota); optimizado con getInstallmentsForMonth
## 2026-04-15: Bug fix — Telegraf callback handlers UX en tax.ts — 5 handlers corregidos al patrón editMessageText-first; patrón edit-before-reply establecido en decisions.md
## 2026-04-14: Hooks PostToolUse — Migración a stderr — 3 hooks migrados de console.log a process.stderr.write; stderr no capturado aún por Claude Code
## 2026-04-13: Tarjetas en Próximos Vencimientos — CardStatement integrado en getUpcomingDues; nuevo índice card_statements; getUpcomingUnpaidCardStatements implementado
## 2026-04-09: Feature Próximos Vencimientos — implementación completa — Tipos, servicio y handler; buckets 0-3/4-5/6-7 días con prefijos [Svc]/[Imp]/[TC]
## 2026-04-07: Feature Impuestos — implementación completa — Dominio completo: tipos, servicio, keyboards, handlers; sección IMPUESTOS en reporte mensual
## 2026-04-03: File upload bug fix + Automated secrets sync — Fixed GCS_BUCKET value, implemented .pending-secrets registry + go.sh sync integration
## 2026-03-06: Fase 3b — Recepción de comprobante como mensaje directo — Direct photo/PDF receipt flow with service selection, payment marking, and attachment
## 2026-03-06: Testing Fase 2 (Storage + Comprobantes) — Validated receipt upload end-to-end; fixed emulator startup (use only `npm run dev`)
## 2026-03-06: Estado de pago (Fase 1) + Comprobantes (Fase 2) — Added isPaid/paidAt to installments, receipt upload via GCS, photo handler, post-payment attachment flow
## 2026-03-04: Guard conditions pattern + service flow optimization — Created guard-conditions.md, reordered service flow to Mes/Dia/Monto, improved keyboard layouts
## 2026-03-03: Modularization of telegram.ts — Refactored 1267-line monolith into modular architecture with handlers/, services/, helpers/, centralized auth
## 2026-03-03: Bug fix + UI preferences + partial input — Fixed handler registration order, added button ordering convention, implemented partial expense input
## 2026-03-03: Interactive category assignment feature — Full /categorizar flow with inline keyboards, pagination, new category creation, batch expense updates
## 2026-03-02: Bot access control implementation — Implemented isAuthorizedUser() with process.env.AUTHORIZED_USER_ID, silent ignore for unauthorized users
## 2026-03-02: Code quality and documentation standards — Refactored variable naming, extracted constants/helpers, established code-docs and ticket format rules
## 2026-03-01: Initial setup and expense registration — Created bot skeleton, expense parsing, Firestore storage, monthly report, dev environment, composite indexes
