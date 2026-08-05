import { Scenes } from "telegraf";
import {
  KakebotContext,
  CardStatementDocWizardState,
  CardStmtWizardState,
} from "../../types/telegraf-context.types";
import { CreditCard } from "../../types/index";
import { log } from "../../helpers/logger";
import { replyOrEdit } from "../../helpers/telegram";
import { buildCardLabel, buildStatementDocCardPickerKeyboard } from "../keyboards/card";
import { getCardById, getCardsByUser, getStatementsByCard } from "../../services/card.service";
import { CARD_STMT_SCENE_ID } from "./card-stmt.scene";

export const CARD_STATEMENT_DOC_SCENE_ID = "card-statement-doc-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

// Cursor position of the card selector guard.
const CARD_GUARD_STEP = 1;

// How many months ahead the statement create flow offers, mirroring buildCardStmtMonthKeyboard.
const MONTHS_AHEAD = 3;

const CARD_PROMPT = "*¿A qué tarjeta corresponde el resumen?*";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the YYYY-MM keys the statement create flow can still offer for a card,
 * i.e. the next three months minus the ones that already have a statement.
 *
 * @param {string[]} existingMonths - YYYY-MM keys already registered for the card
 * @return {string[]} Months still available
 */
function getAvailableMonths(existingMonths: string[]): string[] {
  const now = new Date();
  const upcomingMonths = Array.from({ length: MONTHS_AHEAD }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  return upcomingMonths.filter((month) => !existingMonths.includes(month));
}

/**
 * Sends the card selector as a new message. Used by the cursor guard, the file reprompt and
 * the recovery paths — never to consume a button (those edit the message instead).
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCardPicker(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";
  try {
    const cards = await getCardsByUser(telegramUserId);
    await ctx.reply(CARD_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildStatementDocCardPickerKeyboard(cards, 0).reply_markup as any,
    });
  } catch (error) {
    log.error("Error rebuilding card picker", error, {
      module: "card-statement-doc.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar las tarjetas. Intentá de nuevo.");
  }
}

// ─── steps ────────────────────────────────────────────────────────────────────

/**
 * Step 0: entered from the doc-router with the statement PDF already captured.
 * Shows the card selector, or explains why there is nothing to pick and leaves.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    const cards = await getCardsByUser(telegramUserId);

    if (cards.length === 0) {
      await ctx.reply(
        "No tenés ninguna tarjeta registrada. Registrala desde el menú Tarjetas y volvé a enviar el resumen.",
      );
      await ctx.scene.leave();
      return;
    }

    await ctx.reply(CARD_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildStatementDocCardPickerKeyboard(cards, 0).reply_markup as any,
    });
    ctx.wizard.selectStep(CARD_GUARD_STEP);
  } catch (error) {
    log.error("Error loading cards in card-statement-doc scene", error, {
      module: "card-statement-doc.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar las tarjetas. Intentá de nuevo.");
    await ctx.scene.leave();
  }
}

/**
 * Step 1: cursor guard — fires when the user types while the card selector is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardCardPicker(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí una tarjeta del teclado, o escribí \"cancelar\" para anular.");
  await repromptCardPicker(ctx);
}

// ─── action handlers ──────────────────────────────────────────────────────────

/**
 * Handles card selection: hands the pending PDF to the statement create flow of card-stmt.scene,
 * pre-populated exactly as handleAddStatementFromList does from the card menu.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePickCard(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStatementDocWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];

  let card: CreditCard | null;
  let existingMonths: string[];
  try {
    const [pickedCard, statements] = await Promise.all([
      getCardById(cardId),
      getStatementsByCard(cardId, telegramUserId),
    ]);
    card = pickedCard;
    existingMonths = statements.map((statement) => statement.month);
  } catch (error) {
    log.error("Error loading card in card-statement-doc scene", error, {
      module: "card-statement-doc.scene",
      userId: telegramUserId,
      cardId,
    });
    await ctx.reply("Error al cargar la tarjeta. Intentá de nuevo.");
    await repromptCardPicker(ctx);
    return;
  }

  if (!card) {
    await ctx.reply("Tarjeta no encontrada.");
    await repromptCardPicker(ctx);
    return;
  }

  const cardLabel = buildCardLabel(card);

  // Recover in place instead of leaving: the user still holds an unfiled PDF and another
  // card may well have room, so the selector comes back rather than dead-ending the flow.
  if (getAvailableMonths(existingMonths).length === 0) {
    await replyOrEdit(ctx, `*Ya existen resúmenes para los próximos 3 meses de ${cardLabel}.*`, {
      parse_mode: "Markdown",
    });
    await repromptCardPicker(ctx);
    return;
  }

  await replyOrEdit(
    ctx,
    `*Vas a registrar un nuevo resumen para la tarjeta ${cardLabel}*\n`
    + "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "create",
    cardId,
    cardLabel,
    existingMonths,
    pendingFileId: state.pendingFileId,
  } as CardStmtWizardState);
}

/**
 * Handles pagination of the card selector.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCardPagination(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);

  try {
    const cards = await getCardsByUser(telegramUserId);
    await replyOrEdit(ctx, CARD_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildStatementDocCardPickerKeyboard(cards, page).reply_markup as any,
    });
  } catch (error) {
    log.error("Error paginating card picker", error, {
      module: "card-statement-doc.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar las tarjetas. Intentá de nuevo.");
  }
}

// ─── reprompt ─────────────────────────────────────────────────────────────────

/**
 * Re-presents the card selector when the user sends another file mid-flow. The PDF that
 * started the flow was already captured by the doc-router, so a new one is unexpected here.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0:
  case CARD_GUARD_STEP:
    await repromptCardPicker(ctx);
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
  await ctx.reply("Carga del resumen cancelada.");
  await ctx.scene.leave();
}

// ─── scene export ─────────────────────────────────────────────────────────────

export const cardStatementDocScene = new Scenes.WizardScene<KakebotContext>(
  CARD_STATEMENT_DOC_SCENE_ID,
  stepInit,
  stepGuardCardPicker,
);

cardStatementDocScene.hears(CANCEL_REGEX, handleCancelWord);
cardStatementDocScene.action(/^stmtdoc_pick:(.+)$/, handlePickCard);
cardStatementDocScene.action(/^stmtdoc_pg:(\d+)$/, handleCardPagination);
cardStatementDocScene.on("photo", repromptCurrentStep);
cardStatementDocScene.on("document", repromptCurrentStep);
