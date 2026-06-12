# Session Data Reuse

## Principio

**Nunca re-fetchear desde Firestore lo que ya está disponible en el contexto inmediato.**
El contexto inmediato en este codebase es uno de dos: el string del callback, o `ctx.wizard.state`.

## Patrón A: Callback auto-suficiente (handlers de acción)

Cuando un handler de callback necesita un ID para operar, ese ID debe estar codificado en el string del callback — no leído desde sesión Firestore.

```typescript
// BIEN: taxId codificado en el callback
const keyboard = [
  [{ text: "Débito automático", callback_data: `tax_update_pm:${taxId}:auto_debit` }],
  [{ text: "Tarjeta", callback_data: `tax_update_pm:${taxId}:credit_card` }],
];

// En registerTaxHandler:
bot.action(/^tax_update_pm:(.+):(credit_card|auto_debit|manual)$/, async (ctx) => {
  const taxId = ctx.match[1];
  const method = ctx.match[2];
  // taxId disponible sin tocar Firestore
});
```

```typescript
// MAL: el handler lee taxId desde sesión
bot.action(/^tax_update_pm:(credit_card|auto_debit|manual)$/, async (ctx) => {
  const session = await getSession(telegramUserId); // innecesario
  const taxId = session.taxId;                      // frágil: requiere que otro handler haya seteado la sesión
});
```

**Regla:** si el callback handler necesita un ID que antes venía de sesión, codificarlo en el `callbackData` en el momento de construir el teclado. El regex de `bot.action` captura ambos grupos.

## Patrón B: ctx.wizard.state (flujos WizardScene)

Dentro de una WizardScene, el estado entre pasos se guarda en `ctx.wizard.state` — nunca en Firestore session.

```typescript
// BIEN: guardar contexto entre steps del wizard
ctx.wizard.state.serviceId = serviceId;
ctx.wizard.state.serviceName = service.name;

// En el siguiente step:
const { serviceId, serviceName } = ctx.wizard.state as ServiceWizardState;
```

Ver `shared/wizard-scenes.md` §4 para el contrato completo de WizardState.

## Patrón C: fetch directo con Promise.all (handlers sin estado)

Cuando un handler necesita datos de Firestore y no tiene step previo que los haya fetcheado:

```typescript
// BIEN: fetch directo, paralelo cuando es posible
const [service, installments] = await Promise.all([
  getServiceById(serviceId),
  getInstallmentsByService(serviceId, telegramUserId),
]);
const serviceName = service?.name || null;
```

```typescript
// MAL: fetches secuenciales innecesarios
const service = await getServiceById(serviceId);
const installments = await getInstallmentsByService(serviceId, telegramUserId);
```

## Cuándo aplicar cada patrón

| Situación | Patrón |
|-----------|--------|
| Callback handler necesita un ID (taxId, serviceId, installmentId) | A: codificar en callbackData |
| Flujo multi-paso dentro de una WizardScene | B: ctx.wizard.state |
| Handler one-shot necesita datos de Firestore | C: fetch directo con Promise.all |
| Dato puede haber cambiado entre pasos (ej. `isPaid`) | C: siempre re-fetch |

## Ver también

- [Wizard Scenes](wizard-scenes.md) — contrato de WizardState y ciclo de vida de escenas
- [Guard Conditions](guard-conditions.md) — validación de entrada en handlers
- [Keyboards](keyboards.md) — construcción de teclados paginados
