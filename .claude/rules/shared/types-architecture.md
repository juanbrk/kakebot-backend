# Types Architecture

## Principio

Cada entidad de dominio tiene su propio archivo de tipos. Nunca agregar interfaces
nuevas a `types/index.ts`.

## Estructura

```
functions/src/types/
├── expense.types.ts     # Expense, BulkExpenseEntry, SaveExpenseParams
├── income.types.ts      # Income, SaveIncomeParams
├── report.types.ts      # MonthlyReport, ShowMonthSelectorParams
└── index.ts             # Tipos legacy — congelado, migración gradual
```

## Reglas

### Archivos nuevos
- Cada nueva interfaz o type alias va en `types/[entidad].types.ts`
- Naming: `expense.types.ts`, `income.types.ts`, `card.types.ts`, etc.
- Si no existe el archivo de la entidad, crearlo

### `types/index.ts` — congelado
- **No agregar nada nuevo aquí**
- Las interfaces existentes se migran gradualmente cuando se toca el archivo relevante
- Sin re-exports de compatibilidad — actualizar el import directamente

### Interfaces de parámetros
- Siguen el patrón `[NombreFuncion]Params` (e.g., `SaveExpenseParams`, `ShowMonthSelectorParams`)
- Van en el archivo de tipos de la entidad que representan
- Se exportan junto con la función en el mismo dominio

## Migración gradual

Al tocar un servicio o handler que importa de `types/index.ts`:

1. Verificar si la interfaz ya tiene su propio archivo de tipos
2. Si no existe: crear `types/[entidad].types.ts` y mover la interfaz allí
3. Actualizar todos los imports del símbolo migrado
4. Eliminar la interfaz de `types/index.ts`

**No migrar masivamente** — solo al tocar el archivo. Esto mantiene los PRs enfocados.

## Pendiente de migrar (de types/index.ts)

| Interfaz / Type | Archivo destino | Migrar cuando se toque |
|-----------------|-----------------|------------------------|
| `SubcategoryMapping`, `Category`, `CategoryType`, `PendingDescEntry`, `SessionExpenseEntry` | `category.types.ts` | `category.service.ts` o `categorize.ts` |
| `Service`, `ServiceInstallment`, `ServicePaymentMethod` | `service.types.ts` | `service.service.ts` o `service.ts` handler |
| `CreditCard`, `CardStatement`, `CreditCardProcessor`, `StatementCurrency` | `card.types.ts` | `card.service.ts` o `card.ts` handler |
| `PendingFileType` | `session.types.ts` | `session.service.ts` |
| `Session`, `SessionState` y sub-types | `session.types.ts` | `session.service.ts` |
