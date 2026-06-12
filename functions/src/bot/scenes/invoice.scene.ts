import { Scenes, Markup } from "telegraf";
import { KakebotContext, InvoiceWizardState } from "../../types/telegraf-context.types";
import { AttachFileParams } from "../../types/handlers.types";
import { log } from "../../helpers/logger";
import {
  getServicesByUser,
  getServiceById,
  getInstallment,
  saveInvoiceUrl,
  saveReceiptUrl,
  markInstallmentAsPaid,
  createService,
  saveInstallment,
} from "../../services/service.service";
import { uploadInvoice, uploadReceipt } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";
import { getDaysInMonth, getMonthLabel } from "../../helpers/format";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { getMessageText } from "../../helpers/wizard";
import { Service } from "../../types/service.types";

export const INVOICE_SCENE_ID = "invoice-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const NAME_STEP = 1;
const PICKER_GUARD_STEP = 2;
const MONTH_GUARD_STEP = 3;
const DAY_STEP = 4;
const AMOUNT_STEP = 5;

// ─── private keyboard builders ───────────────────────────────────────────────

const ITEMS_PER_PAGE = 6;

/**
 * Builds a paginated service-picker keyboard with invr_* callbacks.
 *
 * @param {Service[]} services - Full list of user services
 * @param {number} page - Current page index (0-based)
 * @return {Markup} Inline keyboard markup
 */
function buildServicePickerKeyboard(services: Service[], page = 0) {
  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = services.slice(start, end);

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < pageItems.length; i += 2) {
    const row = [Markup.button.callback(pageItems[i].name, `invr_pick:${pageItems[i].id || ""}`)];
    if (i + 1 < pageItems.length) {
      row.push(Markup.button.callback(pageItems[i + 1].name, `invr_pick:${pageItems[i + 1].id || ""}`));
    }
    rows.push(row);
  }

  const navRow: ReturnType<typeof Markup.button.callback>[] = [];
  if (page > 0) navRow.push(Markup.button.callback("← Anterior", `invr_pg:${page - 1}`));
  if (end < services.length) navRow.push(Markup.button.callback("Más →", `invr_pg:${page + 1}`));
  if (navRow.length > 0) rows.push(navRow);

  rows.push([Markup.button.callback("Nuevo servicio", "invr_new")]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds a month-selector keyboard (current + 2 next months) with invr_* callbacks.
 *
 * @param {string} serviceId - Firestore service ID embedded in the callback data
 * @return {Markup} Inline keyboard markup
 */
function buildMonthKeyboard(serviceId: string) {
  const now = new Date();
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yearMonth = `${d.getFullYear()}-${mm}`;
    rows.push([Markup.button.callback(getMonthLabel(yearMonth, true), `invr_month:${serviceId}:${yearMonth}`)]);
  }
  return Markup.inlineKeyboard(rows);
}

// ─── private attach helper ────────────────────────────────────────────────────

/**
 * Downloads the pending file from Telegram and uploads it to GCS,
 * branching on flow to save invoice or receipt (+ mark paid).
 *
 * @param {AttachFileParams} params - ctx, state, telegramUserId, installmentId, successMessage
 */
async function attachFile({
  ctx,
  state,
  telegramUserId,
  installmentId,
  successMessage,
}: AttachFileParams): Promise<void> {
  try {
    const fileLink = await ctx.telegram.getFileLink(state.pendingFileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const mimeType = state.pendingFileType === "pdf"
      ? "application/pdf"
      : fileLink.href.includes(".png") ? "image/png" : "image/jpeg";

    if (state.flow === "receipt") {
      const receiptUrl = await uploadReceipt({ telegramUserId, installmentId, fileBuffer, mimeType });
      await markInstallmentAsPaid(installmentId);
      await saveReceiptUrl(installmentId, receiptUrl);
    } else {
      const invoiceUrl = await uploadInvoice({ telegramUserId, installmentId, fileBuffer, mimeType });
      await saveInvoiceUrl(installmentId, invoiceUrl);
    }
    await ctx.reply(successMessage);
  } catch (error) {
    log.error("Error attaching file in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al guardar el archivo. Intentá de nuevo.");
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the flow-appropriate article + noun.
 *
 * @param {string} flow - "invoice" or "receipt"
 * @return {string} "la factura" or "el comprobante"
 */
function flowLabel(flow: "invoice" | "receipt"): string {
  return flow === "receipt" ? "el comprobante" : "la factura";
}

/**
 * Returns the default success message for the attach step.
 *
 * @param {string} flow - "invoice" or "receipt"
 * @param {boolean} isNewService - Whether the service was just created in this flow
 * @return {string} Localized success message
 */
function defaultSuccessMessage(flow: "invoice" | "receipt", isNewService: boolean): string {
  if (flow === "receipt") {
    return isNewService
      ? "✅ Servicio creado, comprobante adjunto y cuota marcada como pagada."
      : "✅ Comprobante adjunto. Cuota marcada como pagada.";
  }
  return isNewService ? "✅ Servicio creado y factura adjuntada." : "✅ Factura adjunta.";
}

// ─── steps ────────────────────────────────────────────────────────────────────

/**
 * Step 0: loads services and routes to either the name-input step (no services)
 * or the service-picker guard step (services exist).
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    const services = await getServicesByUser(telegramUserId);

    if (services.length === 0) {
      await ctx.reply(
        "*¿Cómo se llama el servicio?*\n_Ej: Expensas, Gas, Flow, Netflix_\n_Enviá \"cancelar\" para salir._",
        { parse_mode: "Markdown" },
      );
      ctx.wizard.next();
      return;
    }

    const keyboard = buildServicePickerKeyboard(services);
    await ctx.reply(
      `*¿A qué servicio corresponde ${flowLabel(state.flow)}?*`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    ctx.wizard.selectStep(PICKER_GUARD_STEP);
  } catch (error) {
    log.error("Error loading services in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar los servicios. Intentá de nuevo.");
    await ctx.scene.leave();
  }
}

/**
 * Step 1: receives the typed service name, creates the service,
 * then shows the month picker.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleName(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const name = getMessageText(ctx);

  if (!name) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  try {
    const serviceId = await createService(telegramUserId, name);
    state.serviceId = serviceId;
    state.serviceName = name;
    state.isNewService = true;

    await ctx.reply(`✅ Servicio "${name}" creado.`);

    const keyboard = buildMonthKeyboard(serviceId);
    await ctx.reply(
      `*¿A qué mes corresponde ${flowLabel(state.flow)}?*`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    ctx.wizard.selectStep(MONTH_GUARD_STEP);
  } catch (error) {
    log.error("Error creating service in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al crear el servicio. Intentá de nuevo.");
  }
}

/**
 * Step 2: cursor guard — fires when the user types text while the
 * service-picker keyboard is active.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardPicker(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  await ctx.reply("Elegí un servicio del teclado, o escribí \"cancelar\" para salir.");
  try {
    const services = await getServicesByUser(telegramUserId);
    const keyboard = buildServicePickerKeyboard(services);
    await ctx.reply(
      `*¿A qué servicio corresponde ${flowLabel(state.flow)}?*`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
  } catch (error) {
    log.error("Error rebuilding picker in invoice scene guard", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
  }
}

/**
 * Step 3: cursor guard — fires when the user types text while the
 * month-picker keyboard is active.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardMonth(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  await ctx.reply("Elegí un mes del teclado, o escribí \"cancelar\" para salir.");
  const keyboard = buildMonthKeyboard(state.serviceId ?? "");
  await ctx.reply(
    `*¿A qué mes corresponde ${flowLabel(state.flow)}?*`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Step 4: receives the typed due day and advances to amount input.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleDay(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const dayStr = getMessageText(ctx);
  const day = dayStr ? parseInt(dayStr, 10) : NaN;
  const selectedMonth = state.selectedMonth ?? "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;

  if (!dayStr || !Number.isInteger(day) || day < 1 || day > maxDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  state.partialDescription = dayStr;
  await ctx.reply(
    "*¿Cuál es el monto de la cuota?*\n_Ej: 5000 o 14.819,50_",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 5: validates the amount, creates the installment, and attaches the file.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleAmount(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const input = getMessageText(ctx);
  const amount = input ? parseArgentineAmount(input) : null;

  if (!amount || amount <= 0) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50");
    return;
  }

  const day = parseInt(state.partialDescription ?? "1", 10);

  if (!state.serviceId || !state.serviceName || !state.selectedMonth) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  try {
    const [year, month] = state.selectedMonth.split("-");
    const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

    const installmentId = await saveInstallment({
      telegramUserId,
      serviceId: state.serviceId,
      serviceName: state.serviceName,
      amount,
      dueDate,
      dueMonth: state.selectedMonth,
    });

    const successMessage = defaultSuccessMessage(state.flow, state.isNewService ?? false);
    await attachFile({ ctx, state, telegramUserId, installmentId, successMessage });
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error saving installment in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al guardar la cuota. Intentá de nuevo.");
  }
}

// ─── action handlers ──────────────────────────────────────────────────────────

/**
 * Handles service selection from the picker keyboard.
 * If a current-month installment already exists, attaches the file directly.
 * Otherwise shows the month picker.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePickService(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  try {
    const now = new Date();
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const currentMonth = `${now.getFullYear()}-${monthStr}`;

    const [service, installment] = await Promise.all([
      getServiceById(serviceId),
      getInstallment(serviceId, currentMonth),
    ]);

    state.serviceId = serviceId;
    state.serviceName = service?.name ?? "";

    if (installment) {
      await ctx.editMessageText(
        `Adjuntando ${flowLabel(state.flow)} a la cuota de ${getMonthLabel(currentMonth, true)}...`,
      );
      await attachFile({
        ctx,
        state,
        telegramUserId,
        installmentId: installment.id ?? "",
        successMessage: defaultSuccessMessage(state.flow, false),
      });
      await ctx.scene.leave();
      return;
    }

    const keyboard = buildMonthKeyboard(serviceId);
    await ctx.editMessageText(
      `*¿A qué mes corresponde ${flowLabel(state.flow)}?*`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    ctx.wizard.selectStep(MONTH_GUARD_STEP);
  } catch (error) {
    log.error("Error picking service in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al procesar. Intentá de nuevo.");
  }
}

/**
 * Handles the "Nuevo servicio" button — prompts for a service name
 * and parks the cursor at the name-input step.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleNewService(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "*¿Cómo se llama el servicio?*\n_Ej: Expensas, Gas, Flow, Netflix_\n_Enviá \"cancelar\" para salir._",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.selectStep(NAME_STEP);
}

/**
 * Handles month selection from the month-picker keyboard.
 * If an installment already exists for that month, attaches directly.
 * Otherwise asks for the due day.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const dueMonth = match[2];

  state.serviceId = serviceId;
  state.selectedMonth = dueMonth;

  try {
    const installment = await getInstallment(serviceId, dueMonth);

    if (installment) {
      await ctx.editMessageText(
        `Adjuntando ${flowLabel(state.flow)} a la cuota de ${getMonthLabel(dueMonth, true)}...`,
      );
      await attachFile({
        ctx,
        state,
        telegramUserId,
        installmentId: installment.id ?? "",
        successMessage: defaultSuccessMessage(state.flow, state.isNewService ?? false),
      });
      await ctx.scene.leave();
      return;
    }

    const maxDay = getDaysInMonth(dueMonth);
    await ctx.editMessageText(
      `*¿Qué día vence la cuota de ${getMonthLabel(dueMonth, true)}? (1-${maxDay})*\n_Enviá "cancelar" para salir._`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(DAY_STEP);
  } catch (error) {
    log.error("Error selecting month in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al procesar. Intentá de nuevo.");
  }
}

/**
 * Handles pagination of the service picker.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePagination(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  try {
    const services = await getServicesByUser(telegramUserId);
    const keyboard = buildServicePickerKeyboard(services, page);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
  } catch (error) {
    log.error("Error paginating service list in invoice scene", error, {
      module: "invoice.scene",
      userId: telegramUserId,
    });
  }
}

// ─── reprompt ─────────────────────────────────────────────────────────────────

/**
 * Re-presents the current step's prompt when the user sends an unexpected file.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as InvoiceWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0:
    await ctx.reply(`Enviá la foto o PDF de ${flowLabel(state.flow)}.`);
    break;
  case NAME_STEP:
    await ctx.reply("*¿Cómo se llama el servicio?*", { parse_mode: "Markdown" });
    break;
  case PICKER_GUARD_STEP:
    try {
      const services = await getServicesByUser(telegramUserId);
      const keyboard = buildServicePickerKeyboard(services);
      await ctx.reply(
        `*¿A qué servicio corresponde ${flowLabel(state.flow)}?*`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
      );
    } catch (_e) {
      await ctx.reply("Elegí un servicio del teclado.");
    }
    break;
  case MONTH_GUARD_STEP: {
    const keyboard = buildMonthKeyboard(state.serviceId ?? "");
    await ctx.reply(
      `*¿A qué mes corresponde ${flowLabel(state.flow)}?*`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    break;
  }
  case DAY_STEP: {
    const maxDay = state.selectedMonth ? getDaysInMonth(state.selectedMonth) : 31;
    await ctx.reply(`*¿Qué día vence? (1-${maxDay})*`, { parse_mode: "Markdown" });
    break;
  }
  case AMOUNT_STEP:
    await ctx.reply(
      "*¿Cuál es el monto de la cuota?*\n_Ej: 5000 o 14.819,50_",
      { parse_mode: "Markdown" },
    );
    break;
  default:
    break;
  }
}

// ─── cancel word ──────────────────────────────────────────────────────────────

/**
 * Cancels the flow when the user types a cancel word.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  const flow = (ctx.wizard.state as InvoiceWizardState).flow;
  await ctx.reply(flow === "receipt" ? "Carga de comprobante cancelada." : "Carga de factura cancelada.");
  await ctx.scene.leave();
}

// ─── scene export ─────────────────────────────────────────────────────────────

export const invoiceScene = new Scenes.WizardScene<KakebotContext>(
  INVOICE_SCENE_ID,
  stepInit,
  stepHandleName,
  stepGuardPicker,
  stepGuardMonth,
  stepHandleDay,
  stepHandleAmount,
);

invoiceScene.hears(CANCEL_REGEX, handleCancelWord);
invoiceScene.action(/^invr_pick:(.+)$/, handlePickService);
invoiceScene.action("invr_new", handleNewService);
invoiceScene.action(/^invr_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
invoiceScene.action(/^invr_pg:(\d+)$/, handlePagination);
invoiceScene.on("photo", repromptCurrentStep);
invoiceScene.on("document", repromptCurrentStep);
