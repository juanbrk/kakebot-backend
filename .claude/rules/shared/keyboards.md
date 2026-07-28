# Keyboard Layout Rules

## Multi-Option Keyboards

When presenting multiple selectable options (services, categories, etc.) as inline keyboard buttons:

1. **Layout**: 2 columns (2 buttons per row)
2. **Page size**: 6 items per page (3 rows of 2)
3. **Pagination**: Add `← Anterior` / `Más →` navigation when items exceed one page
4. **Action buttons**: "Crear nuevo...", "Cancelar", "Volver" go on separate rows below the grid

### Pattern

```typescript
const ITEMS_PER_PAGE = 6;

function buildPaginatedKeyboard(items, page, callbackPrefix) {
  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = items.slice(start, end);

  // 2-column grid
  for (let i = 0; i < pageItems.length; i += 2) {
    const row = [button(item[i])];
    if (i + 1 < pageItems.length) row.push(button(item[i + 1]));
    rows.push(row);
  }

  // Navigation row (only if needed)
  const navRow = [];
  if (page > 0) navRow.push("← Anterior");
  if (end < items.length) navRow.push("Más →");

  // Action rows last
  rows.push([actionButton]);
  rows.push([cancelButton]);
}
```

## Existing Implementations

| Keyboard | File | Follows pattern |
|---|---|---|
| `buildServiceListKeyboard` | `keyboards/service.ts` | Yes |
| `buildInvoiceServiceListKeyboard` | `keyboards/invoice.ts` | Yes |
| `buildTaxReceiptTaxPickerKeyboard` | `keyboards/tax.ts` | Yes |
| `buildTaxReceiptInstallmentPickerKeyboard` | `keyboards/tax.ts` | Yes |

### Selectores dentro de una escena — sin fila "Volver"

Un selector que se muestra **dentro** de una WizardScene no lleva fila de navegación hacia atrás: esos callbacks los atiende un handler global, que sacaría al usuario del flujo dejando la escena activa y sin teclado. Dentro de una escena la única salida es escribir `cancelar` (`wizard-scenes.md §8.1`).

Por eso `buildTaxReceiptTaxPickerKeyboard` y `buildTaxReceiptInstallmentPickerKeyboard` existen en paralelo a `buildTaxListKeyboard` / `buildTaxInstallmentHistoryKeyboard` en lugar de reutilizarlas: los builders del menú emiten callbacks globales (`tax_pick:`, `tax_inst:`) y agregan "← Volver a impuestos". Los de la escena usan el prefijo `taxr_` y no traen fila de vuelta.

## Empty-State Submenus

When a submenu offers actions that only make sense once the user has data (e.g. "Mis impuestos", "Seleccionar tarjeta"), the entry screen must reflect the empty state instead of leading the user into options that dead-end.

Rules:

1. **The handler queries for data before rendering**, then branches on `length === 0`.
2. **Empty state uses a dedicated keyboard builder** that omits the actions that require data — it keeps only the create action and the back button. Do NOT reuse the full submenu keyboard and let the user tap into an empty list.
3. **The empty-state text goes in plain text** (no `*...*`) between the breadcrumb and the bold action prompt. It is a descriptive status line, not an action prompt (see "Action Prompt Text — Always Bold" and `user-preferences.md`).

### Pattern

```typescript
// Dedicated builder — omits data-dependent actions.
export function buildTaxesEmptyStateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Registrar impuesto", "tax_add")],
    [Markup.button.callback("← Volver al menú", "menu_back")],
  ]);
}

// Handler branches on whether the user has data.
async function openTaxesMenu(ctx: Context): Promise<void> {
  const taxes = await getTaxesByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Impuestos"]);

  if (taxes.length === 0) {
    await replyOrEdit(ctx, breadcrumb + "No tenés ningún impuesto registrado.\n\n*¿Qué querés hacer?*", {
      parse_mode: "Markdown",
      reply_markup: buildTaxesEmptyStateKeyboard().reply_markup as any,
    });
    return;
  }
  // ...normal keyboard when data exists.
}
```

### Canonical implementations

| Empty-state builder | Handler | File |
|---|---|---|
| `buildTaxesEmptyStateKeyboard` | `openTaxesMenu` | `keyboards/tax.ts`, `handlers/tax.ts` |
| `buildCardEmptyStateKeyboard` | `handleOpenCards` | `keyboards/card.ts`, `handlers/card.ts` |

## Button Order (see also user-preferences.md)

- Left: negative/dismissive (Cancelar, Volver, Anterior)
- Right: positive/affirmative (Confirmar, Crear, Siguiente)

## Action Prompt Text — Always Bold

Any text that asks the user to take an action or make a choice **must be wrapped in `*...*`** (Markdown bold) and the message must include `parse_mode: "Markdown"`.

This applies to:
- Questions: `*¿Qué querés hacer?*`, `*¿Deseás marcar la cuota como pagada?*`
- Instructions to the user: `*Enviá la foto o PDF del comprobante de pago.*`
- Prompts for input: `*¿Cuál es el monto de la cuota para Abril 2026?*`

### ❌ WRONG
```typescript
await ctx.reply("¿Qué querés hacer?", { reply_markup: keyboard.reply_markup });
```

### ✅ RIGHT
```typescript
await ctx.reply("*¿Qué querés hacer?*", {
  parse_mode: "Markdown",
  reply_markup: keyboard.reply_markup as any,
});
```

## Chronological Keyboard Order — Always Ascending

When displaying buttons that represent time periods (months, years, installments, history):

- **Order: oldest → newest** (ascending)
- **Layout direction: left → right, top → bottom**
- Meaning: earliest item appears top-left, latest item appears bottom-right

This applies to: month selectors, installment history grids, report period pickers, any date-based paginated list.

### ❌ WRONG
```
[ Dic 2026 ] [ Nov 2026 ]
[ Oct 2026 ] [ Sep 2026 ]
```

### ✅ RIGHT
```
[ Ene 2026 ] [ Feb 2026 ]
[ Mar 2026 ] [ Abr 2026 ]
```

**Implementation:** sort array ascending before slicing into the grid. For `dueMonth` strings (`"YYYY-MM"`) use `a.localeCompare(b)` (ascending).
