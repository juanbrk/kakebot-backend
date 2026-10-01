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
| `buildStatementDocCardPickerKeyboard` | `keyboards/card.ts` | Yes |
| `buildStatementListKeyboard` | `keyboards/card.ts` | Yes — via `buildPaginatedKeyboardRows` |
| `buildInstallmentListKeyboard` | `keyboards/service.ts` | Yes — via `buildPaginatedKeyboardRows` |
| `buildTaxInstallmentHistoryKeyboard` | `keyboards/tax.ts` | Yes — via `buildPaginatedKeyboardRows` |
| `buildReportMonthListKeyboard` | `keyboards/report.ts` | Yes — via `buildPaginatedKeyboardRows` |

New paginated grids should call `buildPaginatedKeyboardRows` (`bot/keyboards/pagination.ts`) instead of re-implementing the loop above.

### Selectores dentro de una escena — sin fila "Volver"

Un selector que se muestra **dentro** de una WizardScene no lleva fila de navegación hacia atrás: esos callbacks los atiende un handler global, que sacaría al usuario del flujo dejando la escena activa y sin teclado. Dentro de una escena la única salida es escribir `cancelar` (`wizard-scenes.md §8.1`).

Por eso `buildTaxReceiptTaxPickerKeyboard` y `buildTaxReceiptInstallmentPickerKeyboard` existen en paralelo a `buildTaxListKeyboard` / `buildTaxInstallmentHistoryKeyboard` en lugar de reutilizarlas: los builders del menú emiten callbacks globales (`tax_pick:`, `tax_inst:`) y agregan "← Volver a impuestos". Los de la escena usan el prefijo `taxr_` y no traen fila de vuelta.

Mismo caso en tarjetas: `buildStatementDocCardPickerKeyboard` (prefijo `stmtdoc_`, sin fila de vuelta) existe en paralelo a `buildCardListKeyboard`, que emite `card_pick:` / `card_pg:` y una fila "← Volver" apuntando a `menu_tarjetas`.

| Selector de escena | Prefijo | Gemelo de menú (callbacks globales) |
|---|---|---|
| `buildTaxReceiptTaxPickerKeyboard` | `taxr_` | `buildTaxListKeyboard` (`tax_pick:`) |
| `buildTaxReceiptInstallmentPickerKeyboard` | `taxr_` | `buildTaxInstallmentHistoryKeyboard` (`tax_inst:`) |
| `buildStatementDocCardPickerKeyboard` | `stmtdoc_` | `buildCardListKeyboard` (`card_pick:`) |

## Empty-State Submenus

When a submenu offers actions that only make sense once the user has data (e.g. "Mis impuestos", "Seleccionar tarjeta"), the entry screen must reflect the empty state instead of leading the user into options that dead-end.

Rules:

1. **The handler queries for data before rendering**, then branches on `length === 0`.
2. **Empty state uses a dedicated keyboard builder** that omits the actions that require data — it keeps only the create action and the back button. Do NOT reuse the full submenu keyboard and let the user tap into an empty list.
3. **The empty-state text goes in plain text** (no `<b>...</b>`) between the breadcrumb and the bold action prompt. It is a descriptive status line, not an action prompt (see "Action Prompt Text — Always Bold" and `user-preferences.md`).

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
      parse_mode: "HTML",
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
| `buildServicesEmptyStateKeyboard` | `openServicesMenu`, `handleViewServices` | `keyboards/service.ts`, `handlers/service.ts` |
| `buildCardEmptyStateKeyboard` | `handleCardsHub`, `handleOpenCards` | `keyboards/card.ts`, `handlers/card.ts` |
| `buildStatementEmptyStateKeyboard` | `handleStatementsList` | `keyboards/card.ts`, `handlers/card.ts` |
| `buildTaxHistoryEmptyStateKeyboard` | `handleTaxHistory` | `keyboards/tax.ts`, `handlers/tax.ts` |

## Listado de entidades en el submenú raíz

El submenú raíz de cada dominio de entidad (`[Impuestos]`, `[Servicios]`, `[Tarjetas]`) muestra en
su propio mensaje los nombres de las entidades registradas, entre el breadcrumb y el prompt de
acción. Sirve como indicador de qué existe: el usuario decide desde una sola pantalla si entra a
"Seleccionar …" o si crea una nueva, sin tener que entrar a mirar y volver.

Reglas:

1. **Solo nombres**, con bullet `•`. Sin montos, vencimientos ni estado de pago — ese detalle vive
   en la pantalla de cada entidad, no en el índice.
2. Se compone con el helper compartido **`buildNameListText(names)`** (`helpers/format.ts`). No
   duplicar la lógica de bullets por dominio.
3. El listado va **antes** del prompt en negrita, separado por una línea en blanco.
4. En estado vacío **no se muestra listado** — se aplica el patrón de empty state de la sección
   anterior.

```typescript
const taxList = buildNameListText(taxes.map((tax) => tax.name));
await replyOrEdit(ctx, breadcrumb + taxList + "\n\n*¿Qué querés hacer?*", {
  parse_mode: "HTML",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply_markup: buildTaxesSubmenuKeyboard().reply_markup as any,
});
```

| Submenú | Handler | Nombre mostrado |
|---|---|---|
| `[Impuestos]` | `openTaxesMenu` | `tax.name` |
| `[Servicios]` | `openServicesMenu` | `service.name` |
| `[Tarjetas]` | `handleCardsHub` | `buildCardLabel(card)` — el label largo, no `buildCardButtonLabel` |

## Button Order (see also user-preferences.md)

- Left: negative/dismissive (Cancelar, Volver, Anterior)
- Right: positive/affirmative (Confirmar, Crear, Siguiente)

## Action Prompt Text — Always Bold

Any text that asks the user to take an action or make a choice **must be wrapped in `<b>...</b>`** (HTML bold) and the message must include `parse_mode: "HTML"`.

This applies to:
- Questions: `<b>¿Qué querés hacer?</b>`, `<b>¿Deseás marcar la cuota como pagada?</b>`
- Instructions to the user: `<b>Enviá la foto o PDF del comprobante de pago.</b>`
- Prompts for input: `<b>¿Cuál es el monto de la cuota para Abril 2026?</b>`

### ❌ WRONG
```typescript
await ctx.reply("¿Qué querés hacer?", { reply_markup: keyboard.reply_markup });
```

### ✅ RIGHT
```typescript
await ctx.reply("<b>¿Qué querés hacer?</b>", {
  parse_mode: "HTML",
  reply_markup: keyboard.reply_markup as any,
});
```

## Chronological Keyboard Order

The order depends on what the keyboard is for (decision 2026-09-23):

| Keyboard kind | Order | Why |
|---|---|---|
| **History** — periods that already have data (statements, service/tax installments, past balances) | **Newest → oldest** (descending) | The user almost always looks for the latest period |
| **Creation picker** — periods to create something for (current month + 2) | **Oldest → newest** (ascending) | The next one to fall due goes first |

Layout direction is always left → right, top → bottom: the first item in the order goes top-left.

```
History (descending)           Creation picker (ascending)
[ Diciembre ] [ Noviembre ]    [ Sep 2026 ] [ Oct 2026 ]
[ Octubre   ] [ Septiembre ]   [ Nov 2026 ]
```

**Implementation:** sort before slicing into the grid. For `"YYYY-MM"` strings: history uses
`getItemsForYearDesc` (`helpers/period.ts`), creation pickers use `a.localeCompare(b)`.

Out of scope, still ascending: the installment picker of the `tax-receipt` scene.

### Creation picker example: month selector when attaching a file

After the user picks the service in `invoice.scene.ts` (Factura or Comprobante sent directly to the
bot), `buildMonthKeyboard` offers the current month + the next 2, ascending, one month per row,
via `getUpcomingMonths` (`helpers/period.ts`). Rules specific to this picker:

- **Filtered**: months whose installment already holds this flow's file (Factura → `invoiceUrl`,
  Comprobante → `receiptUrl`) are dropped (`getAttachableMonths`). Months **without** an
  installment stay — picking one starts the day → amount steps and attaches on creation.
- **Labels carry the year** (`getMonthLabel(month)`, not the short form): the three months can
  cross December into January. This differs from history month lists, where the year lives in the
  breadcrumb.
- **No "Volver" row** (it is inside a scene — see "Selectores dentro de una escena"); callbacks
  use the `invr_month:{serviceId}:{YYYY-MM}` prefix.
- **One live selector at a time**: re-presenting it edits the tapped message (`repromptMonthPicker`
  with `consumeButton`) so old selectors never pile up with working buttons.

## Hierarchical Year/Month Selection

Every history keyboard navigates in two steps: **Year → Month**. Implemented in cards
(statements), services (installments), taxes (installment history) and Reportes → Balances →
Anteriores.

### Flow

1. **Entry callback** (`card_stmts:{id}`, `svc_cuotas:{id}`, `tax_hist:{id}`, `rep_history`)
   fetches the items once and branches:
   - no items → the domain's empty state;
   - items in **one** year → skip the selector, render that year's month list directly;
   - items in **more than one** year → year selector.
2. **Year selector**: `buildYearSelectorKeyboard` (`bot/keyboards/period.ts`), fed by
   `getAvailableYears` — years come from real data, newest first, 2 columns. No pagination yet —
   only needed past 6 years of data.
3. **Month list** (`*_y:{id}:{year}`): `getItemsForYearDesc` + `buildPaginatedKeyboardRows`
   (`bot/keyboards/pagination.ts`), 6 per page, newest first. Pages go through
   `*_pg:{id}:{year}:{page}`.
4. **Detail** of one item.

### Callbacks

| Domain | Entry | Year | Page |
|---|---|---|---|
| Cards | `card_stmts:{cardId}` | `card_stmts_y:{cardId}:{year}` | `card_stmts_pg:{cardId}:{year}:{page}` |
| Services | `svc_cuotas:{serviceId}` | `svc_cuotas_y:{serviceId}:{year}` | `svc_cuotas_pg:{serviceId}:{year}:{page}` |
| Taxes | `tax_hist:{taxId}` | `tax_hist_y:{taxId}:{year}` | `tax_hist_pg:{taxId}:{year}:{page}` |
| Reports | `rep_history` | `rep_year:{year}` | `rep_year_pg:{year}:{page}` |

Regex rules: capture the ID with `([^:]+)` and the year with `(\d{4})` — never a greedy `(.+)`
before the year, or the ID swallows it.

### Back navigation

| Screen | Back goes to |
|---|---|
| Year selector | The parent screen (card, service, tax, Balances) |
| Month list, >1 year | The entry callback (year selector) |
| Month list, 1 year | The parent screen — the entry callback would skip straight back here (loop) |
| Detail | `*_y:{id}:{getYear(month)}` — the year is derived from the item already read, not encoded in the callback |

### Labels and breadcrumbs

- Month buttons show **only the month name** (`getMonthLabel(month, true)`); the year lives in the
  breadcrumb (`[..., year]`).
- Paid mark: history month buttons in **cards and taxes** append `✅` when the item is paid
  (`Abril ✅`). This is the one exception to "no emojis in button labels" (`user-preferences.md`):
  the mark is status, not decoration. Services' month list does not show it yet.
- Year selector prompt: `<b>Seleccioná el año</b>`.

### Create actions

- Cards: "Añadir Resumen" goes on the **entry screen** — the year selector (via `actionRows`) when
  there is more than one year, the month list when there is only one. Never repeated inside every
  year: statements can only be created for the current period.
- Taxes: "Nueva cuota" is **not** in the history at all — only in the empty state. New installments
  only go to upcoming months, and the tax view already offers "Nueva cuota".

### Adding a new history

1. Entry handler: fetch once, `getAvailableYears`, branch on 0 / 1 / >1 years.
2. Register `*_y:([^:]+):(\d{4})` and `*_pg:([^:]+):(\d{4}):(\d+)`.
3. Month list: `getItemsForYearDesc` + `buildPaginatedKeyboardRows`; use
   `hasMultipleYears` (`helpers/period.ts`) to pick the back target.
4. Detail back button: `*_y:{id}:{getYear(month)}`.
