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
