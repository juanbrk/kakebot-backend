# Decisions Log

## 2026-07-16: Regla de tres vías para ediciones de mensaje — `ctx.editMessageText` pelado prohibido en handlers y scenes

- **Decisión**: los 88 edits cosméticos restantes (15 archivos en `bot/handlers/` y `bot/scenes/`) migrados a `replyOrEdit`; regla de tres vías cerrada: write-then-edit → `editOrReply`; edit cosmético en callback → `replyOrEdit`; `ctx.editMessageText` pelado → prohibido. Exploración previa confirmó 88/88 cosméticos (cero write-then-edit pendientes).
- **Enforcement**: nuevo hook PreToolUse `check-raw-edit-message.js` bloquea `.editMessageText(` en `bot/handlers/` y `bot/scenes/`. Registrado en `settings.json` + `settings.example.json` + `hooks-error-log.md`.
- **Docs**: `wizard-scenes.md §9` reescrito (tabla de tres vías; §9.2 ya no prescribe el edit pelado; §9.3 documenta la semántica traga-todo de `replyOrEdit`; checklist §16 y tabla §12 actualizados); `conventions.md` (tabla de helpers, regla de tres vías, ejemplo Breadcrumb).
- **Excepción única**: loop de categorización (`services/category.service.ts`, `ctx.telegram.editMessageText` low-level por `chatId`/`messageId`, corre sin callback) — fuera de los paths guardeados.
- **Cambio de comportamiento deliberado** en `invoice.scene.ts`: un edit de progreso fallido ya no aborta el upload (antes el throw caía al catch del handler antes de subir el archivo).
- **Fuera de scope (candidato /techdebt)**: 3 paths write→`replyOrEdit` vía helpers de render compartidos con callers read-only (`service.ts` `showInstallmentDetail`/`showServiceActionView`, `tax.ts` `showTaxActionView`).

## 2026-07-15: Helper `editOrReply` (write-then-edit) + eliminación del subsistema de "cuota duplicada" (código inalcanzable)

- **Decisión**: nuevo helper `editOrReply` (superset resiliente de `replyOrEdit`, intacto) aplicado a los 16 sitios donde un write se confirma editando un mensaje, para que un fallo de edición no aborte el flujo tras persistir el dato. Los ~91 edits cosméticos restantes no se migran (sin write previo, ya cubierto por `wizard-scenes.md §9.4`).
- **Decisión**: se elimina por completo el subsistema de "cuota duplicada" en `service.scene.ts` (`if (existing)` en `stepHandleAmount`, `handleSkipDuplicate`, `handleReplaceDuplicate`, `buildDuplicateKeyboard`, `replaceInstallment`, campo `partialAmount` de `ServiceWizardState`) — investigación confirmó que es código inalcanzable: todo entry point al flujo `installment` ya filtra meses con cuota existente desde la decisión del 2026-05-21, así que `stepHandleAmount` nunca recibe un `selectedMonth` con cuota previa.
- **Motivo**: la auditoría de edits cosméticos encontró un caso oculto de bug (reemplazo de cuota duplicada) y lo arregló primero (commit `d89134a`); una investigación posterior determinó que la rama arreglada nunca se ejecuta en producción, por lo que el fix quedó superado por la eliminación completa (commit `b4a16c6`). El fix inicial no era incorrecto, solo innecesario.
- **No se toca**: `getInstallment` (`service.service.ts`) — sigue en uso por `invoice.scene.ts` y `handlers/service.ts`.
- **Aside**: el loop de categorización queda afuera del helper `editOrReply` (usa `ctx.telegram.editMessageText` de bajo nivel, incompatible) — follow-up en `/techdebt`.
- **Aplicado en**: `helpers/telegram.ts`, `bot/scenes/service.scene.ts`, `bot/keyboards/service.ts`, `services/service.service.ts`, `types/telegraf-context.types.ts`. Build + lint limpios en ambos cambios.

## 2026-07-13: "Marcar como pagado" de impuesto entra a la escena para validar el comprobante

- **Decisión**: `handleMarkAsPaid` (`tax.ts`), compartido por el botón directo del submenú y por Historial de cuotas, ahora entra a `TAX_SCENE_ID` al mostrar el prompt Omitir/Adjuntar en vez de un `ctx.reply()` suelto.
- **Motivo**: sin escena activa, texto libre en esa ventana caía en el parser global de gastos. Mismo patrón ya usado por `handleAttachReceipt` (`wizard-scenes.md §10.3`).

## 2026-07-11: Vencimiento por cuota reemplaza el "día estimado" del impuesto; reportes validados

- **Decisión**: se elimina `estimatedDueDay` de `Tax`; "Cambiar vencimiento" pasa al detalle de cada cuota (`tax_edit_due:{installmentId}`) y edita su propio `dueDate`, validado contra su mes. El detalle del impuesto y la sección IMPUESTOS del reporte mensual ahora muestran ese vencimiento por cuota, igual que SERVICIOS/TARJETAS.
- **Motivo**: mantener `estimatedDueDay` como referencia aparte (decisión 07-10) resultó redundante una vez que cada cuota pide su propio día; una investigación (`PERSONA: Investigator`) confirmó además que los reportes ya usaban `dueDate` por cuota, no el campo eliminado, y que solo faltaba mostrarlo en el reporte mensual.
- **Aplicado en**: `tax.scene.ts` (`stepHandleEditInstallmentDueDay` reemplaza `stepHandleEditDueDay`), `tax.service.ts` (`updateTaxInstallmentDueDay` reemplaza `updateTaxEstimatedDueDay`), `keyboards/tax.ts` (`buildTaxInstallmentDetailKeyboard`; nuevo helper compartido `formatDueDateDayMonth` en `helpers/format.ts`), `handlers/tax.ts` (`handleEditInstallmentDueDay` reemplaza `handleChangeDueDay`; `showTaxActionView` agrega línea de vencimiento), `report.service.ts` (sección IMPUESTOS agrega sufijo `(vence dd/mm)`/`(Pagado) ✅`).

## 2026-07-10: Día de vencimiento por cuota y edición de vencimiento estimado del impuesto

- **Decisión**: al registrar una cuota de impuesto, el día de vencimiento se pide explícitamente al usuario (Mes → Monto → Día → ¿Pagada?) en vez de heredar `estimatedDueDay` del impuesto capado al mes. El `estimatedDueDay` del impuesto ahora solo sirve de referencia inicial, editable por separado.
- **Motivo**: cada cuota puede vencer un día distinto al estimado (ej. feriados, cambios de fecha del organismo); forzar el `estimatedDueDay` original perdía esa flexibilidad.
- **Decisión**: la edición de `estimatedDueDay` es una nueva ruta de entrada al `tax.scene.ts` (texto libre 1-31), espejando el patrón `edit_day` ya usado en `service.scene.ts`, en vez de un flujo dedicado nuevo.
- **Aplicado en**: `tax.scene.ts` (`stepHandleInstallmentDueDay`, `stepHandleEditDueDay`), `tax.service.ts` (`updateTaxEstimatedDueDay`), `handlers/tax.ts` (`handleChangeDueDay`).

## 2026-07-03: Marcar resumen de tarjeta como pagado edita mensajes en lugar de crear nuevos

- **Decisión**: en el flujo de pago de resumen (`card-stmt.scene.ts` `stepInit` case `pay`), la confirmación y la pregunta de moneda editan el mensaje de opciones original (`ctx.editMessageText`, no reply nuevo). En la rama USD se edita primero a un contexto sin botones ("Estás por marcar como pagado el resumen · _mes · tarjeta_") y luego un `ctx.reply` nuevo lleva la pregunta de moneda + teclado; "Adjuntar" separa contexto (edita) e instrucciones (reply).
- **Motivo**: cumplir "nunca dos mensajes con botones activos"; espeja `service.ts` `handleMarkAsPaid`. Caso 1 (solo ARS) sin cambios.
- **Aplicado en**: `card.ts` (`handleMarkStatementAsPaid`: eliminado pre-edit) + `card-stmt.scene.ts` (`stepInit` case `pay` ARS/USD, `handlePayAttachARS`/`handlePayAttachUSD`).
## 2026-07-03: Vencimientos de hoy — buckets robustos y fechas ancladas a mediodía UTC

Los buckets de Próximos Vencimientos pasaron a ser ventanas de día contiguas (en vez de igualdad exacta a medianoche), para tolerar cualquier hora del día. Las fechas de vencimiento (servicio/impuesto/tarjeta) ahora se construyen con un helper `buildDueDate` anclado a mediodía UTC en vez de medianoche implícita del proceso, para que el día mostrado no dependa del huso horario del servidor. Aparte, se renombraron dos funciones internas (`showInstallmentDetailInScene`, `attachFile`) por exigencia de naming del hook de scenes.

## 2026-07-02: Sección "Vencen hoy" separada en lugar de fold-in al bucket "Próximos 3 días"

Las cuotas con `dueDate` de hoy se muestran en una sección dedicada "Vencen hoy" (bucket con límite inferior inclusivo) en vez de sumarse al bucket "Próximos 3 días" como pedía el TICKET.md original, por preferencia explícita del usuario de distinguir visualmente lo urgente. Aplicado en `groupIntoBuckets`/`BUCKETS` (`services/upcoming-dues.service.ts`); solo el primer bucket usa límite inclusivo para no duplicar ítems.

## 2026-07-02: Omitir comprobante ya adjunto al marcar cuota como pagada — retorno al origen, no a un destino único

- **Decisión**: si la cuota ya tiene `receiptUrl`, se omite la escena de comprobante y cada entry point vuelve a su propia pantalla de origen (`svc_pay` → detalle de la cuota vía `showInstallmentDetail`; `svc_pay_from` → menú de acciones del servicio vía `showServiceActionView`), en vez de forzar ambos a un único "menú de servicio" genérico como sugería el ticket original.
- **Motivo**: cada botón vive en una vista distinta; devolver al usuario a su origen es más consistente con la UX existente (patrón ya usado en `handleBackToServiceAction`) y evita perder contexto de navegación.
- **Aplicado en**: `handleMarkAsPaid` y `handleMarkAsPaidFromService` (`bot/handlers/service.ts`). TICKET.md actualizado para reflejar esta implementación real.

## 2026-06-14: Firebase CI/CD auth — WIF keyless en lugar de JSON key

- **Decisión**: Usar Workload Identity Federation (WIF) con `google-github-actions/auth@v2` en lugar de JSON service account key almacenado en GitHub Secrets.
- **Motivo**: WIF emite credenciales efímeras por job (minutos de vida); el JSON key es permanente hasta rotarlo manualmente, con mayor riesgo de exfiltración. Google lo recomienda explícitamente como alternativa a `FIREBASE_TOKEN` y al JSON key approach.
- **Aplicado en**: `deploy-functions.yml` y `deploy-indexes.yml` — parámetro `workload_identity_provider` + `service_account`. Pool ID `githuhb-actions`, provider ID `github-actions-oidc`, SA `firebase-adminsdk-fbsvc@kakebot-972c2.iam.gserviceaccount.com`. Project number: `603370624252`.
- **Update**: provider path almacenado como secret `WIF_PROVIDER` — valor completo: `projects/603370624252/locations/global/workloadIdentityPools/githuhb-actions/providers/github-actions-oidc`. IAM binding `roles/iam.workloadIdentityUser` agregado al SA manualmente vía gcloud.

## 2026-06-04: WizardScene §10.3 — escena no debe hacer leave() con teclado activo

- **Regla**: si el último output de un step o action handler es un teclado inline (o prompt de archivo que espera foto), el scene debe permanecer activo (`selectStep(GUARD_STEP)` o entrando al scene desde afuera). Llamar `scene.leave()` antes de recibir la respuesta del usuario hace que el próximo input caiga al handler global.
- **Aplicado en**: `service.scene.ts` — `handleMarkAsPaid`/`handleMarkAsPaidFromService` entran al scene directamente en lugar de mostrar el prompt de comprobante suelto y salir.
- **Documentado en**: `shared/wizard-scenes.md §10.3` (commit 4a)

## 2026-05-29: Oleada B (factura + comprobante + categorización) — diagnóstico y decisiones de diseño

Investigación previa a la migración de la oleada más grande. Hallazgos y decisiones:

### Decisiones tomadas
- **invoice + comprobante = UNA escena (`invoice.scene.ts`) con dos rutas** vía `entryArgs { flow: "invoice" | "receipt" }`. Son código gemelo (picker → mes → día → monto → adjuntar; comprobante además marca cuota pagada). `stepInit` ramifica según `flow` y según si hay servicios. Cumple literalmente el ticket.
- **Categorización SÍ se migra a WizardScene**, pese a que el modelo de cursor casi no aplica (es un loop con edición in-place de un único mensaje, no pasos lineales). Será ~2 steps con la lógica en `scene.action` + un text-guard. Es el punto más frágil de la oleada.

### Hechos verificados (trazado de consumidores)
- `pendingFileId`/`pendingFileType` solo los consumen el bridge (`doc-router.scene`), `invoice.ts`, `receipt-direct.ts` y `photo.ts` (los 4 dentro de la oleada) → **eliminables al terminar**. `isNewService` y `attach*ToInstallment` ídem (solo `text.ts` + sus archivos).
- **RIESGO CRÍTICO**: `getMonthLabel` se exporta desde `invoice.ts:198` y lo importa `service.ts:45`. Borrar `invoice.ts` rompe `service.ts`. **Mover `getMonthLabel` a `helpers/format.ts` ANTES de borrar el handler.**
- Categorización está totalmente desacoplada del bridge (se entra por `/categorizar` y `menu_categorizar`, nunca por foto). Eliminar `pendingFile*` no depende de ella → su migración es ortogonal a invoice/comp.
- Bug preexistente: `invoice_awaiting_service/month` y `comp_awaiting_service/month` no tienen text-guard en `text.ts`; escribir durante esos teclados cae al parser de gastos. La migración a `stepGuardX` lo corrige.
- Categorización depende de 8 campos de `Session` exclusivos (`pendingDescs`, `currentDesc`, `currentDisplayName`, `currentTotalAmount`, `currentPage`, `messageId`, `chatId`, `sessionExpenses`); `finishCategorizingFlow` re-consulta Firestore al terminar para reiniciar el loop.
- Sub-types a eliminar al final (orden del reglamento §16): `InvoiceSessionState`, `ReceiptSessionState`, `CategorySessionState`.

## 2026-05-28: Reglamento de WizardScenes — estandarización para migración masiva

Reglamento dedicado en `shared/wizard-scenes.md` + hook estructural `check-wizard-scene.js`. Establece el estándar único para crear y migrar `Scenes.WizardScene` de Telegraf, antes de iniciar las migraciones masivas de los 9 flujos pendientes (servicios, tarjetas, facturas, comprobantes, gastos, bulk, categorización, doc router, reporte retroactivo).

### Decisiones tomadas
- **Gold standard estructural**: `tax.scene.ts` es el baseline (logging, cursor guards explícitos, multi-entry con `entryArgs`, naming con prefijo `step*`/`handle*`). `income.scene.ts` quedó como deuda técnica → refactorizado en esta misma sesión para cumplir.
- **Naming de steps**: prefijo `step*` obligatorio (`stepInit`, `stepHandleX`, `stepGuardX`). Action handlers: `handle*`. Esto distingue visualmente roles dentro del archivo.
- **Cursor guards en función separada**: cada step que termina mostrando teclado tiene un `stepGuardX` dedicado a continuación. Prohibido el patrón inline `if (state.field) { reprompt; return; }` (deuda técnica de income.scene corregida).
- **Breadcrumbs prohibidos dentro de steps del scene**: una vez que el usuario entra al wizard, ya se comprometió al flujo; mostrar la jerarquía en cada paso es ruido visual sin valor de navegación. Breadcrumbs son para árboles de decisión antes del commit, no dentro de él.
- **Excepción permitida**: el handler externo que invoca `ctx.scene.enter(...)` puede usar `editMessageText` con breadcrumb + mensaje de contexto justo antes de entrar (cierre del menú + apertura del flujo). Aplicado en `handleAddTax`, `handleRegisterInstallment`.
- **Enforcement**: hook PreToolUse `check-wizard-scene.js` valida estructura mínima (imports obligatorios, SCENE_ID exportado con sufijo `-wizard`, CANCEL_REGEX canónico, scene.hears/on registrados, repromptCurrentStep presente, naming de async functions). Lo semántico (logging en catches, breadcrumbs internos, parse_mode con asteriscos) queda al checklist humano del reglamento.
- **Ubicación del reglamento**: archivo dedicado `shared/wizard-scenes.md` (no expansion de conventions.md). 3 secciones legacy de WizardScene removidas de conventions.md y reemplazadas por puntero.
- **Orden de migración masiva**: validar primero (refactor income + cleanup tax = esta sesión) → simples (expense, bulk, doc-router) → medios (invoice, receipt-direct, categorize) → complejos (service, card-create, card-stmt). Cada PR por dominio, con build + lint + deploy a botitio_testitoBot + verificación manual.
- **`scene.leave()` ordering**: mensaje final ANTES de `leave()` en salida normal. Excepción permitida en validación de state corrupto (ambos órdenes aceptables si es consistente dentro del scene).
- **Try/catch + logging estructurado**: obligatorio en operaciones I/O. `log.error(message, error, { module: "[domain].scene", userId })`. El catch no llama `leave()` para permitir reintento.

### Archivos creados/modificados
- **NUEVO**: `.claude/rules/shared/wizard-scenes.md` (16 secciones + checklist pre-PR)
- **NUEVO**: `.claude/hooks/check-wizard-scene.js` (8 chequeos estructurales)
- **EDIT**: `.claude/rules/shared/conventions.md` (puntero a wizard-scenes.md)
- **EDIT**: `CLAUDE.md` (fila en tabla de rules)
- **EDIT**: `.claude/settings.json` + `.claude/settings.example.json` (registro del hook)
- **EDIT**: `.claude/hooks-error-log.md` (documentación del hook)
- **REFACTOR**: `functions/src/bot/scenes/income.scene.ts` (step naming + stepGuardConfirm extraído + logging + leave ordering)
- **CLEANUP**: `functions/src/bot/scenes/tax.scene.ts` (removidos 5 breadcrumbs internos + import sin uso + duplicación de mensaje en stepInit)
- **EDIT**: `functions/src/bot/handlers/tax.ts` (breadcrumb pre-scene agregado a `handleAddTax`)

---

## 2026-05-27: WizardScene — Mensaje de contexto pre-escena y selector de mes integrado

- **Decisión**: El mensaje de contexto de entrada ("Vas a registrar una nueva cuota para...") se muestra desde el handler global (antes de `scene.enter`), no desde `stepInit`
- **Motivo**: `stepInit` ya tiene que enviar el selector de mes como nuevo mensaje; mostrar el contexto desde el handler global permite editar el mensaje que contenía el botón y luego iniciar el scene limpiamente
- **Decisión**: El selector de mes para "Nueva cuota" en impuesto existente es un paso dentro del WizardScene (step 0), no un paso previo manejado externamente
- **Motivo**: mantiene toda la lógica del flujo cohesiva en la escena; simplifica `handleRegisterInstallment` a solo contexto + `scene.enter`
- **Decisión**: No hay botón "Volver" en el selector de meses; la única salida es escribir `cancelar`
- **Motivo**: elimina la necesidad del `tax_back_tax` en el scene y del doble `answerCbQuery` que causaba el bug de botón sin efecto

## 2026-05-26: Migración WizardScene — Flujo de tarjeta separado en dos escenas

- **Decisión**: `card.scene.ts` se divide en dos escenas independientes: `card-create.scene.ts` (creación de tarjeta: banco → procesador → dígitos → expiry → confirm) y `card-stmt.scene.ts` (resumen: currency → ARS → USD opcional → día → confirm + flujos de edición ARS/USD/día y pago con TCV/receipts)
- **Motivo**: una sola escena con `flowType` branching para 13 estados sería difícil de leer y mantener; escenas separadas son autónomas y más fáciles de testear

## 2026-05-25: Adoptar Telegraf WizardScene en lugar de WizardFlow custom

### Decisiones tomadas
- **Camino B completado**: flujo de ingresos migrado a `Scenes.WizardScene` nativo como POC; los archivos `wizard.service.ts` y `wizard.types.ts` del custom WizardFlow fueron eliminados
- **Store Firestore obligatorio**: colección `telegraf_sessions` (separada de `sessions` legacy) — requerido por el runtime stateless de Cloud Functions; `getSessionKey = ctx.from?.id.toString()`
- **Normativa: asteriscos visibles prohibidos** — cualquier mensaje con `*...*` debe incluir `parse_mode: "Markdown"`
- **Normativa WizardScene — input inválido**: siempre enviar (1) mensaje de contexto + (2) repetición completa del paso actual (texto + teclado); nunca re-mostrar solo el teclado sin contexto; documentado en `conventions.md`
- **Camino C pendiente**: migrar flujos restantes una vez validado el POC en webhook

---

## 2026-04-28: Diseño del flujo multicurrency en comprobantes de resúmenes de tarjeta

### Decisiones tomadas
- **Schema**: `paymentReceiptUrl` → `receiptUrlARS` + `receiptUrlUSD` (campos separados en Firestore); `exchangeRate` guardado al momento del pago
- **Flujo secuencial**: al marcar como pagado, se pide ARS primero → luego USD (no simultáneo); `hasUSD` codificado en el callback `card_stmt_pay_ars_skip:{id}:{0|1}` para evitar re-fetch
- **TCV requerido si hay USD**: si `amountUSD > 0`, el pago no se registra hasta recibir el TCV (text.ts, Commit 2)
- **Submenú Comprobantes**: botón dedicado en el detalle del resumen → pantalla separada con Resumen PDF + ARS + USD; mantiene separación entre el PDF bancario y los comprobantes de pago
- **Comprobantes desde historial vs flujo de pago**: adjuntar desde historial usa `statementAmountUSD: 0` en session para suprimir el prompt USD; adjuntar desde flujo de pago usa el valor real de `amountUSD`

---

## 2026-04-15: Patrón UX para Telegraf callback handlers — edit-before-reply

### Patrón correcto establecido
1. **Respuesta primaria**: `ctx.editMessageText()` — edita el mensaje que contenía el botón presionado
2. **Follow-up**: `ctx.reply()` — envía el siguiente paso como mensaje nuevo
3. **Guard clause**: `ctx.reply()` + `return` inmediato — siempre válido para errores/early exit
4. **Alternativa**: `replyOrEdit()` de `helpers/telegram.ts` — cumple el patrón

### Pendiente
- Convención documentada en `.claude/rules/shared/telegram-callback-ux.md`
- Hook PostToolUse advisory `check-callback-pattern.js` — detecta violaciones sin bloquear
- Registrar en `.claude/settings.json` + `.claude/settings.example.json`

---

## 2026-04-14: PostToolUse Hooks migrados a stderr — Visibilidad y consistencia

Los 3 hooks PostToolUse (`env-change-guard.js`, `typecheck-feedback.js`, `lint-feedback.js`) fueron migrados de `console.log()` (stdout) a `process.stderr.write()` (stderr) para consistencia con PreToolUse hooks. Funcionan correctamente pero Claude Code aún no captura stderr de PostToolUse hooks.

---

## 2026-04-08: Params objects + destructuring en firma (incluye migración de tipos por entidad)

### Reglas activas
- **Arquitectura de tipos**: Cada entidad tiene `types/[entidad].types.ts`; `types/index.ts` congelado para nuevas interfaces
- **Destructuring en firma**: SIEMPRE destructurar en la firma, NUNCA `const { x } = params` en el cuerpo
- **Tipos inline prohibidos**: NUNCA `}: { x: string }`; usar interfaces nombradas en `types/[entidad].types.ts`
- **Interfaces de parámetros**: patrón `[Func]Params` (e.g., `SaveExpenseParams`)

### Archivos de tipos creados
- `types/category.types.ts`, `types/service.types.ts`, `types/card.types.ts`, `types/storage.types.ts`
- Interfaces agregadas a: `types/tax.types.ts`, `types/expense.types.ts`, `types/income.types.ts`, `types/report.types.ts`

### Enforcement
- Hook PreToolUse: `.claude/hooks/check-param-patterns.js` — detecta body destructuring e inline types, exit 2 si violación

---

## 2026-04-06: Report history + retroactive registration
- Reportes menu → Mes actual | Ver anteriores → year/month selector → report/expense/income
- Back navigation: when only 1 year has data, `showMonthSelector` receives `backCallback="menu_reportes"`
- `buildBackdatedTimestamp(yearMonth)` in `helpers/format.ts` — last day of month at 20:00 UTC (17:00 ART)
- `getPastMonthsWithData(userId)` in `report.service.ts` — single-field Firestore queries (no composite index needed)
- `reportMonth?: string` field in `Session` — preserved through income flow via `{ ...session, ... }` spread

## 2026-04-06: Never create duplicate helpers — mandatory pre-check rule
- ALWAYS search `functions/src/helpers/` before writing any new helper
- Known helpers table in `shared/conventions.md` (must be updated when adding new helpers)
- Breadcrumb separator is ` / ` (not ` > `), output is `_path_\n\n` (italic Markdown) — requires `parse_mode: "Markdown"`

## 2026-04-03: Environment secrets automation — .pending-secrets registry + GCS_BUCKET resolution
- **Registry system**: `scripts/.pending-secrets` lists variable names pending sync (no values)
- **Sync command**: `npm run go → Prod → Sync secrets` reads registry, applies gcloud commands, clears file
- **GCS_BUCKET correcto**: `kakebot-972c2.firebasestorage.app` (no `kakebot-972c2`)
- **Lección clave**: GitHub Repository Secrets es lo que llega a producción, no `.env.prod`. Ambos deben estar en sync.
- Hard wall in `core/hard-walls.md`: NEVER forget to update `.pending-secrets` after changing `.env.prod`
- Workflow step 4 in `shared/workflow.md`: Verify & Sync secrets BEFORE deploy

## 2026-04-02: Type safety — named types and no session: any
- All domain literal unions must be exported as named types (never inline)
- Current named types: `CategoryType`, `PendingFileType`, `CreditCardProcessor`, `StatementCurrency`
- `SessionState` is a union of flow-specific sub-types (one per feature domain)
- Type guards exported from `types/index.ts`: `isCardSessionState`, `isServiceSessionState`, etc.
- `session: any` forbidden — always type as `Session`
- `as` casts allowed only at extraction boundaries (Telegraf regex match), never at point of use

## 2026-03-30: Session data reuse rule
- Never re-fetch from Firestore what a previous flow step already knows
- Entry points fetch + store in session; downstream handlers read from session with Firestore fallback
- Independent reads must use `Promise.all`, not sequential awaits
- Pattern applied: `getServiceNameCached()` in service.ts (9 handlers), `Promise.all` in 5 locations

## 2026-03-08: JSDoc required on all functions
- JSDoc required on ALL functions (new or modified), not just exported ones
- Single-line summary sufficient for self-explanatory signatures
- Add `@param` / `@return` when purpose or contract is non-obvious

## 2026-03-01: Bot message format
- Free text input: "Panaderia 238130" (description + amount)
- Bot parses and asks for confirmation with inline buttons
- Categories assigned AFTER recording, not during

## 2026-03-01: Subcategories are dynamic
- The expense description becomes the subcategory automatically
- Normalized (lowercase) for grouping: "Panaderia" → "panaderia"
- If same normalizedDesc seen again, amounts accumulate in reports
