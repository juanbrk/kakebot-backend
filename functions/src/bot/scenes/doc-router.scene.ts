import { Scenes } from "telegraf";
import { KakebotContext, DocRouterWizardState } from "../../types/telegraf-context.types";
import {
  getSession, setSession, emptySessionForPartial,
} from "../../services/session.service";
import { getServicesByUser } from "../../services/service.service";
import {
  buildDocTypeKeyboard,
  buildInvoiceServiceListKeyboard,
  buildReceiptServiceListKeyboard,
} from "../keyboards/invoice";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";
import { log } from "../../helpers/logger";

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
 * Routes to the invoice flow: writes pendingFileId/pendingFileType to Firestore session,
 * sets the appropriate invoice state, shows the service-picker keyboard, then leaves the scene.
 * After leave(), the legacy invoice handlers continue from Firestore session.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeInvoice(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;

  try {
    const services = await getServicesByUser(telegramUserId);

    if (services.length === 0) {
      await setSession(telegramUserId, {
        ...emptySessionForPartial(telegramUserId),
        state: "invoice_awaiting_name",
        pendingFileId,
        pendingFileType,
      });
      await replyOrEdit(
        ctx,
        buildBreadcrumb(["Factura"]) +
        "No tenés servicios registrados.\n¿Cómo se llama el servicio?\n" +
        "_Enviá la palabra cancelar para salir._",
        { parse_mode: "Markdown" },
      );
      await ctx.scene.leave();
      return;
    }

    const existing = await getSession(telegramUserId);
    await setSession(telegramUserId, {
      ...(existing ?? emptySessionForPartial(telegramUserId)),
      state: "invoice_awaiting_service",
      pendingFileId,
      pendingFileType,
    });

    const keyboard = buildInvoiceServiceListKeyboard(services);
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Factura"]) + "¿A qué servicio corresponde esta factura?",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: keyboard.reply_markup as any,
      },
    );
  } catch (error) {
    log.error("Error routing to invoice flow", error, {
      module: "doc-router.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al procesar la solicitud. Intentá de nuevo.");
  }

  await ctx.scene.leave();
}

/**
 * Routes to the receipt flow: writes pendingFileId/pendingFileType to Firestore session,
 * sets the appropriate receipt state, shows the service-picker keyboard, then leaves the scene.
 * After leave(), the legacy receipt handlers continue from Firestore session.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleDocTypeReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const { pendingFileId, pendingFileType } = ctx.wizard.state as DocRouterWizardState;

  try {
    const services = await getServicesByUser(telegramUserId);

    if (services.length === 0) {
      const existing = await getSession(telegramUserId);
      await setSession(telegramUserId, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(existing as any ?? emptySessionForPartial(telegramUserId)),
        state: "comp_awaiting_name",
        pendingFileId,
        pendingFileType,
      });
      await replyOrEdit(
        ctx,
        buildBreadcrumb(["Comprobante"]) +
        "No tenés servicios registrados.\n¿Cómo se llama el servicio?\n" +
        "_Enviá la palabra cancelar para salir._",
        { parse_mode: "Markdown" },
      );
      await ctx.scene.leave();
      return;
    }

    const existing = await getSession(telegramUserId);
    await setSession(telegramUserId, {
      ...(existing ?? emptySessionForPartial(telegramUserId)),
      state: "comp_awaiting_service",
      pendingFileId,
      pendingFileType,
    });

    const keyboard = buildReceiptServiceListKeyboard(services);
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Comprobante"]) + "¿A qué servicio corresponde este comprobante?",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: keyboard.reply_markup as any,
      },
    );
  } catch (error) {
    log.error("Error routing to receipt flow", error, {
      module: "doc-router.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al procesar la solicitud. Intentá de nuevo.");
  }

  await ctx.scene.leave();
}

/**
 * Re-presents the doc-type keyboard when the user unexpectedly sends a file.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  await ctx.reply("No esperaba un archivo aquí.");
  await ctx.reply(
    "¿Qué tipo de documento es?",
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
docRouterScene.on("photo", repromptCurrentStep);
docRouterScene.on("document", repromptCurrentStep);
