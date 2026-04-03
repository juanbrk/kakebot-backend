import { Markup } from "telegraf";
import { Service, ServiceInstallment, ServicePaymentMethod } from "../../types/index";
import { formatARS, MONTH_NAMES } from "../../helpers/format";

export const PAYMENT_METHOD_LABELS: Record<ServicePaymentMethod, string> = {
  credit_card: "Tarjeta de Crédito",
  auto_debit: "Débito Automático",
  manual: "Pago Manual",
};

const SERVICES_PER_PAGE = 6;
export const INSTALLMENTS_PER_PAGE = 6;

export function buildServicesSubmenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Añadir servicio", "svc_add")],
    [Markup.button.callback("Seleccionar servicio", "svc_view")],
    [Markup.button.callback("Mis servicios", "svc_my_services")],
    [Markup.button.callback("\u2190 Volver al menú", "menu_back")],
  ]);
}

/**
 * Builds the "Mis servicios" submenu keyboard with list and upcoming options.
 *
 * @return {Markup} Inline keyboard markup
 */
export function buildMyServicesSubmenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Listar servicios", "svc_list")],
    [Markup.button.callback("Próximos vencimientos", "svc_upcoming")],
    [Markup.button.callback("\u2190 Volver a servicios", "menu_servicios")],
  ]);
}

export function buildServiceListKeyboard(
  services: Service[],
  page: number,
  callbackPrefix: string,
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
      Markup.button.callback(service1.name, `${callbackPrefix}:${service1.id}`),
    );
    if (i + 1 < pageServices.length) {
      const service2 = pageServices[i + 1];
      row.push(
        Markup.button.callback(
          service2.name,
          `${callbackPrefix}:${service2.id}`,
        ),
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback("← Página anterior", `svc_pg:${page - 1}`),
    );
  }
  if (end < services.length) {
    navRow.push(
      Markup.button.callback("Página siguiente →", `svc_pg:${page + 1}`),
    );
  }

  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([Markup.button.callback("\u2190 Volver a servicios", "svc_back")]);

  return Markup.inlineKeyboard(rows);
}

export function buildServiceActionKeyboard(
  serviceId: string,
  hasInstallment: boolean,
  isPaid: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  rows.push([Markup.button.callback("Nueva cuota", `svc_reg:${serviceId}`)]);

  if (hasInstallment && !isPaid) {
    rows.push([
      Markup.button.callback("Marcar como pagado", `svc_pay_from:${serviceId}`),
    ]);
  }

  rows.push([
    Markup.button.callback("Cuotas", `svc_cuotas:${serviceId}`),
    Markup.button.callback("Modificar", `svc_edit:${serviceId}`),
  ]);

  rows.push([Markup.button.callback("\u2190 Volver a selección", "svc_view")]);
  return Markup.inlineKeyboard(rows);
}

export function buildServiceEditKeyboard(
  serviceId: string,
  serviceName: string,
) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Cambiar nombre", `svc_edit_name:${serviceId}`)],
    [Markup.button.callback("Cambiar método de pago", `svc_edit_pm:${serviceId}`)],
    [Markup.button.callback("Eliminar", `svc_delete:${serviceId}`)],
    [
      Markup.button.callback(
        `\u2190 Volver a ${serviceName}`,
        `svc_back_svc:${serviceId}`,
      ),
    ],
  ]);
}

/**
 * Builds the payment method selection keyboard.
 * In "new" context (service creation): no cancel button, method is required.
 * In "edit" context (from service detail): includes a back button.
 *
 * @param {string} serviceId - The service document ID
 * @param {string} context - "new" (creation flow) or "edit" (modification flow)
 * @return {Markup} Inline keyboard markup
 */
export function buildPaymentMethodKeyboard(
  serviceId: string,
  context: "new" | "edit",
) {
  const methods: ServicePaymentMethod[] = ["credit_card", "auto_debit", "manual"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = methods.map((method) => [
    Markup.button.callback(
      PAYMENT_METHOD_LABELS[method],
      context === "new"
        ? `svc_pm_new:${serviceId}:${method}`
        : `svc_pm_edit:${serviceId}:${method}`,
    ),
  ]);

  if (context === "edit") {
    rows.push([
      Markup.button.callback("\u2190 Volver", `svc_back_svc:${serviceId}`),
    ]);
  }

  return Markup.inlineKeyboard(rows);
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

  months.push([
    Markup.button.callback("\u2190 Volver a servicios", "svc_back"),
  ]);

  return Markup.inlineKeyboard(months);
}

export function buildFilteredMonthKeyboard(
  availableMonths: string[],
  serviceId: string,
) {
  const rows = availableMonths.map((dueMonth) => {
    const [year, month] = dueMonth.split("-");
    const label = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    return [
      Markup.button.callback(label, `svc_month:${serviceId}:${dueMonth}`),
    ];
  });
  return Markup.inlineKeyboard(rows);
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
  installmentsByServiceId: Record<string, ServiceInstallment | null>,
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
      const dueLine = installment.isPaid
        ? `• ${service.name}  ${formatARS(installment.amount)} (Pagado) ✅`
        : `• ${service.name}  ${formatARS(installment.amount)} (vence ${day}/${month})`;
      lines.push(dueLine);
    } else {
      lines.push(`• ${service.name}  Sin cuota este mes`);
    }
  });

  return lines.join("\n");
}

export function buildInstallmentDetailText(
  installment: ServiceInstallment,
): string {
  const dueDate = installment.dueDate.toDate();
  const day = String(dueDate.getDate()).padStart(2, "0");
  const month = String(dueDate.getMonth() + 1).padStart(2, "0");
  const statusLine = installment.isPaid
    ? "Estado: ✅ Pagado"
    : "Estado: Pendiente";

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
  hasInvoice: boolean,
  backCallback = "svc_back",
  backLabel = "Volver",
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  rows.push([
    Markup.button.callback("Modificar monto", `svc_edit_amt:${installmentId}`),
    Markup.button.callback(
      "Cambiar vencimiento",
      `svc_edit_day:${installmentId}`,
    ),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditionalBtns: any[] = [];

  if (!isPaid) {
    conditionalBtns.push(
      Markup.button.callback("Marcar como pagado", `svc_pay:${installmentId}`),
    );
  }

  if (!hasInvoice) {
    conditionalBtns.push(
      Markup.button.callback(
        "Agregar factura",
        `svc_attach_inv:${installmentId}`,
      ),
    );
  }

  if (!hasReceipt) {
    conditionalBtns.push(
      Markup.button.callback(
        "Agregar comprobante",
        `svc_attach:${installmentId}`,
      ),
    );
  }

  for (let i = 0; i < conditionalBtns.length; i += 2) {
    const row = [conditionalBtns[i]];
    if (i + 1 < conditionalBtns.length) row.push(conditionalBtns[i + 1]);
    rows.push(row);
  }

  rows.push([Markup.button.callback(backLabel, backCallback)]);
  return Markup.inlineKeyboard(rows);
}

export function buildInstallmentListKeyboard(
  installments: ServiceInstallment[],
  page: number,
  serviceId: string,
  serviceName: string,
) {
  const start = page * INSTALLMENTS_PER_PAGE;
  const end = start + INSTALLMENTS_PER_PAGE;
  const pageInstallments = installments.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  for (let i = 0; i < pageInstallments.length; i += 2) {
    const row = [];
    const inst1 = pageInstallments[i];
    const [year1, month1] = inst1.dueMonth.split("-");
    const label1 = `${MONTH_NAMES[parseInt(month1, 10) - 1]} ${year1}`;
    row.push(Markup.button.callback(label1, `svc_cuota_detail:${inst1.id}`));

    if (i + 1 < pageInstallments.length) {
      const inst2 = pageInstallments[i + 1];
      const [year2, month2] = inst2.dueMonth.split("-");
      const label2 = `${MONTH_NAMES[parseInt(month2, 10) - 1]} ${year2}`;
      row.push(Markup.button.callback(label2, `svc_cuota_detail:${inst2.id}`));
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback(
        "← Página anterior",
        `svc_cuotas_pg:${serviceId}:${page - 1}`,
      ),
    );
  }
  if (end < installments.length) {
    navRow.push(
      Markup.button.callback(
        "Página siguiente →",
        `svc_cuotas_pg:${serviceId}:${page + 1}`,
      ),
    );
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    Markup.button.callback(
      `\u2190 Volver a ${serviceName}`,
      `svc_back_svc:${serviceId}`,
    ),
  ]);
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
