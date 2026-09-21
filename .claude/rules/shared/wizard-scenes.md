# WizardScene — Terse Reference

Standard for creating and migrating `Scenes.WizardScene` in KakeBot. Hook `check-wizard-scene.js` enforces structural checks; the checklist (§16) covers the rest.

**Gold standard:** `tax.scene.ts`. **Exception:** its internal breadcrumbs are tech debt — don't replicate.
**Code examples & deep dives:** `wizard-scenes-rationale.md` (same §numbers).

---

## 1. Anatomía de un scene file

Orden canónico (no negociable):

1. Imports
2. Constantes (`SCENE_ID`, `CANCEL_REGEX`, `*_STEP`)
3. Helpers privados
4. Step functions (`stepInit` → `stepHandleX` / `stepGuardX` en orden)
5. Action handlers (`handleX`)
6. `repromptCurrentStep`
7. `handleCancelWord`
8. Export del scene (`new Scenes.WizardScene<KakebotContext>(...)`)
9. Event handlers (`scene.hears`, `scene.action`, `scene.on`)

---

## 2. Naming

### 2.1 Constantes

- `export const [DOMAIN]_SCENE_ID = "[domain]-wizard"` — UPPER_SNAKE_CASE, kebab value, `-wizard` suffix
- `CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i` — copia textual exacta
- Jump constants: UPPER_SNAKE_CASE, `_STEP` suffix (e.g. `AMOUNT_STEP = 5`)

### 2.2 Step functions

| Patrón | Cuándo usar |
|---|---|
| `stepInit` | Step 0 — entrada y routing por `entryArgs` |
| `stepHandle[Field]` | Procesa input del usuario (texto, número, monto) |
| `stepGuard[Field]` | Re-presenta teclado si el usuario manda texto en vez de tocar un botón |

### 2.3 Action handlers

Prefijo `handle`: `handlePaymentMethod`, `handleMonthSelected`, `handleConfirm`, `handleCancel`.

### 2.4 Callback strings

- Formato: `[domain]_[action]` o `[domain]_[action]:[param]`
- Con parámetro: regex en `scene.action(/^tax_pm:(credit_card|auto_debit|manual)$/, handler)`
- Sin parámetro: string literal `scene.action("tax_skip_receipt", handler)`

### 2.5 Export

`export const [domain]Scene = new Scenes.WizardScene<KakebotContext>(SCENE_ID, ...steps)` — camelCase + `Scene`.

### 2.6 WizardState

- Definir en `types/telegraf-context.types.ts` como `[Domain]WizardState`
- Todos los campos `optional` (`?`)
- Cast en cada step: `const state = ctx.wizard.state as [Domain]WizardState`

---

## 3. Steps y cursor guards

Todo step que muestra un teclado inline y espera callback DEBE tener un `stepGuardX` dedicado a continuación. Prohibido el guard inline dentro del `stepHandle` previo.

- El callback del botón se matchea por `scene.action()` (independiente del cursor) y decide si llamar `next()` o `selectStep(N)`.
- Si el usuario manda texto mientras el teclado está activo, el step de guarda re-presenta el teclado. El cursor no avanza.

> Code example: `wizard-scenes-rationale.md` §3

---

## 4. Entry points y `entryArgs`

- `ctx.scene.enter(SCENE_ID, { ...preState } as WizardState)` — pre-populate state
- `stepInit` inspecciona state y rutea (receipt-only → `selectStep`, month-entry → show keyboard, full creation → `next()`)
- `ctx.wizard.next()`: avanza linealmente. `ctx.wizard.selectStep(N)`: salta directo
- Jump constants: `const AMOUNT_STEP = 5` — UPPER_SNAKE_CASE, `_STEP` suffix

> Code example: `wizard-scenes-rationale.md` §4

---

## 5. Invalid input handling

1. `ctx.reply()` con mensaje de error breve
2. `return` sin `ctx.wizard.next()` — el step se repite con el próximo update

Prohibido: re-presentar solo el teclado sin texto contextual.

---

## 6. `repromptCurrentStep`

- Se llama cuando el scene recibe un evento inesperado (foto/documento en step que espera texto/callback)
- Primera línea: `await ctx.reply("No esperaba un archivo aquí.")`
- `switch (ctx.wizard.cursor)` con un `case` por cada step que espera input del usuario
- Si `stepInit` tiene routing condicional, el case 0 replica esa lógica
- Default case: vacío (`break`)

> Code example: `wizard-scenes-rationale.md` §6

---

## 7. Event handlers obligatorios

Todo scene registra (después del `export`): `scene.hears(CANCEL_REGEX, handleCancelWord)`, `scene.action(...)`, `scene.on("photo", ...)`, `scene.on("document", ...)`.

### 7.1 `scene.hears(CANCEL_REGEX, ...)`

Captura `salir|cancelar|terminar|stop` en cualquier step. Handler: `leave()` + reply "Operación cancelada."

### 7.2 `scene.action(...)`

Todo action handler DEBE empezar con `await ctx.answerCbQuery()` — primera línea, sin condiciones. Omitirlo deja el botón "girando".

### 7.3 `scene.on("photo"/"document")`

**Siempre presentes**, aunque el flujo no acepte archivos. Sin archivos: ambos delegan a `repromptCurrentStep`. Con archivos: handlers dedicados que validan cursor y caen a `repromptCurrentStep` fuera del rango válido.

**Archivos como input primario** (ej. `doc-router.scene.ts`): si el cursor está en rango válido, actualizar state y re-presentar el prompt sin texto de error. El rango debe incluir el cursor de entrada (0), porque `scene.enter()` corre el composer **antes** que el step runner sobre el mismo update.

> Deep dive & gotcha del composer: `wizard-scenes-rationale.md` §7

---

## 8. UX

### 8.1 Breadcrumbs

**Prohibidos dentro del scene.** El handler externo que llama `ctx.scene.enter(...)` puede usar breadcrumb justo antes de entrar.

### 8.2 Prompts con bold

Todo prompt de acción va con `<b>...</b>` y `parse_mode: "HTML"`.

### 8.3 Orden de botones

Izquierda: negativa (Cancelar, Volver, Omitir). Derecha: positiva (Confirmar, Continuar, Adjuntar).

### 8.4 Emojis

✅ solo en confirmaciones de éxito. ❌ solo en errores. Nunca en labels de botón ni en prompts.

### 8.5 Teclados con opciones condicionales

Dos requisitos simultáneos: (1) **funnel único** al builder que lee el state en cada llamada, y (2) **guard en el action handler** que re-valida la condición contra el state actual — los botones de mensajes anteriores siguen clickeables.

> Code example: `wizard-scenes-rationale.md` §8

---

## 9. Ediciones de mensaje — regla de tres vías

`ctx.editMessageText` pelado **prohibido** en `bot/handlers/` y `bot/scenes/` (hook `check-raw-edit-message.js`):

| Caso | Usar | Semántica ante fallo |
|---|---|---|
| Edit cosmético (sin write previo) | `replyOrEdit` | Traga errores; solo "not modified" es silencioso, resto → `log.warn` |
| Confirmación post-write (Firestore/GCS) | `editOrReply` | Traga "not modified"; otro fallo → `log.warn` + fallback a `ctx.reply` |
| `ctx.editMessageText` pelado | **Prohibido** | Tira ante cualquier fallo |

Excepción: loop de categorización (`services/category.service.ts`) usa `ctx.telegram.editMessageText` low-level.

### 9.1 Dentro de un step

Siempre `ctx.reply()`. El usuario escribió; no hay nada que editar.

### 9.2 Dentro de un action handler

Patrón: `replyOrEdit(ctx, ...)` (consume el botón) → `ctx.reply(...)` (siguiente prompt/teclado).

### 9.3 `replyOrEdit` — traga errores pero loguea

Dual-context: desde callback edita, desde texto responde. Traga todo error de edición — solo apto para cosméticas. Si el edit falla y después se mueve el cursor, el wizard queda esperando un teclado nunca entregado (`log.warn` es la única señal).

### 9.4 `editOrReply` — write-then-edit

Regla: **write-then-edit → `editOrReply`**. Si la edición falla, cae a `ctx.reply` — la confirmación nunca se pierde.

### 9.5 Premisa: entrada al scene siempre por callback

`CARD_STMT_SCENE_ID`, `SERVICE_SCENE_ID`, `TAX_SCENE_ID` se entran solo desde `bot.action(...)`. Si se agrega una ruta por texto, `replyOrEdit`/`editOrReply` en `stepInit` mandarán un mensaje nuevo en vez de editar → dos teclados simultáneos. Neutralizar el teclado anterior antes de entrar.

> Deep dives: `wizard-scenes-rationale.md` §9

---

## 10. `ctx.scene.leave()` ordering

### 10.1 Salida normal

Mensaje final **antes** del `leave()`.

### 10.2 State corrupto

`reply` + `leave` + `return`. Ambos órdenes aceptables; ser consistente dentro del scene.

### 10.3 Nunca `leave()` con teclado activo

Si el último output muestra un teclado o prompt de archivo, el scene debe seguir activo. Opciones: (A) `selectStep(GUARD_STEP)` dentro del scene; (B) entrar al scene desde el handler global en vez de mostrar el prompt suelto.

**Señal de alarma**: teclado + `scene.leave()` en la misma función = siguiente input sin capturar.

> Code examples: `wizard-scenes-rationale.md` §10

---

## 11. Logging y error handling

### 11.1 Try/catch obligatorio

En toda operación I/O: Firestore writes, GCS uploads, descargas de archivo, servicios externos.

### 11.2 Logger estructurado

`log.error(message, error, { module: "[domain].scene", userId })`. Campos adicionales opcionales.

### 11.3 En el catch

- `ctx.reply()` con mensaje amigable
- **No** llamar `scene.leave()` — permitir reintento
- **No** propagar el error

---

## 12. Helpers compartidos obligatorios

| Helper | Origen | Cuándo usar |
|---|---|---|
| `getMessageText(ctx)` | `helpers/wizard.ts` | Extraer texto — solo en escenas que leen texto; no importar en escenas 100% teclado/archivo |
| `parseArgentineAmount(str)` | `helpers/parse-amount.ts` | Parsear montos |
| `formatARS(amount)` | `helpers/format.ts` | Mostrar montos |
| `MONTH_NAMES` | `helpers/format.ts` | Nombre de mes en castellano (0-based) |
| `getDaysInMonth("YYYY-MM")` | `helpers/format.ts` | Validar día contra mes |
| `buildBackdatedTimestamp("YYYY-MM")` | `helpers/format.ts` | Timestamp para registro retroactivo |
| `buildBreadcrumb([...])` | `helpers/breadcrumb.ts` | **Solo en handlers externos** (§8.1) |
| `replyOrEdit(ctx, text, extra?)` | `helpers/telegram.ts` | Edit cosmético en action handlers (§9) |
| `editOrReply(ctx, text, extra?)` | `helpers/telegram.ts` | Confirmación post-write (§9.4) |
| `buildPaymentMethodKeyboard({callbackPrefix})` | `helpers/payment-method.ts` | Teclado de método de pago |
| `log.info`, `log.warn`, `log.error` | `helpers/logger.ts` | Logging estructurado |

---

## 13. Patrón seguro de `ctx.from?.id`

`const telegramUserId = ctx.from?.id.toString() ?? ""` — siempre optional chaining + nullish coalescing. **Prohibido**: `ctx.from!.id`.

---

## 14. Extracción de regex match

Cast una vez por handler: `const match = (ctx as any).match as string[]` con `eslint-disable-next-line` en la línea anterior. Solo en handlers de `scene.action()` con regex.

---

## 15. Registro en el Stage

Importar el scene en `bot/telegram.ts` y agregarlo al array de `Scenes.Stage`. El orden en el array no afecta el comportamiento.

---

## 16. Checklist pre-PR

Antes de abrir un PR que crea o modifica un `*.scene.ts`, verificar **cada ítem**:

### Estructura
- [ ] Orden de secciones del archivo respetado (imports → constantes → helpers → steps → action handlers → reprompt → cancel word → export → registros).
- [ ] `SCENE_ID` exportado con sufijo `-wizard`.
- [ ] `CANCEL_REGEX` declarado con literal canónico (`/^\s*(salir|cancelar|terminar|stop)\s*$/i`).
- [ ] Scene exportado como `[domain]Scene = new Scenes.WizardScene<KakebotContext>(...)`.

### Naming
- [ ] Step functions con prefijo `step` (`stepInit`, `stepHandleX`, `stepGuardX`).
- [ ] Action handlers con prefijo `handle`.
- [ ] Callbacks con prefijo `[domain]_`.
- [ ] WizardState definido en `types/telegraf-context.types.ts` como `[Domain]WizardState`.

### Pasos
- [ ] `stepInit` es el step 0 y rutea según `entryArgs` cuando aplica.
- [ ] Cada step que muestra teclado tiene un `stepGuardX` inmediato a continuación (no inline).
- [ ] Validación de input inválido: `ctx.reply` + `return` (sin `next()`).
- [ ] Constantes `_STEP` declaradas cuando se usa `selectStep(N)`.
- [ ] Ningún step ni action handler muestra un teclado o prompt de archivo y llama `scene.leave()` en la misma ejecución — si el teclado espera respuesta, usar `selectStep(GUARD_STEP)` o entrar al scene desde afuera (§10.3).

### Eventos
- [ ] `scene.hears(CANCEL_REGEX, handleCancelWord)` registrado.
- [ ] `scene.on("photo", ...)` registrado.
- [ ] `scene.on("document", ...)` registrado.
- [ ] Si el scene procesa archivos como input primario: `scene.on("photo"/"document")` actualizan state y re-presentan el prompt actual — nunca `repromptCurrentStep` mientras el cursor esté en rango válido (§7.3).
- [ ] Todo `scene.action(...)` handler empieza con `await ctx.answerCbQuery();`.

### `repromptCurrentStep`
- [ ] Función presente.
- [ ] Primera línea: `await ctx.reply("No esperaba un archivo aquí.");`.
- [ ] Switch cubre todos los steps que esperan input del usuario.
- [ ] Default case vacío (`break`).

### UX
- [ ] **Cero llamadas a `buildBreadcrumb` dentro del scene file.**
- [ ] Todo prompt con `<b>...</b>` incluye `parse_mode: "HTML"`.
- [ ] Botones: cancelar izquierda, confirmar derecha.
- [ ] Emojis solo en `✅`/`❌`.
- [ ] Teclados con opciones condicionales pasan por un funnel único que lee el state en cada llamada, y el action handler re-valida la condición contra el state actual (§8.5).

### Ediciones de mensaje (regla de tres vías, §9)
- [ ] Steps usan `ctx.reply()`.
- [ ] Action handlers que consumen un botón usan `replyOrEdit(ctx, ...)` + `ctx.reply()` para el siguiente paso.
- [ ] Confirmaciones post-write usan `editOrReply` (§9.4).
- [ ] **Cero llamadas a `ctx.editMessageText` pelado** (hook `check-raw-edit-message.js` lo bloquea).

### `scene.leave()`
- [ ] En salidas normales: mensaje final **antes** del `leave()`.
- [ ] En validación de state corrupto: `reply` + `leave` + `return`.

### Logging y errores
- [ ] Toda operación I/O (Firestore, GCS, archivos) envuelta en try/catch.
- [ ] `log.error` con `module: "[domain].scene"` y `userId`.
- [ ] El `catch` no llama `scene.leave()` — permite reintento.

### Helpers
- [ ] Si la escena lee texto entrante: `getMessageText` importado de `helpers/wizard.ts` (no redefinido, no extraído a mano). Si es 100% teclado/archivo, no se importa.
- [ ] Otros helpers (`formatARS`, `parseArgentineAmount`, etc.) desde sus módulos canónicos.

### Documentación
- [ ] Toda función (steps, action handlers, helpers locales) tiene al menos una línea de JSDoc summary.
- [ ] Funciones con parámetros incluyen `@param {KakebotContext} ctx` (y otros params si aplica) — requerido por la regla `valid-jsdoc` de ESLint.

### Seguridad de tipos
- [ ] `ctx.from?.id.toString() ?? ""` (nunca `ctx.from!.id`).
- [ ] Cast `(ctx as any).match as string[]` solo en handlers con regex en `scene.action`.
- [ ] `eslint-disable-next-line @typescript-eslint/no-explicit-any` en la línea exacta del cast.

### Integración
- [ ] Scene importado y registrado en `bot/telegram.ts`.
- [ ] Si reemplaza un flujo legacy: bloques de `session.state` correspondientes eliminados de `handlers/text.ts` y `handlers/photo.ts`.
- [ ] Sub-types de `SessionState` legacy eliminados de `types/index.ts` (o `session.types.ts`).
  ⚠️ **Eliminar DESPUÉS de que**: (1) la escena esté completa y registrada en `telegram.ts`, y (2) todas las referencias al estado anterior hayan sido removidas de `text.ts`, `photo.ts` y cualquier handler que las mencionara. Eliminar antes provoca errores en cascada en múltiples archivos.
  ⚠️ **Verificar literales antes de eliminar**: correr `grep -rn 'state: "' functions/src/services/ functions/src/bot/scenes/` para confirmar que ningún service ni scene sigue escribiendo un literal del sub-type a eliminar. Si alguno lo usa (e.g. `state: "categorizing"` en `finishCategorizingFlow`), el literal debe permanecer como valor standalone en `SessionState` aunque se elimine el type alias. Omitir este paso produce un error `'literal' is not assignable to type 'SessionState'` en build.

### Verificación local
- [ ] `npm run build` (cd functions) limpio.
- [ ] `npm run lint` limpio.
- [ ] Hook `check-wizard-scene.js` no falla al editar el archivo.
- [ ] Flujo testeado end-to-end en `botitio_testitoBot`.

---

## 17. Patrón bridge — handoff a handlers legacy

Un scene puede escribir a la sesión Firestore y llamar `leave()` para que un handler global continúe. Campos escritos deben permanecer en `Session` hasta que el handler legacy se migre. Al migrar, el bridge se vuelve obsoleto.

> Code example & rules: `wizard-scenes-rationale.md` §17
