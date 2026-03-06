import { Markup } from "telegraf";
import { Service, ServiceInstallment } from "../../types/index";
import { formatARS, MONTH_NAMES } from "../../helpers/format";

const SERVICES_PER_PAGE = 6;

export function buildServicesSubmenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Añadir servicio", "svc_add")],
    [Markup.button.callback("Ver servicios", "svc_view")],
    [Markup.button.callback("Listar servicios", "svc_list")],
  ]);
}

export function buildServiceListKeyboard(
  services: Service[],
  page: number,
  callbackPrefix: string
) {
  const start = page * SERVICES_PER_PAGE;
  const end = start + SERVICES_PER_PAGE;
  const pageServices = services.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageServices.length; i += 2) {
    const row = [];
    const service1 = pageServices[i];
    row.push(
      Markup.button.callback(service1.name, `${callbackPrefix}:${service1.id}`)
    );
    if (i + 1 < pageServices.length) {
      const service2 = pageServices[i + 1];
      row.push(
        Markup.button.callback(service2.name, `${callbackPrefix}:${service2.id}`)
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback("← Anterior", `svc_pg:${page - 1}`));
  }
  if (end < services.length) {
    navRow.push(Markup.button.callback("Más →", `svc_pg:${page + 1}`));
  }

  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([Markup.button.callback("Volver", "svc_back")]);

  return Markup.inlineKeyboard(rows);
}

export function buildServiceActionKeyboard(
  serviceId: string,
  hasInstallment: boolean,
  isPaid: boolean
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  if (hasInstallment) {
    const actionRow = [];
    if (!isPaid) {
      actionRow.push(
        Markup.button.callback("Marcar como pagado", `svc_pay_from:${serviceId}`)
      );
    }
    actionRow.push(
      Markup.button.callback("Modificar", `svc_edit:${serviceId}`)
    );
    rows.push(actionRow);
  } else {
    rows.push([
      Markup.button.callback("Registrar cuota", `svc_reg:${serviceId}`),
      Markup.button.callback("Modificar", `svc_edit:${serviceId}`),
    ]);
  }

  rows.push([Markup.button.callback("Volver", "svc_view")]);
  return Markup.inlineKeyboard(rows);
}

export function buildServiceEditKeyboard(serviceId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Registrar cuota", `svc_reg:${serviceId}`),
      Markup.button.callback("Modificar cuota", `svc_edit_cuota:${serviceId}`),
    ],
    [
      Markup.button.callback("Modificar nombre", `svc_edit_name:${serviceId}`),
      Markup.button.callback("Eliminar", `svc_delete:${serviceId}`),
    ],
    [Markup.button.callback("Volver", "svc_back")],
  ]);
}

export function buildMonthKeyboard(serviceId: string) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${year}`;

    months.push([
      Markup.button.callback(label, `svc_month:${serviceId}:${dueMonth}`),
    ]);
  }

  months.push([Markup.button.callback("Volver", "svc_back")]);

  return Markup.inlineKeyboard(months);
}

export function buildDuplicateKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "svc_skip"),
      Markup.button.callback("Reemplazar", `svc_replace:${installmentId}`),
    ],
  ]);
}

export function buildDeleteConfirmKeyboard(serviceId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "svc_back"),
      Markup.button.callback("Eliminar", `svc_delete_yes:${serviceId}`),
    ],
  ]);
}

export function buildServiceViewText(
  services: Service[],
  installmentsByServiceId: Record<string, ServiceInstallment | null>
): string {
  if (services.length === 0) {
    return "No hay servicios registrados.\nUsa /servicios para crear uno.";
  }

  const lines = ["*Mis servicios:*", ""];

  services.forEach((service) => {
    const installment = installmentsByServiceId[service.id || ""];
    if (installment) {
      const dueDate = installment.dueDate.toDate();
      const day = String(dueDate.getDate()).padStart(2, "0");
      const month = String(dueDate.getMonth() + 1).padStart(2, "0");
      const dueLine = installment.isPaid ?
        `• ${service.name}  ${formatARS(installment.amount)} (Pagado) ✅` :
        `• ${service.name}  ${formatARS(installment.amount)} (vence ${day}/${month})`;
      lines.push(dueLine);
    } else {
      lines.push(`• ${service.name}  Sin cuota este mes`);
    }
  });

  return lines.join("\n");
}

export function buildInstallmentDetailText(installment: ServiceInstallment): string {
  const dueDate = installment.dueDate.toDate();
  const day = String(dueDate.getDate()).padStart(2, "0");
  const month = String(dueDate.getMonth() + 1).padStart(2, "0");
  const statusLine = installment.isPaid ? "Estado: ✅ Pagado" : "Estado: Pendiente";

  return (
    `*Cuota: ${installment.serviceName}*\n\n` +
    `Monto: ${formatARS(installment.amount)}\n` +
    `Vencimiento: ${day}/${month}\n` +
    statusLine
  );
}

export function buildInstallmentDetailKeyboard(
  installmentId: string,
  isPaid: boolean,
  hasReceipt: boolean,
  hasInvoice: boolean
) {
  const rows = [
    [Markup.button.callback("Modificar monto", `svc_edit_amt:${installmentId}`)],
    [Markup.button.callback(
      "Modificar vencimiento", `svc_edit_day:${installmentId}`
    )],
  ];

  if (!hasInvoice) {
    rows.push([
      Markup.button.callback(
        "Adjuntar factura", `svc_attach_inv:${installmentId}`
      ),
    ]);
  }

  if (!isPaid) {
    rows.push([
      Markup.button.callback("Marcar como pagado", `svc_pay:${installmentId}`),
    ]);
  }

  if (isPaid && !hasReceipt) {
    rows.push([
      Markup.button.callback(
        "Adjuntar comprobante", `svc_attach:${installmentId}`
      ),
    ]);
  }

  rows.push([Markup.button.callback("Volver", "svc_back")]);
  return Markup.inlineKeyboard(rows);
}

export function buildInvoicePromptKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "svc_skip_invoice"),
      Markup.button.callback("Adjuntar", `svc_attach_inv:${installmentId}`),
    ],
  ]);
}

export function buildReceiptPromptKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "svc_skip_receipt"),
      Markup.button.callback("Adjuntar", `svc_attach:${installmentId}`),
    ],
  ]);
}
