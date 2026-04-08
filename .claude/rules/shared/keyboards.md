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
