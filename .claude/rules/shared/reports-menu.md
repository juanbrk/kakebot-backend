# Menú de Reportes — Estructura y Convenciones

## Estructura actual

```
menu_reportes (Reportes)
├── rep_balances (Balances)
│   ├── rep_current → Balance del mes en curso (2 mensajes: detalle + balance)
│   └── rep_history → Selector de año (solo si >1 año) → rep_year:YYYY → meses (rep_year_pg:YYYY:N) → rep_month:YYYY-MM → rep_view / rep_exp / rep_inc
├── rep_pagos (Pagos)
│   └── menu_upcoming → Próximos Vencimientos (handler separado: upcoming-dues.ts)
├── rep_servicios (Servicios)
│   ├── menu_payment_methods → Métodos de pago (handler separado: payment-method-report.ts)
│   └── menu_service_status → Estado de servicios (handler separado: service-status-report.ts)
└── rep_impuestos (Impuestos)
    └── menu_tax_status → Estado de impuestos (handler separado: tax-status-report.ts)
```

## Archivo principal

`bot/handlers/report-history.ts` — contiene todos los handlers del menú de Reportes excepto:
- `menu_upcoming` → `bot/handlers/upcoming-dues.ts`
- `menu_payment_methods` → `bot/handlers/payment-method-report.ts`
- `menu_service_status` → `bot/handlers/service-status-report.ts`
- `menu_tax_status` → `bot/handlers/tax-status-report.ts`

Los handlers externos se registran en `bot/telegram.ts` y sus acciones de back-navigation
usan callbacks de este menú (`menu_reportes`, `rep_pagos`, `rep_servicios`, `rep_impuestos`).

## Convención de texto en cada pantalla

Cada pantalla de menú (no de reporte) sigue este patrón:

```typescript
buildBreadcrumb(["Reportes", "Sección"]) +
  "<b>¿Qué querés ver?</b>\n\n" +
  "• <b>Opción A</b>: descripción breve de lo que muestra\n" +
  "• <b>Opción B</b>: descripción breve de lo que muestra"
```

Reglas:
- La pregunta `<b>¿Qué querés ver?</b>` va en bold (HTML `<b>...</b>`)
- Cada opción del menú tiene un bullet `•` (U+2022) + nombre **en negrita** + `: ` + descripción breve
- El nombre del bullet debe coincidir exactamente con el label del botón
- Las descripciones van en texto plano (sin negrita ni itálica)
- `parse_mode: "HTML"` siempre presente

El formato negrita + `:` reemplaza al viejo `• Nombre — descripción` en texto plano. La
divergencia arrancó como excepción puntual del submenú Servicios (decisión 2026-07-29, para que
sus dos líneas quedaran visualmente iguales) y terminó siendo lo que usan **las cinco** pantallas
vivas — Reportes, Balances, Pagos, Servicios e Impuestos. Se documenta como la regla porque ya no
quedaba ninguna pantalla siguiendo la anterior.

## Historial (Balances anteriores)

Usa el flujo compartido Año → Mes (`keyboards.md`): `getAvailableYears` + `buildYearSelectorKeyboard`
para los años, y `buildReportMonthListKeyboard` (`bot/keyboards/report.ts`) para los meses — del más
nuevo al más viejo, 6 por página, botón con solo el nombre del mes (el año va en el breadcrumb).

## Breadcrumbs

| Pantalla | Breadcrumb |
|----------|-----------|
| Menú principal | `["Reportes"]` |
| Submenú Balances | `["Reportes", "Balances"]` |
| Submenú Pagos | `["Reportes", "Pagos"]` |
| Submenú Servicios | `["Reportes", "Servicios"]` |
| Submenú Impuestos | `["Reportes", "Impuestos"]` |
| Estado de servicios | `["Reportes", "Servicios", "Estado de servicios"]` |
| Estado de impuestos | `["Reportes", "Impuestos", "Estado de impuestos"]` |
| Historial (año selector) | `["Reportes", "Balances", "Anteriores"]` |
| Historial (mes selector) | `["Reportes", "Balances", "Anteriores", year]` |
| Historial (mes opciones) | `["Reportes", "Balances", "Anteriores", monthLabel]` |

## Callbacks de back-navigation

| Handler externo | Back button apunta a |
|-----------------|----------------------|
| `menu_upcoming` | `rep_pagos` |
| `menu_payment_methods` | `rep_servicios` |
| `menu_service_status` | `rep_servicios` |
| `menu_tax_status` | `rep_impuestos` |
| `rep_history` (no data) | `rep_balances` |
| `rep_history` (selector de año, multi-año) | `rep_balances` |
| `rep_year` (meses, año único) | `rep_balances` — `rep_history` saltearía de nuevo a esta pantalla |
| `rep_year` (meses, multi-año) | `rep_history` |
| `rep_month` (opciones del mes) | `rep_year:{año del mes}` |

## Cómo agregar un nuevo reporte

### 1. Decidir en qué submenú cae

| Contenido del reporte | Submenú |
|-----------------------|---------|
| Resumen de gastos/ingresos por período | Balances |
| Pagos pendientes o vencimientos | Pagos |
| Información estructural de servicios | Servicios |
| Información estructural de impuestos | Impuestos |

### 2. Si es un reporte simple (una pantalla de resultado)

Crear `bot/handlers/[nombre]-report.ts` con:
- `registerXxxReportHandler(bot)` que registra `bot.action("menu_xxx", handler)`
- El handler usa `replyOrEdit` (edición cosmética, sin write previo) con breadcrumb completo —
  `ctx.editMessageText` pelado está prohibido y lo bloquea el hook `check-raw-edit-message.js`
- Back button apunta al submenú correspondiente (`rep_balances`, `rep_pagos`, `rep_servicios` o
  `rep_impuestos`)
- Registrar en `bot/telegram.ts` junto a los otros handlers de reportes

Si el reporte agrupa entidades por el estado de su cuota del mes (vencida / próxima a vencer /
pagada / pendiente / sin cuota), **no rehagas el agrupamiento**: mapeá tus entidades a
`StatusReportEntry[]` (`{ name, installment }`) y pasáselas a `buildStatusReportText` de
`helpers/status-report.ts`. Es la fuente única del umbral de 7 días y del formato de línea, y
lo que garantiza que "Estado de servicios" y "Estado de impuestos" no diverjan. El servicio del
reporte queda reducido a fetch + map (ver `services/tax-status-report.service.ts`).

### 3. Agregar el botón al submenú

En `bot/handlers/report-history.ts`, en la función `handleXxxMenu` correspondiente:
- Agregar `[Markup.button.callback("Nombre del reporte", "menu_xxx")]`
- Agregar bullet con descripción en el texto del menú:
  `"• <b>Nombre del reporte</b>: descripción breve de lo que muestra\n"`

### 4. Registrar el handler externo en report-history.ts (solo si usa un callback de este archivo)

Si el handler nuevo necesita navegar de vuelta a un submenú desde `report-history.ts`
(ej: el submenú ya maneja el action del back button), no hay nada extra que hacer aquí.

## Descripción de cada reporte existente

| Reporte | Action | Descripción |
|---------|--------|-------------|
| Balance actual | `rep_current` | Detalle de gastos e ingresos del mes en curso |
| Balances anteriores | `rep_history` | Reportes de meses pasados y registro retroactivo |
| Próximos Vencimientos | `menu_upcoming` | Servicios e impuestos a vencer en los próximos 7 días |
| Métodos de pago | `menu_payment_methods` | Servicios agrupados por forma de pago, con cuota del mes actual |
| Estado de servicios | `menu_service_status` | Servicios agrupados por vencimiento y estado de pago de la cuota del mes actual (Vencidos / Próximos a vencer / Pagados / Pendientes / Sin cuota) |
| Estado de impuestos | `menu_tax_status` | Impuestos agrupados por vencimiento y estado de pago de la cuota del mes actual, con las mismas 5 secciones que Estado de servicios |
