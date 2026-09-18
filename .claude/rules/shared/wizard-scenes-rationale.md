# WizardScene — Rationale & Code Examples

Long-form explanations, code examples, and gotchas for the WizardScene standard.
The terse reference lives in `wizard-scenes.md` (auto-loaded). This file is loaded on demand.

**Gold standard:** `functions/src/bot/scenes/tax.scene.ts`.

---

## 3. Steps y cursor guards — estructura canónica

### 3.2 Code example

```typescript
// Step N: procesa input y muestra el siguiente teclado.
async function stepHandlePaymentName(ctx: KakebotContext): Promise<void> {
  const name = getMessageText(ctx);
  if (!name) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;  // NO avanza el cursor — el step se repite con el próximo update.
  }
  (ctx.wizard.state as MyWizardState).name = name;

  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "domain_pm" });
  await ctx.reply("<b>Seleccioná el método de pago</b>", {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();  // Avanza al step de guarda.
}

// Step N+1: cursor guard — solo se ejecuta si el usuario manda texto en lugar de tocar un botón.
async function stepGuardPaymentMethod(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí un método de pago del teclado, o escribí \"cancelar\" para anular.");
  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "domain_pm" });
  await ctx.reply("<b>Seleccioná el método de pago</b>", {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  // NO llama next() — el callback del botón lo hace.
}
```

### 3.3 Cómo avanza el cursor en flujos con guarda

- El callback del botón se matchea por `scene.action()` (independiente del cursor). El handler del callback decide si llamar `ctx.wizard.next()` o `ctx.wizard.selectStep(N)` para mover el cursor.
- Si el usuario manda texto/foto/documento mientras el teclado está activo, el step de guarda corre y re-presenta el teclado. El cursor **no avanza**.

Ejemplo canónico: `tax.scene.ts:159-167` (`stepGuardPaymentMethod`), `tax.scene.ts:174-193` (`stepGuardMonth`).

---

## 4. Entry points y `entryArgs` — code examples

### 4.1 Routing en `stepInit`

```typescript
// Handler externo (e.g., bot/handlers/tax.ts)
await ctx.scene.enter(TAX_SCENE_ID, { taxId, taxName } as TaxWizardState);
```

`stepInit` inspecciona el state y rutea:

```typescript
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;

  // Ruta 1: receipt-only entry — saltar al step de receipt guard.
  if (state.installmentId && !state.selectedMonth) {
    ctx.wizard.selectStep(RECEIPT_GUARD_STEP);
    return;
  }

  // Ruta 2: installment-month entry — mostrar selector de meses.
  if (state.taxId && !state.selectedMonth && !state.installmentId) {
    // ...mostrar teclado, cursor permanece en 0 esperando callback.
    return;
  }

  // Ruta 3: full creation — avanzar al primer step normal.
  await ctx.reply("<b>¿Cómo se llama el impuesto?</b>", { parse_mode: "HTML" });
  ctx.wizard.next();
}
```

Referencia: `tax.scene.ts:64-105`.

### 4.3 Constantes de salto

```typescript
const AMOUNT_STEP = 5;
const RECEIPT_GUARD_STEP = 7;
```

---

## 5. Invalid input — code example

```typescript
async function stepHandleAmount(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx);
  const amount = messageText ? parseArgentineAmount(messageText) : null;
  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 5000 o 53.136,74");
    return;
  }
  // ...continuar.
}
```

---

## 6. `repromptCurrentStep` — estructura obligatoria

```typescript
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as MyWizardState;
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0:
    // Re-presentar el prompt/teclado del step 0.
    break;
  case 1:
    // Re-presentar el prompt del step 1.
    break;
  // ...un case por cada step que espera input del usuario.
  default:
    break;
  }
}
```

---

## 7. Event handlers — code examples & deep dives

### 7.1 Cancel word handler

```typescript
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}
```

### 7.2 `answerCbQuery` first

```typescript
async function handlePaidYes(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // resto del handler.
}
```

### 7.3 Photo/document registration patterns

```typescript
// Flujo sin archivos:
[domain]Scene.on("photo", repromptCurrentStep);
[domain]Scene.on("document", repromptCurrentStep);

// Flujo con archivos:
[domain]Scene.on("photo", handleReceiptPhoto);
[domain]Scene.on("document", handleReceiptDocument);
// donde cada uno valida cursor y delega a repromptCurrentStep cuando no aplica.
```

Patrón de delegación cuando el archivo llega fuera del momento esperado: `tax.scene.ts:547-551`.

### 7.3.1 Flujos que procesan archivos como input primario

Aplica cuando el archivo en sí ES lo que se está recolectando, válido en varias posiciones de cursor (no en un único step designado) — ej. `doc-router.scene.ts`, donde los cursores 0 y 1 son ambos "esperando archivo o elección de tipo". A diferencia del caso anterior, recibir un archivo acá no es un error: es el input principal del flujo. Si el cursor está dentro del rango válido, el handler actualiza `state.pendingFileId`/`pendingFileType` (o equivalente) directamente y re-presenta el mismo prompt/teclado, sin texto de error. Solo se delega a `repromptCurrentStep` cuando el cursor está fuera de ese rango.

```typescript
async function handlePhotoWhileWaiting(ctx: KakebotContext): Promise<void> {
  if (ctx.wizard.cursor !== 0 && ctx.wizard.cursor !== TYPE_GUARD_STEP) {
    await repromptCurrentStep(ctx);
    return;
  }
  const state = ctx.wizard.state as [Domain]WizardState;
  // extraer file_id de ctx.message y asignarlo a state.pendingFileId/pendingFileType
  await ctx.reply(
    "¿Qué tipo de documento es?\nEscribí \"cancelar\" para anular la carga.",
    buildDocTypeKeyboard(),
  ); // mismo prompt que stepInit — sin mensaje de error
}
```

Implementación canónica: `doc-router.scene.ts:63-85` (`handlePhotoWhileWaiting`) y `doc-router.scene.ts:87-109` (`handleDocumentWhileWaiting`).

### 7.3.2 Por qué el rango de cursor válido debe incluir el cursor de entrada

`ctx.scene.enter(...)` corre el composer de la escena (`scene.on`/`scene.action`/`scene.hears`) sobre el **mismo update** que disparó la entrada, y ese composer se ejecuta **antes** que el step runner. Consecuencia concreta: cuando el archivo que dispara la entrada a la escena (`entryArgs` ya trae su `pendingFileId`) llega en el mismo update, es `scene.on("photo"/"document")` — no `stepInit` — quien lo atiende primero; `stepInit` recién corre si después llega un segundo update (texto) con el cursor en 0. Si el handler de archivo no distingue "es la entrada" de "es un reemplazo", termina emitiendo el aviso de reemplazo (o un error) ante el primer archivo, que nunca fue reemplazado. La corrección correcta es comparar contra el `pendingFileId` ya cargado en `entryArgs`/state: el aviso solo sale si el archivo entrante desplaza a uno **distinto** del que ya estaba.

---

## 8. UX — code examples

### 8.1 Breadcrumb en handler externo (pre-scene)

```typescript
// bot/handlers/tax.ts
async function handleRegisterInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"])
      + `Vas a registrar una nueva cuota para ${taxName}`,
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(TAX_SCENE_ID, { taxId, taxName } as TaxWizardState);
}
```

### 8.2 Bold prompt

```typescript
await ctx.reply("<b>¿Cuál es el monto de la cuota?</b>\n<i>Ej: 5000 o 53.136,74</i>", {
  parse_mode: "HTML",
});
```

### 8.5 Teclados con opciones condicionales — detalle

Cuando un botón aparece o desaparece según el state (ej. "Resumen" solo si el archivo pendiente
es un PDF), hacen falta **las dos cosas**:

1. **Un solo funnel hacia el builder.** Todas las re-presentaciones del teclado pasan por un
   helper que lee el state en cada llamada, en vez de que cada call-site le pase el flag por su
   cuenta. Así, si el state cambia a mitad del flujo, el teclado siguiente se recalcula solo.

   ```typescript
   async function repromptDocType(ctx: KakebotContext): Promise<void> {
     const { pendingFileType } = ctx.wizard.state as DocRouterWizardState;
     await ctx.reply(DOC_TYPE_PROMPT, buildDocTypeKeyboard(pendingFileType));
   }
   ```

2. **Un guard en el action handler.** Ocultar el botón no lo desactiva: **los mensajes anteriores
   siguen en el chat y sus botones siguen siendo clickeables**. Si el usuario mandó un PDF, no
   tocó nada, y después mandó una foto, el teclado viejo con "Resumen" sigue ahí. El handler
   tiene que re-validar la condición contra el state actual y recuperarse re-presentando el
   teclado vigente — nunca asumir que fue invocado desde el teclado que corresponde al state de
   ahora.

Referencia: `doc-router.scene.ts` — `repromptDocType` y `handleDocTypeStatement`.

---

## 9. Ediciones de mensaje — deep dives

### 9.2 Patrón canónico edit-then-reply

```typescript
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // ...extraer match, setear state.
  await replyOrEdit(ctx, `<b>Vas a registrar la cuota para ${monthLabel}</b>`, {
    parse_mode: "HTML",
  });
  await ctx.reply(`<b>¿Cuál es el monto?</b>`, { parse_mode: "HTML" });
  ctx.wizard.selectStep(AMOUNT_STEP);
}
```

Referencia: `tax.scene.ts` (`handleMonthSelected`).

### 9.3 Semántica de `replyOrEdit` — qué cubre y qué no

`replyOrEdit` (de `helpers/telegram.ts`) también cubre el caso dual-context: si el handler llega desde un callback edita, y si llega desde un mensaje de texto responde (útil en `handleConfirm`/`handleCancel` que aceptan ambas vías). Tener presente que en callback **traga cualquier error de edición**, no solo "not modified" — por eso solo es apto para ediciones cosméticas: si el mensaje editado confirma un dato ya persistido, corresponde `editOrReply` (§9.4), cuyo fallback a `reply` garantiza que la confirmación llegue.

Tragar no significa perder el rastro: desde 2026-07-22 `replyOrEdit` distingue el motivo igual que `editOrReply`. Solo `"message is not modified"` (el doble-tap) se ignora en silencio; cualquier otro fallo — Markdown roto por un nombre interpolado, mensaje demasiado viejo para editar, 429 — sale como `log.warn` con `module: "helpers/telegram"`, `userId` y `reason`. La diferencia con `editOrReply` sigue siendo el **fallback**, no el logging: `replyOrEdit` no reintenta con `ctx.reply`, así que la pantalla puede no actualizarse nunca. Consecuencia a tener presente al escribir un action handler: si después del `replyOrEdit` se mueve el cursor (`ctx.wizard.selectStep`/`next`), un edit fallido deja el wizard esperando un callback de un teclado que nunca se entregó — el `log.warn` es hoy la única señal de que eso pasó.

### 9.4 `editOrReply` code example

```typescript
async function handleConfirmDelete(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await deleteService(serviceId);          // write ya commiteado
  await editOrReply(ctx, `✅ Servicio '${serviceName}' eliminado.`, {
    parse_mode: "HTML",
  });                                       // si el edit falla, cae a reply — el flujo no muere
}
```

Referencias: `tax.ts` (`handleMarkAsPaid`), `service.ts` (`handleConfirmDelete`), `card-stmt.scene.ts` (`stepInit` case `pay`).

### 9.5 Premisa: la entrada al scene siempre llega por callback

Varios `stepInit` (ej. `card-stmt.scene.ts` case `pay`) llaman `replyOrEdit`/`editOrReply` para editar el mensaje que disparó el `ctx.scene.enter(...)`. Esto solo edita en el sentido esperado — el mensaje con el botón que el usuario tocó — porque **hoy toda entrada a `CARD_STMT_SCENE_ID`, `SERVICE_SCENE_ID` y `TAX_SCENE_ID` ocurre desde un `bot.action(...)` (callback)**, nunca desde `bot.on("text", ...)`. Verificado: `bot/handlers/text.ts` solo entra a `BULK_SCENE_ID` y `EXPENSE_SCENE_ID`; ningún camino de texto llama `ctx.scene.enter` para las otras tres escenas.

Esta premisa no está impuesta por ningún tipo, test ni hook — es un invariante de hecho, no de diseño. Si una ruta futura entrara a una de esas escenas desde un handler de texto, el mismo `ctx` no tendría `ctx.callbackQuery`, y `replyOrEdit`/`editOrReply` caerían a su rama `ctx.reply(...)` (mensaje nuevo) en lugar de editar. Consecuencia: el mensaje anterior (con su teclado) queda activo en Telegram **además** del mensaje nuevo — dos teclados simultáneos, justo lo que la decisión del 2026-07-03 ("nunca dos mensajes con botones activos") prohíbe.

**Al agregar una nueva ruta de entrada a estas escenas**: si entra desde `bot.on("text", ...)` o cualquier handler sin `callbackQuery`, no asumir que `replyOrEdit`/`editOrReply` en `stepInit` van a editar algo — van a mandar un mensaje nuevo. Si el paso previo dejó un teclado activo, hay que neutralizarlo explícitamente (editarlo aparte, o rediseñar el entry point) antes de mostrar el prompt del scene.

---

## 10. `scene.leave()` — code examples

### 10.1 Salida normal

```typescript
// 1. Enviar mensaje final (éxito o cancelación) primero.
await ctx.reply("✅ <b>Cuota registrada</b>: …", { parse_mode: "HTML" });
// 2. Luego dejar la escena.
await ctx.scene.leave();
```

### 10.2 State corrupto

```typescript
if (!hasRequiredData) {
  await ctx.reply("Error: datos de sesión incompletos.");
  await ctx.scene.leave();
  return;
}
```

### 10.3 Nunca `leave()` con teclado activo — code examples

**Opción A — step dentro del scene:**

```typescript
// ❌ INCORRECTO — scene deja activo antes de recibir la foto
await ctx.reply("<b>Enviá la foto del comprobante.</b>", { parse_mode: "HTML", reply_markup: ... });
await ctx.scene.leave();   // El próximo mensaje del usuario ya no está en el scene.

// ✅ CORRECTO — cursor queda en el guard de comprobante
await ctx.reply("<b>Enviá la foto del comprobante.</b>", { parse_mode: "HTML", reply_markup: ... });
ctx.wizard.selectStep(RECEIPT_STEP);
```

**Opción B — action handler global:**

```typescript
// ❌ INCORRECTO — muestra teclado fuera del scene; la foto no la captura nadie
async function handleMarkAsPaid(ctx: Context): Promise<void> {
  await markInstallmentAsPaid(installmentId);
  await ctx.editMessageText("✅ Cuota marcada como pagada.");
  await ctx.reply("<b>Enviá la foto del comprobante.</b>", { reply_markup: ... });
  // La foto siguiente va a photo.ts → doc-router.
}

// ✅ CORRECTO — scene entra y captura el archivo
async function handleMarkAsPaid(ctx: KakebotContext): Promise<void> {
  await markInstallmentAsPaid(installmentId);
  await ctx.editMessageText("✅ Cuota marcada como pagada.");
  await ctx.scene.enter(SERVICE_SCENE_ID, { flow: "receipt", installmentId } as ServiceWizardState);
  // stepInit muestra el prompt; scene.on("photo"/"document") lo captura.
}
```

---

## 11. Logging — code example

```typescript
try {
  // operación I/O
} catch (error) {
  log.error("Error uploading tax receipt", error, {
    module: "tax.scene",
    userId: telegramUserId,
  });
  await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
}
```

---

## 13. `ctx.from?.id` — code example

```typescript
const telegramUserId = ctx.from?.id.toString() ?? "";
```

---

## 14. Regex match — code examples

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const match = (ctx as any).match as string[];
const installmentId = match[1];
```

O en una sola expresión:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const installmentId = ((ctx as any).match as string[])[1];
```

---

## 15. Stage registration — code example

```typescript
import { incomeScene } from "./scenes/income.scene";
import { taxScene } from "./scenes/tax.scene";
// import { [newScene] } from "./scenes/[new].scene";

const stage = new Scenes.Stage<KakebotContext>([incomeScene, taxScene /*, [newScene]*/]);
telegramBot.use(stage.middleware());
```

---

## 17. Patrón bridge — code example & rules

Algunos scenes actúan como un puente temporal: al terminar, escriben estado a la sesión de Firestore y llaman `scene.leave()` para que un handler global (ya registrado con `bot.action(...)`) continúe el flujo desde donde el scene lo dejó.

### Cuándo aplica

Cuando el scene reemplaza solo la primera parte de un flujo (ej. selección de tipo de documento), pero los pasos siguientes aún viven en handlers legacy que leen de la sesión Firestore.

### Patrón canónico

```typescript
async function handleDocTypeInvoice(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;

  // 1. Escribe al store Firestore para que el handler legacy pueda leerlo.
  await setSession(telegramUserId, {
    ...(existing ?? emptySessionForPartial(telegramUserId)),
    state: "invoice_awaiting_service",   // estado que espera el handler global
    pendingFileId,
    pendingFileType,
  });

  // 2. Muestra el teclado / mensaje que inicia el flujo legacy.
  await replyOrEdit(ctx, "...", { reply_markup: keyboard.reply_markup as any });

  // 3. Sale del scene — el handler legacy toma el control desde aquí.
  await ctx.scene.leave();
}
```

Referencia: `bot/scenes/doc-router.scene.ts` — `handleDocTypeInvoice` / `handleDocTypeReceipt`.

### Reglas

- Los campos escritos a Firestore (ej. `pendingFileId`, `pendingFileType`) deben **permanecer en la interfaz `Session`** mientras el handler legacy los use. Eliminarlos antes rompe el handoff.
- Al migrar el handler legacy a su propio WizardScene, el bridge se vuelve obsoleto.
- Documentar en el TICKET.md o en el comentario del bridge qué campos son temporales y cuándo se eliminarán.

---

## Referencias canónicas

| Patrón | Archivo y líneas |
|---|---|
| Orden completo de archivo | `tax.scene.ts:1-666` |
| `stepInit` con routing por entryArgs | `tax.scene.ts:64-105` |
| `stepHandleX` con validación + avance | `tax.scene.ts:200-262` |
| `stepGuardX` separado | `tax.scene.ts:159-167`, `tax.scene.ts:174-193` |
| `repromptCurrentStep` con switch exhaustivo | `tax.scene.ts:464-533` |
| Action handler con `answerCbQuery` y edit-then-reply | `tax.scene.ts:358-383` |
| `selectStep` en action handler | `tax.scene.ts:382` |
| Try/catch + `log.error` estructurado | `tax.scene.ts:569-580` |
| Photo/document handlers con cursor check | `tax.scene.ts:540-581` |
| Archivo como input primario (photo/document handlers) | `doc-router.scene.ts` — `handlePhotoWhileWaiting` / `handleDocumentWhileWaiting` |
| Escena de selección pura (sin steps de texto, dos selectores encadenados) | `tax-receipt.scene.ts` |
| Escena de un solo selector que rehidrata un flujo existente | `card-statement-doc.scene.ts` — elige la tarjeta y entra a `card-stmt.scene` con `flow: "create"` ya poblado |
| Ruteo a otra escena según elección del usuario | `doc-router.scene.ts` — `handleEntityService` / `handleEntityTax` / `handleDocTypeStatement` |
| Teclado que depende del state (opción condicional) | `doc-router.scene.ts` — `repromptDocType` como funnel único a `buildDocTypeKeyboard` |
| Cancel word handler | `tax.scene.ts:636-639` |
| Registro de event handlers | `tax.scene.ts:653-665` |
| `WizardState` interface | `types/telegraf-context.types.ts` (buscar `[Domain]WizardState`) |
| `getMessageText` helper | `helpers/wizard.ts` |
| Patrón bridge (handoff a handler legacy) | `bot/scenes/doc-router.scene.ts` — `handleDocTypeInvoice` |
