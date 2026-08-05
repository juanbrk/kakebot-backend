import { Scenes } from "telegraf";
import {
  KakebotContext,
  DocRouterWizardState,
  InvoiceWizardState,
  TaxReceiptWizardState,
  CardStatementDocWizardState,
} from "../../types/telegraf-context.types";
import { buildDocTypeKeyboard, buildReceiptEntityKeyboard } from "../keyboards/invoice";
import { replyOrEdit } from "../../helpers/telegram";
import { INVOICE_SCENE_ID } from "./invoice.scene";
import { TAX_RECEIPT_SCENE_ID } from "./tax-receipt.scene";
import { CARD_STATEMENT_DOC_SCENE_ID } from "./card-statement-doc.scene";

export const DOC_ROUTER_SCENE_ID = "doc-router-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const TYPE_GUARD_STEP = 1;
const ENTITY_GUARD_STEP = 2;

const DOC_TYPE_PROMPT = "¿Qué tipo de documento es?\nEscribí \"cancelar\" para anular la carga.";
const ENTITY_PROMPT = "*¿A qué entidad pertenece el comprobante?*";
const FILE_REPLACED_NOTICE = "Voy a usar el último archivo que enviaste.";

/**
 * Sends the doc-type keyboard as a new message. Reads the file type from state on every call —
 * the keyboard's third option ("Resumen") is PDF-only, so replacing a PDF with a photo mid-flow
 * has to drop it. Single funnel to buildDocTypeKeyboard for exactly that reason.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptDocType(ctx: KakebotContext): Promise<void> {
  const { pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await ctx.reply(DOC_TYPE_PROMPT, buildDocTypeKeyboard(pendingFileType));
}

/**
 * Sends the entity keyboard as a new message.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptEntity(ctx: KakebotContext): Promise<void> {
  await ctx.reply(ENTITY_PROMPT, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildReceiptEntityKeyboard().reply_markup as any,
  });
}

/**
 * Step 0: shows the doc-type keyboard (Factura / Comprobante) and parks the cursor at step 1.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  await repromptDocType(ctx);
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
  await repromptDocType(ctx);
}

/**
 * Step 2: cursor guard — fires when user sends text while the entity keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardEntity(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "Elegí una opción del menú, o escribí \"cancelar\" para anular.",
  );
  await repromptEntity(ctx);
}

/**
 * Routes to the invoice scene with flow="invoice". Invoices only apply to services,
 * so this branch skips the entity question.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeInvoice(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await replyOrEdit(ctx, "Vas a cargar un archivo como Factura");
  await ctx.scene.enter(INVOICE_SCENE_ID, { flow: "invoice", pendingFileId, pendingFileType } as InvoiceWizardState);
}

/**
 * Routes a credit card statement to the card-statement-doc scene, which picks the card and
 * hands the PDF to the statement create flow.
 *
 * Guards the file type instead of trusting the button: "Resumen" is only rendered for PDFs,
 * but a keyboard sent before the user replaced the PDF with a photo stays tappable in the chat.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeStatement(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;

  if (pendingFileType !== "pdf") {
    await ctx.reply("El resumen tiene que ser un PDF.");
    await repromptCurrentKeyboard(ctx);
    return;
  }

  await replyOrEdit(ctx, "Vas a cargar un archivo como Resumen");
  await ctx.scene.enter(
    CARD_STATEMENT_DOC_SCENE_ID,
    { pendingFileId, pendingFileType } as CardStatementDocWizardState,
  );
}

/**
 * Asks which entity the receipt belongs to. Stays in the scene: the entity keyboard is
 * still waiting for an answer (reglamento §10.3).
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(ctx, "Vas a cargar un archivo como Comprobante");
  await repromptEntity(ctx);
  ctx.wizard.selectStep(ENTITY_GUARD_STEP);
}

/**
 * Routes a service receipt to the invoice scene with flow="receipt".
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleEntityService(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await replyOrEdit(ctx, "Seleccionaste Servicio");
  await ctx.scene.enter(INVOICE_SCENE_ID, { flow: "receipt", pendingFileId, pendingFileType } as InvoiceWizardState);
}

/**
 * Routes a tax receipt to the tax-receipt scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleEntityTax(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;
  await replyOrEdit(ctx, "Seleccionaste Impuesto");
  await ctx.scene.enter(TAX_RECEIPT_SCENE_ID, { pendingFileId, pendingFileType } as TaxReceiptWizardState);
}

/**
 * Re-presents the keyboard matching the current cursor. Used after a replacement file
 * arrives, so the user keeps the selection they were already on.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentKeyboard(ctx: KakebotContext): Promise<void> {
  if (ctx.wizard.cursor === ENTITY_GUARD_STEP) {
    await repromptEntity(ctx);
    return;
  }
  await repromptDocType(ctx);
}

/**
 * Returns true when the cursor is parked on one of the scene's keyboards, i.e. a newly
 * arriving file is a replacement for the pending one rather than unexpected input.
 *
 * @param {KakebotContext} ctx - Telegraf context
 * @return {boolean} Whether a replacement file is welcome at this cursor
 */
function isAwaitingSelection(ctx: KakebotContext): boolean {
  return ctx.wizard.cursor === 0
    || ctx.wizard.cursor === TYPE_GUARD_STEP
    || ctx.wizard.cursor === ENTITY_GUARD_STEP;
}

/**
 * Handles a photo arriving while waiting for a selection. Telegraf runs the scene composer
 * before the step runner, so this also serves the photo that entered the scene — hence the
 * notice fires only when the incoming file displaces a different one.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePhotoWhileWaiting(ctx: KakebotContext): Promise<void> {
  if (!isAwaitingSelection(ctx)) {
    await repromptCurrentStep(ctx);
    return;
  }
  const state = ctx.wizard.state as DocRouterWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any)?.photo as Array<{ file_id: string }> | undefined;
  if (photos?.length) {
    const incomingFileId = photos[photos.length - 1].file_id;
    const replacesAnotherFile = Boolean(state.pendingFileId) && state.pendingFileId !== incomingFileId;
    state.pendingFileId = incomingFileId;
    state.pendingFileType = "photo";
    if (replacesAnotherFile) {
      await ctx.reply(FILE_REPLACED_NOTICE);
    }
  }
  await repromptCurrentKeyboard(ctx);
}

/**
 * Handles a PDF arriving while waiting for a selection. Like the photo handler, this also
 * serves the document that entered the scene, so the notice fires only on a real replacement.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocumentWhileWaiting(ctx: KakebotContext): Promise<void> {
  if (!isAwaitingSelection(ctx)) {
    await repromptCurrentStep(ctx);
    return;
  }
  const state = ctx.wizard.state as DocRouterWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any)?.document as { file_id: string; mime_type?: string } | undefined;
  if (document?.mime_type === "application/pdf") {
    const replacesAnotherFile = Boolean(state.pendingFileId) && state.pendingFileId !== document.file_id;
    state.pendingFileId = document.file_id;
    state.pendingFileType = "pdf";
    if (replacesAnotherFile) {
      await ctx.reply(FILE_REPLACED_NOTICE);
    }
  }
  await repromptCurrentKeyboard(ctx);
}

/**
 * Fallback for unexpected input types while waiting for a selection.
 * In practice unreachable — photos and documents are always expected here —
 * but required by the WizardScene structural contract.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  await ctx.reply("No esperaba un archivo aquí.");
  switch (ctx.wizard.cursor) {
  case 0:
  case TYPE_GUARD_STEP:
    await repromptDocType(ctx);
    break;
  case ENTITY_GUARD_STEP:
    await repromptEntity(ctx);
    break;
  default:
    break;
  }
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
  stepGuardEntity,
);

docRouterScene.hears(CANCEL_REGEX, handleCancelWord);
docRouterScene.action("doc_type_invoice", handleDocTypeInvoice);
docRouterScene.action("doc_type_receipt", handleDocTypeReceipt);
docRouterScene.action("doc_type_statement", handleDocTypeStatement);
docRouterScene.action("doc_entity_service", handleEntityService);
docRouterScene.action("doc_entity_tax", handleEntityTax);
docRouterScene.on("photo", handlePhotoWhileWaiting);
docRouterScene.on("document", handleDocumentWhileWaiting);
