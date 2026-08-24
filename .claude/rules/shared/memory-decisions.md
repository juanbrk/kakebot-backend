# Decisions Log

## 2026-08-24: Ingreso en USD sin conversión, y sin backfill de `currency` en producción

El registro de ingresos suma moneda (ARS/USD) al wizard existente, modelada como un campo `currency` único por documento (no un par `amountARS`/`amountUSD` como `CardStatement`) — cada ingreso ocurre en una sola moneda, a diferencia de un resumen de tarjeta que puede tener ambas. La conversión/venta de USD a ARS queda explícitamente fuera de alcance, para una etapa futura. Decisión explícita del usuario: no correr un backfill contra la colección `incomes` de producción para los documentos anteriores a este feature (sin campo `currency`) — `getMonthlyIncomes` ya los normaliza a `"ars"` en la lectura, así que no hace falta migrar datos; retomar si algún código nuevo llega a leer `incomes` sin pasar por ese normalizador. Nota para cuando se agregue una tercera moneda: `incomesTotalARS` (`report.service.ts`) filtra por `currency !== "usd"` en vez de `=== "ars"`, así que cualquier moneda nueva caería silenciosamente en el balde ARS — revisar ese filtro en ese momento.

## 2026-08-21: "Estado de impuestos" vive en su propio submenú "Impuestos", separado de "Servicios"

QA determinó que el nuevo reporte no debía convivir en Reportes → Servicios (como preveía el ticket original), sino en un submenú nuevo "Impuestos" paralelo a Balances/Pagos/Servicios — coherente con que Servicios e Impuestos ya son dominios separados en el resto del bot; breadcrumb y "← Volver" se ajustaron a `rep_impuestos`. El agrupamiento por estado de cuota (5 secciones, umbral de 7 días, formato de línea) se extrajo a `helpers/status-report.ts` (`buildStatusReportText`) en vez de clonar la lógica de "Estado de servicios", para que ambos reportes no puedan divergir. Los scripts de seed/restore usados para poblar el QA se borraron al cerrar el QA, mismo criterio que en ramas anteriores — no se versionan.

## 2026-08-04: "Resumen" en el doc-router registra un resumen nuevo, no adjunta a uno existente

El alcance se corrigió durante el diseño: en vez de adjuntar el PDF a un resumen existente, la opción "Resumen" del clasificador de documentos inicia el registro de un resumen **nuevo** — pregunta la tarjeta y entra al flujo de creación de siempre ya poblado (escena liviana nueva en vez de ampliar la escena de resúmenes existente), evitando tocar el archivo más grande del proyecto. Dos ajustes de QA quedaron aplicados a los dos flujos que comparten el selector de mes de resúmenes (el nuevo y "Añadir Resumen" desde el menú de tarjeta): se sacó el botón "Cancelar" (única salida: escribir "cancelar"), y los 3 botones de clasificación de documento pasan a una sola fila. Sin cambios en servicios ni índices de Firestore — ninguna query nueva.

## 2026-08-01: Al eliminar el selector de meses muerto, no se renombra el que queda

Con `buildTaxMonthKeyboard` (muerta) fuera, se decidió **no** renombrar `buildFilteredTaxMonthKeyboard` a ocupar el nombre libre: el prefijo `Filtered` describe lo que la función hace —filtra los meses que ya tienen cuota— y no meramente la distingue de la borrada, así que sobrevive por sí solo. Además el rename habría invalidado el criterio de aceptación del ticket (`grep buildTaxMonthKeyboard` → 0) y sumado 5 call sites de `tax.scene.ts` a un diff que de otro modo cabe en un archivo. Gotcha del cambio: `MONTH_NAMES` se importaba en `keyboards/tax.ts` **solo** para la función muerta, así que borrarla sin sanear el import deja un import sin uso — el ticket original no lo contemplaba.

## 2026-07-31: Convención TICKET.md instalada — decisiones de la implementación

Se decidió inglés como idioma del esquema de TICKET.md para este repo pese a que el patrón `kakebot-*` por defecto resuelve a español, por acuerdo explícito con Juan. La exclusión que desmarca `pr-audit` queda acotada a `.claude/rules/` (documentación) y no a todo `.claude/`, para que editar los propios hooks o `settings.json` siga invalidando una revisión de PR obsoleta. `commit-dream-check.js` pasó de `PostToolUse`/`Bash` (evento que nunca dispara porque Claude no corre `git commit`) a `UserPromptSubmit` con diff de SHA contra `dream-state.json`. De paso, `settings.example.json` dejó de usar el ritual `$PWD` + `sed` y pasó a ser un mirror byte-idéntico con `$CLAUDE_PROJECT_DIR`, evitando que el propio archivo de ejemplo cayera en el mismo bug de rutas que la convención buscaba prevenir.

## 2026-07-29: Merge de `main` a la rama de comprobantes de impuesto — criterio de resolución y QA post-merge

- **Conflictos**: solo `memory-decisions.md` y `memory-sessions.md`, ambos por "los dos lados agregaron entradas al principio". Criterio: **conservar todo**, bloque de main arriba (su entrada de "Estado de servicios" referencia a la de "Listado de entidades" como "el día anterior", así que ese orden relativo es obligatorio) y las de la rama abajo. Ningún archivo de código conflictuó.
- **Verificación semántica más allá del build**: main refactorizó `handlers/tax.ts` y `keyboards/tax.ts` a fondo (eliminó "Mis impuestos"), así que se cruzaron los callbacks estáticos de `keyboards/tax.ts` contra los handlers registrados — todos resuelven; `menu_mis_impuestos`/`tax_list` no quedaron referenciados. Los 8 callbacks `taxr_*` de la escena nueva intactos.
- **Punto de contacto real** entre las dos ramas: el fix de `getMonthLabel` de esta rama (`"Abril2026"` → `"Abril 2026"`) afecta 4 pantallas de impuestos, dos de ellas en el archivo que main refactorizó. Se verificaron las 4 en QA (ancho de botones en desktop y celular), no solo el compilado.
- **QA post-merge cerrada**: matriz de 33 casos en 4 bloques (feature de la rama / features de main / cruce del merge / estados vacíos). Todo OK excepto la sección "Pendientes" del reporte Estado de servicios, **inalcanzable por calendario** — el reporte solo trae cuotas del mes en curso y clasifica ahí las que vencen después de hoy+7 días; corriendo el 29 de julio es imposible. Decisión explícita del usuario: dejarla sin cubrir (comparte render y orden con "Próximos a vencer", que sí se validó) en vez de sembrar datos inconsistentes que ensuciarían otras pantallas.
- **Hallazgo lateral (H-05 en `TICKET.md`, ✅ resuelto el 2026-08-01 en `techDebt/remove-buildtaxmonthkeyboard-dead-code`)**: `buildTaxMonthKeyboard` (`keyboards/tax.ts:163`) es código muerto — los 4 selectores de mes usan `buildFilteredTaxMonthKeyboard`. Preexistente; armaba la etiqueta a mano con espacio, así que ya divergía de `getMonthLabel` antes del fix. Fuera de alcance, candidato a `/techdebt`.
- **Tooling de QA descartable**: el dataset de la matriz se sembró con scripts de seed/restore contra el emulador, borrados al cerrar el QA (mismo criterio que el `seed-qa-taxes.js` de la rama anterior — cumplen su propósito y no se versionan). Si hace falta rehacerlos, el patrón de seguridad que valió la pena fue: sondeo TCP al puerto del emulador antes de cualquier escritura, borrado de `GOOGLE_APPLICATION_CREDENTIALS`/`FIREBASE_CONFIG` del entorno para que no pueda escribir en producción, operaciones scopeadas por `telegramUserId`, y snapshot del estado previo que se escribe una sola vez y nunca se pisa al re-sembrar.

## 2026-07-29: "Listar servicios" migrado a Reportes → Servicios → "Estado de servicios"

- **Decisión**: el listado agrupado por estado de pago (Vencidos / Próximos a vencer / Pagados / Pendientes / Sin cuota), eliminado el día anterior junto con el submenú "Mis servicios" (ver entrada de decisión inmediatamente debajo), se recupera como reporte nuevo en `Reportes → Servicios → Estado de servicios` (`menu_service_status`), mirroreando el patrón standalone de "Métodos de pago" (`service-status-report.service.ts` + `.ts` handler, registro en `telegram.ts`).
- **Interactividad**: se mantiene de solo lectura (sin click-through a detalle por servicio), confirmado explícitamente por el usuario — coherente con que el detalle vive en la pantalla de cada servicio.
- **Bullet del submenú**: el nuevo bullet iguala el formato del bullet existente de "Métodos de pago" (negrita + `:`) en vez del formato documentado en `reports-menu.md` (`• Nombre — descripción`, texto plano) — decisión explícita del usuario para mantener las dos líneas del submenú visualmente iguales; el drift respecto a la convención documentada queda así, sin resolver.
- **Fix de wording durante la migración**: el texto original usaba "venció dd/mm" tanto para cuotas vencidas como para "Próximos a vencer"/"Pendientes"; se corrigió a "vence dd/mm" para las no vencidas — no es un cambio de comportamiento pedido, sino una corrección de claridad menor hecha al reconstruir la función desde cero.
- **Bug encontrado en QA**: `buildSection` ordenaba todas las secciones por `dueDate` incluso "Sin cuota" (`currentInstallment: null`), causando `TypeError: Cannot read properties of null`. Corregido con un parámetro `sortByDueDate` opt-in por sección.
- **Aplicado en**: `services/service-status-report.service.ts` (nuevo), `bot/handlers/service-status-report.ts` (nuevo), `bot/telegram.ts`, `bot/handlers/report-history.ts` (bullet + botón del submenú Servicios, y bullet del menú padre Reportes actualizado de "método de pago" a "estado y método de pago"), `reports-menu.md`. Build + lint limpios en todo momento; QA validado en botitio_testitoBot.
- **Auditoría post-implementación (`/audit-pr`)**: único hallazgo mayor — `buildSection` tomaba 4 parámetros posicionales, violando la convención de parámetros-objeto para funciones con más de 3 — corregido con `BuildSectionParams` local al archivo (mismo patrón que la interfaz local ya usada en `payment-method-report.service.ts`). Sin cambio de comportamiento; QA re-confirmada.

## 2026-07-29: Listado de entidades en el submenú raíz de Impuestos, Servicios y Tarjetas

- **Decisión**: cada submenú raíz muestra ahora, en un helper compartido (`buildNameListText`, con tope de 15 nombres), los nombres de las entidades registradas; se eliminan las pantallas intermedias "Mis impuestos"/"Mis servicios" y sus acciones útiles suben al raíz — el índice responde "¿existe?", el detalle vive en la pantalla de cada entidad.
- **Excepción**: "Ver como listado" de Tarjetas se conserva por decisión explícita del usuario, contra el criterio de aceptación original del ticket.
- **Auditoría técnica post-QA**: corrigió el tope de nombres recién mencionado y un crash preexistente (no introducido por esta feature) al invocar `/impuestos` como comando de texto; dejó deliberadamente afuera el escaping de Markdown en nombres de entidad (problema transversal al bot, candidato a ticket propio).
- **Aplicado en**: helpers, keyboards y handlers de impuestos/servicios/tarjetas. Build + lint limpios en todo momento.

## 2026-07-27: Comprobantes de impuesto desde el envío directo de archivo — paso de entidad en el doc-router + escena dedicada

- **Diseño**: al elegir "Comprobante" en el doc-router se agrega un paso nuevo — ¿a qué entidad pertenece? (Servicios/Impuestos) — en vez del tercer botón que pedía el ticket original; Impuestos entra a una escena nueva (`tax-receipt.scene.ts`) porque las dos escenas existentes eran service-céntrica o ya tenían un heurístico frágil que hubiera chocado. Los selectores muestran solo impuestos con cuotas pendientes y cuotas no pagadas, confirmando siempre ambos pasos aunque haya un solo candidato; una sola query cubre los dos selectores sin índice nuevo.
- **De paso** se corrigieron dos problemas de tooling (el hook de escenas bloqueaba editar flujos 100% teclado; los hooks de Claude Code solo corrían en el checkout de main, no en otros worktrees) y un bug heredado de formato de fecha.
- **QA cerrada**: dos hallazgos menores aceptados sin fix por ser bajo riesgo con un único usuario (UI obsoleta que podría re-marcar una cuota; falta de escaping de Markdown rompiendo un nombre de impuesto con `_`); una variante más severa del segundo (crash sin capturar, en un archivo fuera de esta rama) se derivó a un ticket propio en Trello.
- **Hallazgo de arquitectura** documentado en `wizard-scenes.md §7.3`: `scene.enter()` corre el composer de la escena antes que el step runner sobre el mismo update — causó un bug intermedio (aviso de reemplazo de archivo disparando también en la entrada) ya corregido.
- Build + lint limpios (125 warnings = baseline). QA cerrada.

## 2026-07-23: Desmarcar cuota de impuesto pagada — patrón "unmark", borrado en GCS, y decisión Conservar/Borrar en WizardScene

- **Feature**: botón "Marcar como no pagada" (renombrado de "Desmarcar como pagado" por QA) en el detalle de cuota de impuesto revierte `isPaid`/`paidAt`, acción inmediata sin confirmación (convención: yes/no solo para borrados irreversibles). Si la cuota tenía comprobante, sub-flujo Conservar/Borrar (borra también en GCS); "Marcar como pagado" saltea el prompt de adjuntar si la cuota ya tiene `receiptUrl` (espeja `service.ts`).
- **Primer patrón "unmark" del proyecto y primer borrado en GCS**: `unmarkTaxInstallmentAsPaid`/`clearTaxReceiptUrl` (tax.service.ts) y `deleteFromUrl` (storage.service.ts, simétrico a `downloadFromUrl`).
- **Reversa de diseño post-QA**: el sub-flujo Conservar/Borrar pasó de callbacks planos a vivir dentro de `taxScene` (`unpayDecision` en `TaxWizardState`, step `UNPAY_DECISION_STEP`) porque sin scene el texto libre caía al parser de gastos y los botones quedaban clickeables para siempre. Corregido de paso un choque de forma de estado con la entrada "solo comprobante" (`isReceiptOnlyEntry` necesitaba excluir `unpayDecision`).
- **Wording (2 rondas de QA)**: mensajes de contexto separados antes/después de la decisión; el mensaje final indica si se conservó o borró el comprobante; "Marcar como pagado" avisa explícitamente cuando ya había un comprobante cargado.
- **Refactor**: `renderTaxInstallmentDetail` perdió el parámetro `afterWrite` (sin más callers write-then-edit); nuevo helper compartido `buildTaxInstallmentDetailPayload` (keyboards/tax.ts) reutilizado por handler y escena; `buildBreadcrumb` deliberadamente fuera de `tax.scene.ts` (regla wizard-scenes.md §8.1). Duplicación entre `handleUnpayKeepReceipt`/`handleUnpayDeleteReceipt` extraída a `resolveUnpayDecision` (nombre ajustado desde la sugerencia original por el prefijo sancionado del hook `check-wizard-scene.js`).
- **Commit inicial de la rama incompleto**: quedó sin exportar `unmarkTaxInstallmentAsPaid`/`clearTaxReceiptUrl` (`tax.service.ts`) pese a que `handlers/tax.ts` y `tax.scene.ts` ya las importaban — el build no compilaba a partir de ese commit en soledad. Corregido en el commit siguiente, junto con el refactor de `resolveUnpayDecision`.
- **Aplicado en**: `types/telegraf-context.types.ts`, `keyboards/tax.ts`, `handlers/tax.ts`, `scenes/tax.scene.ts`, `tax.service.ts`, `storage.service.ts`. Alcance: solo detalle de Historial de impuestos. Build + lint limpios en todo momento.

## 2026-07-23: Auditoría post-QA de la rama — logging de fallos de edición, fix de `editOrReply`, corrección de drift de documentación, y follow-ups C+D resueltos

- **Bug + fix**: el fallback de `editOrReply` reenviaba el mismo payload que Telegram acababa de rechazar (garantizado a fallar igual ante Markdown malformado o teclado sobredimensionado) y ese `reply` no estaba en ningún try/catch — convertía un fallo recuperable de edición en excepción no atrapada **después** de un write ya commiteado. Reproducido en QA (`service.scene.ts:424`, servicio `Agua_Corriente`): write ok, edit falló, fallback falló idéntico, wizard trabado sin confirmación. **Fix**: nuevo helper privado `replyAfterFailedEdit` — reintenta el reply tal cual, si vuelve a fallar reintenta sin `parse_mode` (perder formato > perder el mensaje), y si eso también falla hace `log.error` y se rinde; nunca tira. Firma pública de `editOrReply` intacta (~16 call-sites sin cambios).
- **`replyOrEdit` deja de tragar en silencio**: ahora discrimina el motivo del fallo igual que `editOrReply` (reusa `getTelegramErrorText`) — solo `"message is not modified"` se ignora; cualquier otro motivo emite `log.warn` con `module`/`userId`/`reason`. Sin fallback a `ctx.reply` (esa sigue siendo la diferencia con `editOrReply`). Motivo: el catch vacío original volvía invisibles todos los fallos reales de edición en los 88 sitios migrados, sin rastro en logs.
- **Scope**: los demás hallazgos de la auditoría quedan fuera de esta rama, como follow-ups (detalle completo también en `TICKET.md`, gitignoreado — se resume acá para sobrevivir al borrado del worktree):
  - **A — Edit silencioso + cursor avanzado deja el wizard trabado.** ~14 sitios donde `replyOrEdit` renderiza un teclado y a continuación se hace `selectStep`/`next` (`card-stmt.scene.ts` 1015/1028/1050/1075/1117/1144, `service.scene.ts` 517/543, `invoice.scene.ts` 403/426/473, `categorize.scene.ts` 285/369, `tax.scene.ts` 437, `card-create.scene.ts` 159). Si el edit falla, el cursor avanza sobre un teclado que nunca se entregó y la única salida es escribir `cancelar`. Requiere decisión de diseño; priorizar con los datos del `log.warn` nuevo.
  - **B — Ampliar la superficie de enforcement.** `check-raw-edit-message.js` matchea solo `.editMessageText(` en `bot/handlers/` y `bot/scenes/`. Falta: cubrir `ctx.editMessageReplyMarkup` (uso vivo sin try/catch en `categorize.scene.ts:257`, `handleCatPg`); cubrir `bot/keyboards/`, `bot/middleware/`, `services/`; y resolver primero la laguna de prefijos de §2.2 (bloquea lo anterior).
  - **C — ✅ Resuelto (2026-07-23).** De los 3 helpers de render compartidos involucrados, solo uno tenía un único llamador (el caso a arreglar) y se migró directo a `editOrReply`; los otros dos son compartidos con navegación cosmética pura, así que se les agregó un parámetro booleano que switchea entre `replyOrEdit` (default, sin cambios para la navegación) y `editOrReply` (solo en los call-sites de escritura). Investigación previa (`PERSONA: Investigator`) confirmó el radio de impacto exacto antes de tocar código — el ticket original subestimaba que 2 de los 3 helpers tienen llamadores puramente cosméticos, no solo el caso write-then-render.
  - **D (menor) — ✅ Resuelto (documentado, 2026-07-23).** La premisa "hoy siempre se entra por callback" se verificó contra el código (el dispatcher central de texto libre no entra a esas escenas) y se documentó como invariante de hecho en `wizard-scenes.md`, con nota puntual en el sitio de código que la asume.
  - **E — No hay escaping de Markdown en ningún punto del bot** (causa raíz sistémica, reproducida en QA). Texto de usuario interpolado crudo con `parse_mode: "Markdown"` en `service.name`, `tax.name`, descripciones, categorías, banco de tarjeta — un `_`/`*`/`` ` ``/`[` sin cerrar rompe la pantalla, y como renombrar/eliminar cuelgan de esa misma pantalla, el registro queda inmanejable desde el bot. Requiere validar o escapar en el **input** (no solo el render) + helper `escapeMarkdown`/MarkdownV2 + migración de datos existentes.
  - **Bloqueo relacionado**: `check-wizard-scene.js` rechaza edición de `categorize.scene.ts` por dos funciones preexistentes (`loadUncategorizedGroups`, `skipCurrentItem`) sin prefijo sancionado — el reglamento §2.2 no contempla helpers compartidos que *ejecutan* una acción. Resolver esa laguna es prerequisito del ticket B.
- **Docs**: `workflow.md`/`hard-walls.md`/`CLAUDE.md` describían un flujo de deploy con scripts npm inexistentes (`deploy:test`, `deploy:prod`, `env:*`, `serve`); corregidos para reflejar el flujo real (`npm run go` + `scripts/switch-env.sh`). Detectado en una retrospectiva tras sugerir un deploy real innecesario para QA. Se formalizó también un checklist de sincronización de hooks entre worktree y repo principal en `hooks-error-log.md` (ya había recurrido 2 veces sin procedimiento).

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
