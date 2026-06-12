import { Scenes, Markup } from "telegraf";
import { KakebotContext, ServiceWizardState } from "../../types/telegraf-context.types";
import { ServicePaymentMethod } from "../../types/service.types";
import { getMessageText } from "../../helpers/wizard";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { formatARS, getDaysInMonth, getMonthLabel } from "../../helpers/format";
import { replyOrEdit } from "../../helpers/telegram";
import { log } from "../../helpers/logger";
import {
  buildPaymentMethodKeyboard,
  buildFilteredMonthKeyboard,
  buildDuplicateKeyboard,
  buildInstallmentDetailText,
  buildInstallmentDetailKeyboard,
} from "../keyboards/service";
import {
  createService,
  getInstallment,
  getInstallmentById,
  getInstallmentsByService,
  saveInstallment,
  replaceInstallment,
  updateServiceName,
  updateServicePaymentMethod,
  updateInstallmentAmount,
  updateInstallmentDueDay,
  saveReceiptUrl,
  saveInvoiceUrl,
} from "../../services/service.service";
import { uploadReceipt, uploadInvoice } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const SERVICE_SCENE_ID = "service-wizard";
const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const MONTH_STEP = 4;
const EDIT_NAME_STEP = 7;
const EDIT_AMOUNT_STEP = 8;
const EDIT_DAY_STEP = 9;
const RECEIPT_STEP = 10;
const INVOICE_STEP = 11;

// --- Steps ---

/**
 * Routes to the correct entry step based on the flow discriminator in wizard state.
 * For "create": shows name prompt and advances to step 1.
 * For "installment": shows month keyboard and jumps cursor to MONTH_STEP.
 * For all edit/attach flows: jumps cursor to the target step (prompt already shown by the entry handler).
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;

  switch (state.flow) {
  case "create":
    await ctx.reply("*¿Cómo se llama el servicio?*\nEj: Expensas, Gas, Flow, Netflix", {
      parse_mode: "Markdown",
    });
    ctx.wizard.next();
    break;

  case "installment": {
    const availableMonths = state.availableMonths || [];
    const serviceId = state.serviceId || "";
    if (availableMonths.length === 0) {
      await ctx.reply(
        "No hay meses disponibles para crear cuotas.\n" +
        "Ya tenés cuotas registradas para los próximos 3 meses.",
      );
      await ctx.scene.leave();
      return;
    }
    const keyboard = buildFilteredMonthKeyboard(availableMonths, serviceId);
    await ctx.reply(`*Seleccioná el mes para ${state.serviceName || "el servicio"}:*`, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
    ctx.wizard.selectStep(MONTH_STEP);
    break;
  }

  case "edit_name":
    ctx.wizard.selectStep(EDIT_NAME_STEP);
    break;

  case "edit_amount":
    ctx.wizard.selectStep(EDIT_AMOUNT_STEP);
    break;

  case "edit_day":
    ctx.wizard.selectStep(EDIT_DAY_STEP);
    break;

  case "receipt":
    await ctx.reply(
      "*Enviá la foto o PDF del comprobante.*\nO tocá el botón si no querés adjuntarlo ahora.",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("Omitir comprobante", "svc_scene_skip_receipt")],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]).reply_markup as any,
      },
    );
    ctx.wizard.selectStep(RECEIPT_STEP);
    break;

  case "invoice":
    await ctx.reply(
      "*Enviá la foto o PDF de la factura.*\nO tocá el botón si no querés adjuntarla ahora.",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("Omitir factura", "svc_scene_skip_invoice")],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]).reply_markup as any,
      },
    );
    ctx.wizard.selectStep(INVOICE_STEP);
    break;

  default:
    await ctx.reply("Error: flujo de servicio desconocido.");
    await ctx.scene.leave();
  }
}

/**
 * Validates and creates a new service; then presents the payment method keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleName(ctx: KakebotContext): Promise<void> {
  const name = getMessageText(ctx);
  if (!name) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const serviceId = await createService(telegramUserId, name);
  const state = ctx.wizard.state as ServiceWizardState;
  state.serviceId = serviceId;
  state.serviceName = name;
  const keyboard = buildPaymentMethodKeyboard(serviceId, "new");
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Guard step: catches text input when the payment method keyboard is active.
 * Re-presents the keyboard so the user can make a selection.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPaymentMethod(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí el método de pago del teclado, o escribí \"cancelar\" para anular.");
  const state = ctx.wizard.state as ServiceWizardState;
  const keyboard = buildPaymentMethodKeyboard(state.serviceId || "", "new");
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Guard step: catches text input when the "add installment now?" keyboard is active.
 * Re-presents the yes/no keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardInstallmentChoice(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;
  const serviceName = state.serviceName || "el servicio";
  const serviceId = state.serviceId || "";
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para anular.");
  await ctx.reply(`✅ Servicio '${serviceName}' creado.\n\n*¿Deseas agregar una cuota ahora?*`, {
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback("Cancelar", "svc_no_cuota"),
        Markup.button.callback("Aceptar", `svc_scene_add_installment:${serviceId}`),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]).reply_markup as any,
  });
}

/**
 * Guard step: catches text input when the month selection keyboard is active.
 * Re-presents the month keyboard so the user can make a selection.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardMonth(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;
  await ctx.reply("Elegí el mes del teclado, o escribí \"cancelar\" para anular.");
  const keyboard = buildFilteredMonthKeyboard(state.availableMonths || [], state.serviceId || "");
  await ctx.reply(`*Seleccioná el mes para ${state.serviceName || "el servicio"}:*`, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Validates the due day and stores it in wizard state; then asks for the installment amount.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleDay(ctx: KakebotContext): Promise<void> {
  const dayStr = getMessageText(ctx) ?? "";
  const day = parseInt(dayStr, 10);
  const state = ctx.wizard.state as ServiceWizardState;
  const selectedMonth = state.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }
  state.dueDay = day;
  await ctx.reply("*¿Cuál es el monto de la cuota?*", { parse_mode: "Markdown" });
  ctx.wizard.next();
}

/**
 * Validates the installment amount, checks for duplicates, and either saves
 * the installment or presents a duplicate-resolution keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleAmount(ctx: KakebotContext): Promise<void> {
  const amountStr = getMessageText(ctx) ?? "";
  const amount = parseArgentineAmount(amountStr);
  if (amount === null || amount <= 0) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50");
    return;
  }
  const state = ctx.wizard.state as ServiceWizardState;
  const serviceId = state.serviceId || "";
  const serviceName = state.serviceName || "";
  const selectedMonth = state.selectedMonth || "";
  const dueDay = state.dueDay;
  const hasRequiredData = serviceId && serviceName && selectedMonth && dueDay != null;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, dueDay as number);

  try {
    const existing = await getInstallment(serviceId, selectedMonth);
    if (existing) {
      state.partialAmount = amount;
      const keyboard = buildDuplicateKeyboard(existing.id || "");
      await ctx.reply("Ya existe cuota registrada para este mes.", keyboard);
      return;
    }
    const installmentId = await saveInstallment({
      telegramUserId,
      serviceId,
      serviceName,
      amount,
      dueDate,
      dueMonth: selectedMonth,
    });
    state.installmentId = installmentId;
    const day2 = String(dueDate.getDate()).padStart(2, "0");
    const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");
    await ctx.reply(`✅ Cuota registrada: ${serviceName} ${formatARS(amount)} (vence ${day2}/${month2})`);
    await ctx.reply(
      "*Enviá la foto o PDF de la factura.*\nO tocá el botón si no querés adjuntarla ahora.",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("Omitir factura", "svc_scene_skip_invoice")],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]).reply_markup as any,
      },
    );
    ctx.wizard.selectStep(INVOICE_STEP);
  } catch (error) {
    log.error("Error saving installment", error, { module: "service.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar la cuota. Intentá de nuevo.");
  }
}

/**
 * Validates and applies a service name update; then confirms and leaves the scene.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditName(ctx: KakebotContext): Promise<void> {
  const newName = getMessageText(ctx);
  if (!newName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }
  const state = ctx.wizard.state as ServiceWizardState;
  const serviceId = state.serviceId || "";
  try {
    await updateServiceName(serviceId, newName);
    await ctx.reply(`✅ Nombre actualizado a '${newName}'.`);
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error updating service name", error, { module: "service.scene" });
    await ctx.reply("Error al actualizar el nombre. Intentá de nuevo.");
  }
}

/**
 * Validates and applies an installment amount update; then shows the updated detail and leaves.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditAmount(ctx: KakebotContext): Promise<void> {
  const amountStr = getMessageText(ctx) ?? "";
  const amount = parseArgentineAmount(amountStr);
  if (amount === null || amount <= 0) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50");
    return;
  }
  const state = ctx.wizard.state as ServiceWizardState;
  const installmentId = state.installmentId || "";
  try {
    await updateInstallmentAmount(installmentId, amount);
    await showInstallmentDetailInScene(ctx, installmentId);
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error updating installment amount", error, { module: "service.scene" });
    await ctx.reply("Error al actualizar el monto. Intentá de nuevo.");
  }
}

/**
 * Validates and applies an installment due day update; then shows the updated detail and leaves.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditDay(ctx: KakebotContext): Promise<void> {
  const dayStr = getMessageText(ctx) ?? "";
  const day = parseInt(dayStr, 10);
  const state = ctx.wizard.state as ServiceWizardState;
  const installmentId = state.installmentId || "";
  const selectedMonth = state.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }
  try {
    await updateInstallmentDueDay(installmentId, day);
    await showInstallmentDetailInScene(ctx, installmentId);
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error updating installment due day", error, { module: "service.scene" });
    await ctx.reply("Error al actualizar el vencimiento. Intentá de nuevo.");
  }
}

/**
 * Guard step: catches text input when the scene is waiting for a receipt file.
 * Re-presents the file upload prompt.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Esperaba una foto o PDF. Enviá el comprobante.");
  await ctx.reply(
    "*Enviá la foto o PDF del comprobante.*\nO tocá el botón si no querés adjuntarlo ahora.",
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Omitir comprobante", "svc_scene_skip_receipt")],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]).reply_markup as any,
    },
  );
}

/**
 * Guard step: catches text input when the scene is waiting for an invoice file.
 * Re-presents the file upload prompt.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardInvoice(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Esperaba una foto o PDF. Enviá la factura.");
  await ctx.reply(
    "*Enviá la foto o PDF de la factura.*\nO tocá el botón si no querés adjuntarla ahora.",
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Omitir factura", "svc_scene_skip_invoice")],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]).reply_markup as any,
    },
  );
}

// --- Action handlers ---

/**
 * Saves the selected payment method and presents the "add installment now?" choice.
 * Callback: svc_pm_new:{serviceId}:{method}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePaymentMethodSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const method = match[2] as ServicePaymentMethod;
  const state = ctx.wizard.state as ServiceWizardState;
  const serviceName = state.serviceName || "";
  try {
    await updateServicePaymentMethod(serviceId, method);
  } catch (error) {
    log.error("Error saving payment method", error, { module: "service.scene" });
    await ctx.reply("Error al guardar el método de pago. Intentá de nuevo.");
    return;
  }
  await ctx.editMessageText(
    `✅ Servicio '${serviceName}' creado.\n\n*¿Deseas agregar una cuota ahora?*`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("Cancelar", "svc_no_cuota"),
          Markup.button.callback("Aceptar", `svc_scene_add_installment:${serviceId}`),
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]).reply_markup as any,
    },
  );
  ctx.wizard.next();
}

/**
 * Confirms service creation without an installment and leaves the scene.
 * Callback: svc_no_cuota
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleSkipInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as ServiceWizardState;
  const serviceName = state.serviceName || "el servicio";
  await ctx.editMessageText(
    `✅ Servicio '${serviceName}' creado sin cuota. Podés agregarla luego desde /servicios.`,
  );
  await ctx.scene.leave();
}

/**
 * Computes available months for the service and presents the month keyboard.
 * Called when the user accepts adding an installment after service creation.
 * Callback: svc_scene_add_installment:{serviceId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirmAddInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const state = ctx.wizard.state as ServiceWizardState;
  state.serviceId = serviceId;

  let availableMonths: string[];
  try {
    const existingInstallments = await getInstallmentsByService(serviceId, telegramUserId);
    const existingMonths = new Set(existingInstallments.map((inst) => inst.dueMonth));
    const now = new Date();
    availableMonths = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const paddedMonth = String(date.getMonth() + 1).padStart(2, "0");
      const dueMonth = `${date.getFullYear()}-${paddedMonth}`;
      if (!existingMonths.has(dueMonth)) availableMonths.push(dueMonth);
    }
  } catch (error) {
    log.error("Error loading installments for month filter", error, {
      module: "service.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar los meses disponibles. Intentá de nuevo.");
    return;
  }

  if (availableMonths.length === 0) {
    await ctx.editMessageText(
      "No hay meses disponibles para crear cuotas.\n" +
      "Ya tenés cuotas registradas para los próximos 3 meses.",
    );
    await ctx.scene.leave();
    return;
  }

  state.availableMonths = availableMonths;
  const keyboard = buildFilteredMonthKeyboard(availableMonths, serviceId);
  await ctx.editMessageText(
    "*Seleccioná el mes de la nueva cuota.*\n" +
    "Podés crear cuotas solo para meses que aún no tengan una.",
    { parse_mode: "Markdown" },
  );
  await ctx.reply(`*Seleccioná el mes para ${state.serviceName || "el servicio"}:*`, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.selectStep(MONTH_STEP);
}

/**
 * Stores the selected month in wizard state and prompts for the due day.
 * Callback: svc_month:{serviceId}:{dueMonth}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const dueMonth = match[2];
  const state = ctx.wizard.state as ServiceWizardState;
  state.selectedMonth = dueMonth;
  const maxDay = getDaysInMonth(dueMonth);
  await ctx.editMessageText(
    `*Mes seleccionado:* ${getMonthLabel(dueMonth)}`,
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    `*¿Qué día de ${getMonthLabel(dueMonth, true)} vence el servicio? (1-${maxDay})*`,
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Skips the current duplicate installment registration.
 * Callback: svc_skip
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleSkipDuplicate(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Registro de cuota omitido.");
  await ctx.scene.leave();
}

/**
 * Replaces the existing duplicate installment with the new amount/day from wizard state.
 * Callback: svc_replace:{installmentId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleReplaceDuplicate(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const state = ctx.wizard.state as ServiceWizardState;
  const partialAmount = state.partialAmount;
  const dueDay = state.dueDay;
  const selectedMonth = state.selectedMonth || "";
  const serviceName = state.serviceName || "";
  const hasRequiredData = partialAmount && dueDay != null && selectedMonth;
  if (!hasRequiredData) {
    await ctx.editMessageText("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }
  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, dueDay as number);
  try {
    await replaceInstallment(installmentId, partialAmount as number, dueDate);
    const day2 = String(dueDate.getDate()).padStart(2, "0");
    const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");
    await ctx.editMessageText(
      `✅ Cuota reemplazada: ${serviceName} ${formatARS(partialAmount as number)} (vence ${day2}/${month2})`,
    );
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error replacing installment", error, { module: "service.scene" });
    await ctx.reply("Error al reemplazar la cuota. Intentá de nuevo.");
  }
}

// --- File upload handlers ---

/**
 * Uploads a photo or PDF receipt for the installment in wizard state.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 * @return {Promise<void>}
 */
async function handleReceiptUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const installmentId = state.installmentId || "";
  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;
  let mimeType: string;

  if (documentFileId) {
    fileId = documentFileId;
    mimeType = "application/pdf";
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = ((ctx.message as any).photo as Array<{ file_id: string }>) || [];
    if (photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }
    fileId = photos[photos.length - 1].file_id;
    mimeType = "";
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const resolvedMimeType = mimeType || (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");
    const receiptUrl = await uploadReceipt({ telegramUserId, installmentId, fileBuffer, mimeType: resolvedMimeType });
    await saveReceiptUrl(installmentId, receiptUrl);
    await ctx.reply("✅ Comprobante guardado.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading receipt", error, { module: "service.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Uploads a photo or PDF invoice for the installment in wizard state.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 * @return {Promise<void>}
 */
async function handleInvoiceUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const installmentId = state.installmentId || "";
  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;
  let mimeType: string;

  if (documentFileId) {
    fileId = documentFileId;
    mimeType = "application/pdf";
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = ((ctx.message as any).photo as Array<{ file_id: string }>) || [];
    if (photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }
    fileId = photos[photos.length - 1].file_id;
    mimeType = "";
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const resolvedMimeType = mimeType || (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");
    const invoiceUrl = await uploadInvoice({ telegramUserId, installmentId, fileBuffer, mimeType: resolvedMimeType });
    await saveInvoiceUrl(installmentId, invoiceUrl);
    await ctx.reply("✅ Factura adjunta.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading invoice", error, { module: "service.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar la factura. Intentá de nuevo.");
  }
}

// --- Private helpers ---

/**
 * Fetches and renders the installment detail view inside the scene context.
 * Intentionally omits breadcrumb (wizard-scenes.md §8.1).
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string} installmentId - Firestore ID of the installment
 * @return {Promise<void>}
 */
async function showInstallmentDetailInScene(ctx: KakebotContext, installmentId: string): Promise<void> {
  const installment = await getInstallmentById(installmentId);
  if (!installment) {
    await replyOrEdit(ctx, "No se encontró la cuota.");
    return;
  }
  const text = buildInstallmentDetailText(installment);
  const keyboard = buildInstallmentDetailKeyboard({
    installmentId,
    isPaid: installment.isPaid,
    hasReceipt: !!installment.receiptUrl,
    hasInvoice: !!installment.invoiceUrl,
    backCallback: `svc_cuotas:${installment.serviceId}`,
    backLabel: "← Volver al historial",
  });
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Re-presents the active prompt for the current step when an unexpected file arrives.
 * Called from scene.on("photo") and scene.on("document") when cursor is not at a file step.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ServiceWizardState;
  await ctx.reply("No esperaba un archivo aquí.");
  switch (ctx.wizard.cursor) {
  case 1:
    await ctx.reply("*¿Cómo se llama el servicio?*", { parse_mode: "Markdown" });
    break;
  case 2: {
    const keyboard = buildPaymentMethodKeyboard(state.serviceId || "", "new");
    await ctx.reply("*Seleccioná el método de pago*", {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
    break;
  }
  case 3:
    await ctx.reply(
      `✅ Servicio '${state.serviceName || "el servicio"}' creado.\n\n*¿Deseas agregar una cuota ahora?*`,
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback("Cancelar", "svc_no_cuota"),
            Markup.button.callback("Aceptar", `svc_scene_add_installment:${state.serviceId || ""}`),
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]).reply_markup as any,
      },
    );
    break;
  case MONTH_STEP: {
    const monthKeyboard = buildFilteredMonthKeyboard(state.availableMonths || [], state.serviceId || "");
    await ctx.reply(`*Seleccioná el mes para ${state.serviceName || "el servicio"}:*`, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: monthKeyboard.reply_markup as any,
    });
    break;
  }
  case 5:
    if (state.selectedMonth) {
      const maxDay = getDaysInMonth(state.selectedMonth);
      await ctx.reply(
        `*¿Qué día de ${getMonthLabel(state.selectedMonth, true)} vence el servicio? (1-${maxDay})*`,
        { parse_mode: "Markdown" },
      );
    }
    break;
  case 6:
    await ctx.reply("*¿Cuál es el monto de la cuota?*", { parse_mode: "Markdown" });
    break;
  case EDIT_NAME_STEP:
    await ctx.reply("*¿Cuál es el nuevo nombre del servicio?*", { parse_mode: "Markdown" });
    break;
  case EDIT_AMOUNT_STEP:
    await ctx.reply("*¿Cuál es el nuevo monto?*", { parse_mode: "Markdown" });
    break;
  case EDIT_DAY_STEP:
    await ctx.reply("*¿Cuál es el nuevo día de vencimiento? (1-31)*", { parse_mode: "Markdown" });
    break;
  default:
    break;
  }
}

/**
 * Leaves the scene when the user types a cancel word.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}

// --- Scene export and event registrations ---

export const serviceScene = new Scenes.WizardScene<KakebotContext>(
  SERVICE_SCENE_ID,
  stepInit, // 0
  stepHandleName, // 1
  stepGuardPaymentMethod, // 2
  stepGuardInstallmentChoice, // 3
  stepGuardMonth, // 4 = MONTH_STEP
  stepHandleDay, // 5
  stepHandleAmount, // 6
  stepHandleEditName, // 7 = EDIT_NAME_STEP
  stepHandleEditAmount, // 8 = EDIT_AMOUNT_STEP
  stepHandleEditDay, // 9 = EDIT_DAY_STEP
  stepGuardReceipt, // 10 = RECEIPT_STEP
  stepGuardInvoice, // 11 = INVOICE_STEP
);

serviceScene.hears(CANCEL_REGEX, handleCancelWord);

serviceScene.action("svc_scene_skip_receipt", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Podés adjuntar el comprobante luego desde /servicios.");
  await ctx.scene.leave();
});

serviceScene.action("svc_scene_skip_invoice", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Podés adjuntar la factura luego desde /servicios.");
  await ctx.scene.leave();
});

serviceScene.action(/^svc_pm_new:([^:]+):([^:]+)$/, handlePaymentMethodSelected);
serviceScene.action("svc_no_cuota", handleSkipInstallment);
serviceScene.action(/^svc_scene_add_installment:(.+)$/, handleConfirmAddInstallment);
serviceScene.action(/^svc_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
serviceScene.action("svc_skip", handleSkipDuplicate);
serviceScene.action(/^svc_replace:(.+)$/, handleReplaceDuplicate);

serviceScene.on("photo", async (ctx) => {
  const cursor = ctx.wizard.cursor;
  if (cursor === RECEIPT_STEP) {
    await handleReceiptUpload(ctx, null);
    return;
  }
  if (cursor === INVOICE_STEP) {
    await handleInvoiceUpload(ctx, null);
    return;
  }
  await repromptCurrentStep(ctx);
});

serviceScene.on("document", async (ctx) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any).document as { file_id: string; mime_type?: string } | undefined;
  if (!document) return;
  if (document.mime_type !== "application/pdf") {
    await ctx.reply("Solo se aceptan archivos PDF.");
    return;
  }
  const cursor = ctx.wizard.cursor;
  if (cursor === RECEIPT_STEP) {
    await handleReceiptUpload(ctx, document.file_id);
    return;
  }
  if (cursor === INVOICE_STEP) {
    await handleInvoiceUpload(ctx, document.file_id);
    return;
  }
  await repromptCurrentStep(ctx);
});
