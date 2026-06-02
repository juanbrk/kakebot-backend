import { Scenes } from "telegraf";
import { KakebotContext, DocRouterWizardState, InvoiceWizardState } from "../../types/telegraf-context.types";
import { buildDocTypeKeyboard } from "../keyboards/invoice";
import { INVOICE_SCENE_ID } from "./invoice.scene";

export const DOC_ROUTER_SCENE_ID = "doc-router-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const TYPE_GUARD_STEP = 1;

/**
 * Step 0: shows the doc-type keyboard (Factura / Comprobante) and parks the cursor at step 1.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "¿Qué tipo de documento es?\nEscribí \"cancelar\" para anular la carga.",
    buildDocTypeKeyboard(),
  );
  ctx.wizard.selectStep(TYPE_GUARD_STEP);
}

/**
 * Step 1: cursor guard — fires when user sends text while the doc-type keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardType(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "Elegí una opción del menú, o escribí \"cancelar\" para anular.",
  );
  await ctx.reply(
    "¿Qué tipo de documento es?",
    buildDocTypeKeyboard(),
  );
}

/**
 * Routes to the invoice scene with flow="invoice".
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeInvoice(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await ctx.editMessageText("Factura");
  await ctx.scene.enter(INVOICE_SCENE_ID, { flow: "invoice", pendingFileId, pendingFileType } as InvoiceWizardState);
}

/**
 * Routes to the invoice scene with flow="receipt".
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await ctx.editMessageText("Comprobante");
  await ctx.scene.enter(INVOICE_SCENE_ID, { flow: "receipt", pendingFileId, pendingFileType } as InvoiceWizardState);
}

/**
 * Handles a photo arriving while waiting for doc-type selection.
 * Updates pendingFileId/pendingFileType in state and re-presents the keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePhotoWhileWaiting(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as DocRouterWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any)?.photo as Array<{ file_id: string }> | undefined;
  if (photos?.length) {
    state.pendingFileId = photos[photos.length - 1].file_id;
    state.pendingFileType = "photo";
  }
  await ctx.reply(
    "¿Qué tipo de documento es?\nEscribí \"cancelar\" para anular la carga.",
    buildDocTypeKeyboard(),
  );
}

/**
 * Handles a PDF document arriving while waiting for doc-type selection.
 * Updates pendingFileId/pendingFileType in state and re-presents the keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocumentWhileWaiting(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as DocRouterWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any)?.document as { file_id: string; mime_type?: string } | undefined;
  if (document?.mime_type === "application/pdf") {
    state.pendingFileId = document.file_id;
    state.pendingFileType = "pdf";
  }
  await ctx.reply(
    "¿Qué tipo de documento es?\nEscribí \"cancelar\" para anular la carga.",
    buildDocTypeKeyboard(),
  );
}

/**
 * Cancels the doc-router flow when the user types a cancel word.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Operación cancelada.");
  await ctx.scene.leave();
}

export const docRouterScene = new Scenes.WizardScene<KakebotContext>(
  DOC_ROUTER_SCENE_ID,
  stepInit,
  stepGuardType,
);

docRouterScene.hears(CANCEL_REGEX, handleCancelWord);
docRouterScene.action("doc_type_invoice", handleDocTypeInvoice);
docRouterScene.action("doc_type_receipt", handleDocTypeReceipt);
docRouterScene.on("photo", handlePhotoWhileWaiting);
docRouterScene.on("document", handleDocumentWhileWaiting);
