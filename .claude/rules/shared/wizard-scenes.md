# WizardScene — Reglamento de migración y creación

Este reglamento define el estándar único para crear y migrar `Scenes.WizardScene` de Telegraf en KakeBot. Toda escena nueva o migrada debe cumplir cada sección. Las violaciones detectables estructuralmente las bloquea el hook `check-wizard-scene.js` (PreToolUse); el resto se valida con el checklist al final de este documento.

**Escena de referencia (gold standard estructural):** `functions/src/bot/scenes/tax.scene.ts`.
**Excepción:** los breadcrumbs internos de `tax.scene` son deuda técnica (decisión #8) — no los repliques.

---

## 1. Anatomía de un scene file

Orden canónico del archivo (no negociable):

1. Imports.
2. Constantes (`SCENE_ID`, `CANCEL_REGEX`, constantes de salto directo si aplica).
3. Helpers privados (funciones puras locales al scene, e.g. `getAvailableMonthsForTax`).
4. Step functions (en orden: `stepInit`, luego `stepHandleX` y `stepGuardX` en el orden del wizard).
5. Action handlers (`handleX` — independientes del cursor).
6. `repromptCurrentStep`.
7. `handleCancelWord`.
8. Export del scene (`new Scenes.WizardScene<KakebotContext>(SCENE_ID, ...steps)`).
9. Registro de event handlers (`scene.hears`, `scene.action`, `scene.on`).

Referencia: `tax.scene.ts:1-666` cumple este orden.

---

## 2. Naming

### 2.1 Constantes

- `[DOMAIN]_SCENE_ID = "[domain]-wizard"` — UPPER_SNAKE_CASE, valor kebab-case con sufijo `-wizard`, **exportado**.
  ```typescript
  export const TAX_SCENE_ID = "tax-wizard";
  ```
- `CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i` — copia textual obligatoria, sin variaciones.
- Constantes de salto directo (cuando hay `selectStep`): UPPER_SNAKE_CASE, sufijo `_STEP` (e.g., `AMOUNT_STEP = 5`).

### 2.2 Step functions

Toda función registrada como step del WizardScene debe llevar prefijo `step`:

| Patrón | Cuándo usar |
|---|---|
| `stepInit` | Step 0, siempre. Recibe la entrada al scene y rutea según `entryArgs`. |
| `stepHandle[Field]` | Step que procesa input del usuario (texto, número, monto). Ejemplos: `stepHandleName`, `stepHandleDay`, `stepHandleAmount`. |
| `stepGuard[Field]` | Step que muestra teclado y espera callback. Su única función es re-presentar el teclado si el usuario manda texto en su lugar. Ejemplos: `stepGuardPaymentMethod`, `stepGuardMonth`. |

### 2.3 Action handlers (callbacks)

Funciones invocadas por `scene.action(...)` llevan prefijo `handle`:

```typescript
async function handlePaymentMethod(ctx: KakebotContext): Promise<void> { ... }
async function handleMonthSelected(ctx: KakebotContext): Promise<void> { ... }
async function handleConfirm(ctx: KakebotContext): Promise<void> { ... }
async function handleCancel(ctx: KakebotContext): Promise<void> { ... }
```

### 2.4 Callback strings

- Formato: `[domain]_[action]` o `[domain]_[action]:[param]`.
- Cuando hay parámetro, registrar con regex en `scene.action()`:
  ```typescript
  scene.action(/^tax_pm:(credit_card|auto_debit|manual)$/, handlePaymentMethod);
  scene.action(/^tax_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
  ```
- Callbacks sin parámetro: string literal (`scene.action("tax_skip_receipt", ...)`).

### 2.5 Export del scene

```typescript
export const [domain]Scene = new Scenes.WizardScene<KakebotContext>(
  [DOMAIN]_SCENE_ID,
  stepInit,
  // ...steps in order
);
```

Naming: camelCase del dominio + sufijo `Scene`. Ejemplos: `taxScene`, `incomeScene`, `invoiceScene`.

### 2.6 WizardState type

Toda escena define su WizardState en `functions/src/types/telegraf-context.types.ts`:

```typescript
export interface TaxWizardState {
  taxName?: string;
  estimatedDueDay?: number;
  paymentMethod?: ServicePaymentMethod;
  taxId?: string;
  selectedMonth?: string;
  installmentId?: string;
}
```

Reglas:
- Naming: `[Domain]WizardState`.
- Todos los campos son optional (`?`) — se llenan progresivamente paso a paso.
- Cast en cada step: `const state = ctx.wizard.state as [Domain]WizardState;`.

---

## 3. Steps y cursor guards

### 3.1 Regla

Todo step que termina mostrando un teclado inline y espera un callback DEBE tener un step de guarda dedicado a continuación. El step de guarda es una función separada con prefijo `stepGuard`. **Está prohibido implementar el cursor guard inline dentro del `stepHandle` previo** (patrón legacy de `income.scene` — deuda técnica).

### 3.2 Estructura canónica

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
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();  // Avanza al step de guarda.
}

// Step N+1: cursor guard — solo se ejecuta si el usuario manda texto en lugar de tocar un botón.
async function stepGuardPaymentMethod(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí un método de pago del teclado, o escribí \"cancelar\" para anular.");
  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "domain_pm" });
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
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

## 4. Entry points y `entryArgs`

### 4.1 Una sola escena, múltiples rutas

Un scene puede ser invocado con state pre-poblado vía el segundo argumento de `ctx.scene.enter`:

```typescript
// Handler externo (e.g., bot/handlers/tax.ts)
await ctx.scene.enter(TAX_SCENE_ID, { taxId, taxName } as TaxWizardState);
```

`stepInit` debe inspeccionar el state y rutear:

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
  await ctx.reply("*¿Cómo se llama el impuesto?*", { parse_mode: "Markdown" });
  ctx.wizard.next();
}
```

Referencia: `tax.scene.ts:64-105`.

### 4.2 `selectStep` vs `next`

- `ctx.wizard.next()`: avanza al step siguiente. Default para flujo lineal.
- `ctx.wizard.selectStep(N)`: salta directo al step N. Usar cuando:
  - Una entry route necesita brincar pasos iniciales (receipt-only).
  - Un action handler debe saltar al step que procesa input específico (ej. tras seleccionar mes, ir directo al step de monto: `tax.scene.ts:382`).

### 4.3 Constantes de salto

Cuando el scene usa `selectStep(N)`, declarar `N` como constante UPPER_SNAKE_CASE con sufijo `_STEP`:

```typescript
const AMOUNT_STEP = 5;
const RECEIPT_GUARD_STEP = 7;
```

Esto documenta visualmente cuáles son los step-indices con significado.

---

## 5. Invalid input handling

Cuando un step recibe input inválido (texto vacío, monto malformateado, número fuera de rango):

1. Enviar un **mensaje de error breve** explicando qué se esperaba.
2. **Retornar sin avanzar el cursor** (`return` sin `ctx.wizard.next()`). El step se reejecuta con el próximo update.

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

**Prohibido**: re-presentar solo el teclado de un step previo sin texto contextual. El usuario debe saber qué está pasando.

---

## 6. `repromptCurrentStep`

### 6.1 Cuándo se llama

Cuando el scene recibe un evento que no encaja con el cursor actual (típicamente: foto o documento llegando en un step que espera texto o callback). Los handlers `scene.on("photo", ...)` y `scene.on("document", ...)` delegan acá.

### 6.2 Estructura obligatoria

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

### 6.3 Reglas

- El mensaje `"No esperaba un archivo aquí."` es la primera línea, siempre.
- El switch cubre **todos los steps** del wizard que esperan input directo del usuario (excluye steps que solo configuran state).
- Cada case re-envía el prompt **completo** del step (texto + teclado si aplica).
- Cuando el step 0 (`stepInit`) tiene routing condicional, el case 0 del switch replica la lógica relevante (e.g., `tax.scene.ts:469-484`).
- Default case: vacío (`break`).

---

## 7. Event handlers obligatorios

Todo scene debe registrar (después del `export`):

```typescript
[domain]Scene.hears(CANCEL_REGEX, handleCancelWord);
[domain]Scene.action(...);  // Cero o más callbacks específicos del flujo.
[domain]Scene.on("photo", [photoHandler]);
[domain]Scene.on("document", [documentHandler]);
```

### 7.1 `scene.hears(CANCEL_REGEX, ...)`

Captura `salir|cancelar|terminar|stop` en cualquier step. Handler:

```typescript
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}
```

### 7.2 `scene.action(...)`

Toda función registrada con `scene.action(...)` DEBE empezar con `await ctx.answerCbQuery();` — sin condiciones, sin try/catch alrededor de esa llamada. Es la primera línea siempre:

```typescript
async function handlePaidYes(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // resto del handler.
}
```

Omitirlo causa que el botón se vea "girando" en el cliente de Telegram.

### 7.3 `scene.on("photo", ...)` y `scene.on("document", ...)`

**Siempre presentes**, aunque el flujo no acepte archivos. Cuando no se aceptan archivos: ambos handlers son `repromptCurrentStep`. Cuando sí se aceptan (e.g., receipt upload): handlers dedicados que validan el cursor y caen a `repromptCurrentStep` si no es el momento.

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

---

## 8. UX

### 8.1 Breadcrumbs

**Prohibidos dentro de los steps del wizard.** Una vez que el usuario entra al scene ya se comprometió al flujo; la única salida es escribir `cancelar`. Mostrar `Impuestos / Monotributo / Nueva cuota` en cada paso es ruido visual sin valor de navegación. Los breadcrumbs son para árboles de decisión jerárquicos **antes** de un commit a un flujo, no dentro de uno.

**Excepción permitida — mensaje de entrada al scene.** El handler externo que invoca `ctx.scene.enter(...)` puede usar `ctx.editMessageText` con breadcrumb + contexto justo antes de entrar:

```typescript
// bot/handlers/tax.ts
async function handleRegisterInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"])
      + `Vas a registrar una nueva cuota para ${taxName}`,
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(TAX_SCENE_ID, { taxId, taxName } as TaxWizardState);
}
```

Esto cierra el árbol de menús del que viene el usuario y abre el flujo. Una vez dentro del scene, todos los prompts van sin breadcrumb.

### 8.2 Prompts con bold

Todo prompt que pide acción al usuario (`¿…?` o `*Ingresá…*`) se envía con `*...*` y `parse_mode: "Markdown"`:

```typescript
await ctx.reply("*¿Cuál es el monto de la cuota?*\n_Ej: 5000 o 53.136,74_", {
  parse_mode: "Markdown",
});
```

### 8.3 Order de botones

En cada fila de keyboard con cancelar/volver y confirmar/siguiente:
- **Izquierda:** acción negativa o dismissive (Cancelar, Volver, Omitir).
- **Derecha:** acción positiva o afirmativa (Confirmar, Continuar, Siguiente, Adjuntar).

### 8.4 Emojis

- ✅ solo en confirmaciones de éxito.
- ❌ solo en mensajes de error.
- Nunca en labels de botón ni en prompts.

---

## 9. `editMessageText` vs `reply`

### 9.1 Dentro de un step (handler que procesa input del usuario)

Usar siempre `ctx.reply()`. El usuario acaba de escribir; estás respondiendo con un nuevo mensaje. No hay nada que editar.

### 9.2 Dentro de un action handler (callback de botón)

Patrón canónico edit-then-reply:

1. `ctx.editMessageText(...)` — edita el mensaje que contenía el botón presionado (lo "consume" visualmente).
2. `ctx.reply(...)` — envía el siguiente prompt o teclado.

```typescript
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // ...extraer match, setear state.
  await ctx.editMessageText(`*Vas a registrar la cuota para ${monthLabel}*`, {
    parse_mode: "Markdown",
  });
  await ctx.reply(`*¿Cuál es el monto?*`, { parse_mode: "Markdown" });
  ctx.wizard.selectStep(AMOUNT_STEP);
}
```

Referencia: `tax.scene.ts:358-383`.

### 9.3 Excepción

`replyOrEdit` (de `helpers/telegram.ts`) se usa cuando el handler puede ser invocado desde un callback (entonces edita) o desde un mensaje normal (entonces responde). Útil en `handleConfirm`/`handleCancel` cuando el confirm puede llegar también por texto. En la mayoría de los casos elegir explícitamente entre `editMessageText` y `reply`.

---

## 10. `ctx.scene.leave()` ordering

### 10.1 Orden canónico (salida normal)

```typescript
// 1. Enviar mensaje final (éxito o cancelación) primero.
await ctx.reply("✅ *Cuota registrada*: …", { parse_mode: "Markdown" });
// 2. Luego dejar la escena.
await ctx.scene.leave();
```

Razón: el `leave()` solo libera el state de Telegraf. No tiene impacto visual. Mandar el mensaje primero asegura que el usuario lo vea como parte del flujo activo, no como una notificación posterior a un cambio de estado.

### 10.2 Excepción: state corrupto detectado

Cuando el handler detecta que el state es incompleto o inconsistente (no se debe continuar):

```typescript
if (!hasRequiredData) {
  await ctx.reply("Error: datos de sesión incompletos.");
  await ctx.scene.leave();
  return;
}
```

Ambos órdenes son aceptables acá (no hay UX downstream). El patrón debe ser consistente dentro de un mismo scene.

---

## 11. Logging y error handling

### 11.1 Try/catch obligatorio

En toda operación I/O que puede fallar:
- Firestore writes (`saveTax`, `markTaxInstallmentAsPaid`).
- GCS uploads (`uploadTaxReceipt`).
- Descarga de archivos (`downloadFile`, `ctx.telegram.getFileLink`).
- Llamadas a servicios externos.

### 11.2 Logger estructurado

Usar `log.error` de `helpers/logger.ts` con metadata:

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

- `module`: nombre del archivo sin extensión (e.g., `"tax.scene"`, `"income.scene"`).
- `userId`: `ctx.from?.id.toString() ?? ""`.
- Otros campos relevantes (e.g., `installmentId`, `taxId`) opcionales.

### 11.3 En el catch

- Enviar `ctx.reply()` con mensaje amigable.
- **No** llamar `ctx.scene.leave()` — el usuario debe poder reintentar dentro del mismo scene.
- **No** propagar el error.

Referencia: `tax.scene.ts:569-580`, `tax.scene.ts:613-628`.

---

## 12. Helpers compartidos obligatorios

Importar de los módulos canónicos. No redefinir versiones locales.

| Helper | Origen | Cuándo usar |
|---|---|---|
| `getMessageText(ctx)` | `helpers/wizard.ts` | Extraer el texto trimmed del mensaje entrante. Único método permitido. |
| `parseArgentineAmount(str)` | `helpers/parse-amount.ts` | Parsear montos de input del usuario. |
| `formatARS(amount)` | `helpers/format.ts` | Mostrar montos al usuario. |
| `MONTH_NAMES` | `helpers/format.ts` | Nombre de mes en castellano (índice 0-based). |
| `getDaysInMonth("YYYY-MM")` | `helpers/format.ts` | Validar día contra el mes seleccionado. |
| `buildBackdatedTimestamp("YYYY-MM")` | `helpers/format.ts` | Crear Firestore Timestamp para registro retroactivo. |
| `buildBreadcrumb([...])` | `helpers/breadcrumb.ts` | **Solo en handlers externos al scene** (sección 8.1). Nunca dentro del scene. |
| `replyOrEdit(ctx, text, extra?)` | `helpers/telegram.ts` | Cuando el handler puede correr desde callback o desde texto. |
| `buildPaymentMethodKeyboard({callbackPrefix})` | `helpers/payment-method.ts` | Teclado de método de pago con prefijo de callback variable. |
| `log.info`, `log.warn`, `log.error` | `helpers/logger.ts` | Logging estructurado. |

---

## 13. Patrón seguro de `ctx.from?.id`

Siempre con optional chaining y nullish coalescing:

```typescript
const telegramUserId = ctx.from?.id.toString() ?? "";
```

**Prohibido**: `ctx.from!.id` (non-null assertion). Si `ctx.from` es undefined, el comportamiento debe ser silencioso (string vacío que falla en validaciones downstream), no un crash.

---

## 14. Extracción de regex match

Telegraf populates `ctx.match` con el resultado del regex del `scene.action()`. El tipo no está expuesto en `KakebotContext`, así que el patrón canónico es:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const match = (ctx as any).match as string[];
const installmentId = match[1];
```

O en una sola expresión cuando solo se necesita un capture group:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const installmentId = ((ctx as any).match as string[])[1];
```

Reglas:
- El `eslint-disable-next-line` va en la línea inmediatamente anterior.
- El cast se hace **una sola vez** por handler — no en cada uso del match.
- Solo en handlers de `scene.action()` con regex. Otros usos están prohibidos.

---

## 15. Registro en el Stage

El scene se importa en `functions/src/bot/telegram.ts` y se agrega al array del `Scenes.Stage`:

```typescript
import { incomeScene } from "./scenes/income.scene";
import { taxScene } from "./scenes/tax.scene";
// import { [newScene] } from "./scenes/[new].scene";

const stage = new Scenes.Stage<KakebotContext>([incomeScene, taxScene /*, [newScene]*/]);
telegramBot.use(stage.middleware());
```

El orden en el array no afecta el comportamiento (cada scene tiene su SCENE_ID único).

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

### Eventos
- [ ] `scene.hears(CANCEL_REGEX, handleCancelWord)` registrado.
- [ ] `scene.on("photo", ...)` registrado.
- [ ] `scene.on("document", ...)` registrado.
- [ ] Todo `scene.action(...)` handler empieza con `await ctx.answerCbQuery();`.

### `repromptCurrentStep`
- [ ] Función presente.
- [ ] Primera línea: `await ctx.reply("No esperaba un archivo aquí.");`.
- [ ] Switch cubre todos los steps que esperan input del usuario.
- [ ] Default case vacío (`break`).

### UX
- [ ] **Cero llamadas a `buildBreadcrumb` dentro del scene file.**
- [ ] Todo prompt con `*...*` incluye `parse_mode: "Markdown"`.
- [ ] Botones: cancelar izquierda, confirmar derecha.
- [ ] Emojis solo en `✅`/`❌`.

### `editMessageText` vs `reply`
- [ ] Steps usan `ctx.reply()`.
- [ ] Action handlers que consumen un botón usan `ctx.editMessageText()` + `ctx.reply()` para el siguiente paso.

### `scene.leave()`
- [ ] En salidas normales: mensaje final **antes** del `leave()`.
- [ ] En validación de state corrupto: `reply` + `leave` + `return`.

### Logging y errores
- [ ] Toda operación I/O (Firestore, GCS, archivos) envuelta en try/catch.
- [ ] `log.error` con `module: "[domain].scene"` y `userId`.
- [ ] El `catch` no llama `scene.leave()` — permite reintento.

### Helpers
- [ ] `getMessageText` importado de `helpers/wizard.ts` (no redefinido).
- [ ] Otros helpers (`formatARS`, `parseArgentineAmount`, etc.) desde sus módulos canónicos.

### Seguridad de tipos
- [ ] `ctx.from?.id.toString() ?? ""` (nunca `ctx.from!.id`).
- [ ] Cast `(ctx as any).match as string[]` solo en handlers con regex en `scene.action`.
- [ ] `eslint-disable-next-line @typescript-eslint/no-explicit-any` en la línea exacta del cast.

### Integración
- [ ] Scene importado y registrado en `bot/telegram.ts`.
- [ ] Si reemplaza un flujo legacy: bloques de `session.state` correspondientes eliminados de `handlers/text.ts` y `handlers/photo.ts`.
- [ ] Sub-types de `SessionState` legacy eliminados de `types/index.ts` (o `session.types.ts`).

### Verificación local
- [ ] `npm run build` (cd functions) limpio.
- [ ] `npm run lint` limpio.
- [ ] Hook `check-wizard-scene.js` no falla al editar el archivo.
- [ ] Flujo testeado end-to-end en `botitio_testitoBot`.

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
| Cancel word handler | `tax.scene.ts:636-639` |
| Registro de event handlers | `tax.scene.ts:653-665` |
| `WizardState` interface | `types/telegraf-context.types.ts` (buscar `[Domain]WizardState`) |
| `getMessageText` helper | `helpers/wizard.ts` |
