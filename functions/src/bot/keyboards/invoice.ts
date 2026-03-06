import { Markup } from "telegraf";
import { Service } from "../../types/index";
import { MONTH_NAMES } from "../../helpers/format";

const SERVICES_PER_PAGE = 6;

export function buildDocTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Factura", "doc_type_invoice"),
      Markup.button.callback("Comprobante", "doc_type_receipt"),
    ],
  ]);
}

export function buildInvoiceServiceListKeyboard(
  services: Service[],
  page: number = 0
) {
  const start = page * SERVICES_PER_PAGE;
  const end = start + SERVICES_PER_PAGE;
  const pageServices = services.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageServices.length; i += 2) {
    const row = [
      Markup.button.callback(
        pageServices[i].name, `inv_pick:${pageServices[i].id}`
      ),
    ];
    if (i + 1 < pageServices.length) {
      row.push(
        Markup.button.callback(
          pageServices[i + 1].name, `inv_pick:${pageServices[i + 1].id}`
        )
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback("← Anterior", `inv_pg:${page - 1}`));
  }
  if (end < services.length) {
    navRow.push(Markup.button.callback("Más →", `inv_pg:${page + 1}`));
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    Markup.button.callback("Crear nuevo servicio", "inv_new_service"),
  ]);
  rows.push([
    Markup.button.callback("Cancelar", "inv_cancel"),
  ]);

  return Markup.inlineKeyboard(rows);
}

export function buildInvoiceMonthKeyboard(serviceId: string) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${year}`;

    months.push([
      Markup.button.callback(label, `inv_month:${serviceId}:${dueMonth}`),
    ]);
  }

  months.push([Markup.button.callback("Cancelar", "inv_cancel")]);

  return Markup.inlineKeyboard(months);
}

export function buildReceiptServiceListKeyboard(
  services: Service[],
  page: number = 0
) {
  const start = page * SERVICES_PER_PAGE;
  const end = start + SERVICES_PER_PAGE;
  const pageServices = services.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageServices.length; i += 2) {
    const row = [
      Markup.button.callback(
        pageServices[i].name, `comp_pick:${pageServices[i].id}`
      ),
    ];
    if (i + 1 < pageServices.length) {
      row.push(
        Markup.button.callback(
          pageServices[i + 1].name, `comp_pick:${pageServices[i + 1].id}`
        )
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback("← Anterior", `comp_pg:${page - 1}`));
  }
  if (end < services.length) {
    navRow.push(Markup.button.callback("Más →", `comp_pg:${page + 1}`));
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    Markup.button.callback("Crear nuevo servicio", "comp_new_service"),
  ]);
  rows.push([
    Markup.button.callback("Cancelar", "comp_cancel"),
  ]);

  return Markup.inlineKeyboard(rows);
}

export function buildReceiptMonthKeyboard(serviceId: string) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${year}`;

    months.push([
      Markup.button.callback(label, `comp_month:${serviceId}:${dueMonth}`),
    ]);
  }

  months.push([Markup.button.callback("Cancelar", "comp_cancel")]);

  return Markup.inlineKeyboard(months);
}
