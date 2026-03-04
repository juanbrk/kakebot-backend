import { Telegraf, Markup, Context } from "telegraf";
import { Session } from "../../types/index";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import { handleNewCategoryInput, advanceOrFinish } from "../../services/category.service";
import { parseArgentineAmount, parseExpenseMessage } from "../../helpers/parse-amount";
import { formatARS } from "../../helpers/format";
import {
  isBulkMessage, parseBulkLines, buildBulkConfirmText, MAX_BULK_LINES,
} from "../../helpers/bulk-parse";
import {
  createService,
  getInstallment,
  saveInstallment,
  updateServiceName,
  updateInstallmentAmount,
  updateInstallmentDueDay,
} from "../../services/service.service";
import { buildDuplicateKeyboard } from "../keyboards/service";

export function registerTextHandler(bot: Telegraf<Context>): void {
  bot.on("text", async (ctx) => {
    const messageText = ctx.message.text;
    const telegramUserId = ctx.from?.id.toString() || "";

    if (messageText.startsWith("/")) return;

    const session = await getSession(telegramUserId);

    if (session?.state === "awaiting_new_category_name") {
      await handleNewCategoryInput(ctx, session, messageText.trim());
      return;
    }

    if (session?.state === "awaiting_amount") {
      await handleAwaitingAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "awaiting_description") {
      await handleAwaitingDescription(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "categorizing") {
      await handleCategorizingText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_name") {
      await handleServiceName(ctx, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_amount") {
      await handleServiceAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_day") {
      await handleServiceDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_name") {
      await handleEditServiceNameText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_amount") {
      await handleEditServiceAmountText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_day") {
      await handleEditServiceDayText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (isBulkMessage(messageText)) {
      await handleBulkInput(ctx, telegramUserId, messageText);
      return;
    }

    const expense = parseExpenseMessage(messageText);

    if (expense) {
      await ctx.reply(
        `Registrar gasto?\n${expense.description} ${formatARS(expense.amount)}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Cancelar", "cancel"),
          Markup.button.callback(
            "Confirmar",
            `confirm:${expense.description}:${expense.amount}`
          ),
        ])
      );
      return;
    }

    const trimmed = messageText.trim();

    const isJustAmount = /^[\d.,]+$/.test(trimmed);
    if (isJustAmount) {
      const amount = parseArgentineAmount(trimmed);
      if (amount !== null && amount > 0) {
        await setSession(telegramUserId, {
          ...emptySessionForPartial(telegramUserId),
          state: "awaiting_description",
          partialAmount: amount,
        });
        await ctx.reply(`¿En qué gastaste ${formatARS(amount)}?`);
        return;
      }
    }

    const isJustText = !/\d/.test(trimmed);
    if (isJustText) {
      await setSession(telegramUserId, {
        ...emptySessionForPartial(telegramUserId),
        state: "awaiting_amount",
        partialDescription: trimmed,
      });
      await ctx.reply(`¿Cuánto gastaste en ${trimmed}?`);
      return;
    }

    await ctx.reply(
      "No pude interpretar el mensaje.\n" +
      "Formato: <descripcion> <monto>\n" +
      "Ej: Panaderia 5000"
    );
  });
}

async function handleAwaitingAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());
  if (amount !== null && amount > 0) {
    await clearSession(telegramUserId);
    const description = session.partialDescription || "";
    await ctx.reply(
      `Registrar gasto?\n${description} ${formatARS(amount)}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Cancelar", "cancel"),
        Markup.button.callback(
          "Confirmar",
          `confirm:${description}:${amount}`
        ),
      ])
    );
  } else {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\n" +
      "Ej: 5000 o 14.819,50"
    );
  }
}

async function handleAwaitingDescription(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  await clearSession(telegramUserId);
  const amount = session.partialAmount || 0;
  const description = messageText.trim();
  await ctx.reply(
    `Registrar gasto?\n${description} ${formatARS(amount)}`,
    Markup.inlineKeyboard([
      Markup.button.callback("Cancelar", "cancel"),
      Markup.button.callback(
        "Confirmar",
        `confirm:${description}:${amount}`
      ),
    ])
  );
}

async function handleCategorizingText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const lowerText = messageText.trim().toLowerCase();

  if (lowerText === "cancelar") {
    await clearSession(telegramUserId);
    await ctx.reply("Categorización cancelada.");
    return;
  }

  if (lowerText === "omitir") {
    const nextPendingDescs = session.pendingDescs.slice(1);
    const nextDesc = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].normalizedDesc :
      "";
    const nextDisplayName = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].displayName :
      "";
    const nextTotalAmount = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].totalAmount :
      0;

    const updatedSession: Session = {
      ...session,
      pendingDescs: nextPendingDescs,
      currentDesc: nextDesc,
      currentDisplayName: nextDisplayName,
      currentTotalAmount: nextTotalAmount,
      currentPage: 0,
    };

    await setSession(telegramUserId, updatedSession);
    await advanceOrFinish(ctx, updatedSession);
    return;
  }

  await ctx.reply(
    "Tenés una sesión de categorización activa." +
    " Elegí una categoría, o enviá \"omitir\" o \"cancelar\"."
  );
}

async function handleBulkInput(
  ctx: Context,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const nonEmptyLines = messageText.split("\n")
    .filter((l) => l.trim().length > 0);

  if (nonEmptyLines.length > MAX_BULK_LINES) {
    await ctx.reply(
      `El mensaje tiene ${nonEmptyLines.length} líneas.` +
      ` El máximo es ${MAX_BULK_LINES}.`
    );
    return;
  }

  const { parsed, failedLines } = parseBulkLines(messageText);

  if (failedLines.length > 0) {
    const errorLines = failedLines
      .map((line) => `• ${line}`);
    await ctx.reply(
      `No pude interpretar ${failedLines.length} línea(s):\n\n` +
      errorLines.join("\n") +
      "\n\nRevisá el formato: descripcion monto"
    );
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "bulk_pending",
    bulkExpenses: parsed,
  });

  await ctx.reply(
    buildBulkConfirmText(parsed),
    Markup.inlineKeyboard([
      Markup.button.callback("Cancelar", "bulk_cancel"),
      Markup.button.callback("Confirmar", "bulk_confirm"),
    ])
  );
}

async function handleServiceName(
  ctx: Context,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const name = messageText.trim();

  const hasValidName = name.length > 0;
  if (!hasValidName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  const serviceId = await createService(telegramUserId, name);

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_amount",
    serviceId,
    serviceName: name,
  });

  await ctx.reply(
    `✅ Servicio '${name}' creado.\n\n¿Deseas agregar una cuota ahora?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Cancelar", "svc_back"),
        Markup.button.callback("Aceptar", `svc_reg:${serviceId}`),
      ],
    ])
  );
}

async function handleServiceAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  if (amount === null || amount <= 0) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  const serviceId = session.serviceId || "";
  const serviceName = session.serviceName || "";
  const selectedMonth = session.selectedMonth || "";
  const dayStr = session.partialDescription || "";
  const day = parseInt(dayStr, 10);

  const hasRequiredSessionData =
    serviceId && serviceName && selectedMonth && dayStr;
  if (!hasRequiredSessionData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  const existing = await getInstallment(serviceId, selectedMonth);

  if (existing) {
    await setSession(telegramUserId, {
      ...session,
      state: "svc_awaiting_amount",
      partialAmount: amount,
    });

    const keyboard = buildDuplicateKeyboard(existing.id || "");
    await ctx.reply(
      "Ya existe cuota registrada para este mes.",
      keyboard
    );
    return;
  }

  await saveInstallment(
    telegramUserId,
    serviceId,
    serviceName,
    amount,
    dueDate,
    selectedMonth
  );
  await clearSession(telegramUserId);

  const day2 = String(dueDate.getDate()).padStart(2, "0");
  const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");

  await ctx.reply(
    `✅ Cuota registrada: ${serviceName} ${formatARS(amount)} (vence ${day2}/${month2})`
  );
}

async function handleServiceDay(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= 31;
  if (!isValidDay) {
    await ctx.reply("Día inválido. Ingresá un número entre 1 y 31.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "svc_awaiting_amount",
    partialDescription: dayStr,
  });

  await ctx.reply("¿Cuál es el monto de la cuota?");
}

async function handleEditServiceNameText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const newName = messageText.trim();
  const serviceId = session.serviceId || "";

  const hasValidName = newName.length > 0;
  if (!hasValidName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  await updateServiceName(serviceId, newName);
  await clearSession(telegramUserId);

  await ctx.reply(`✅ Nombre actualizado a '${newName}'.`);
}

async function handleEditServiceAmountText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());
  const installmentId = session.installmentId || "";

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  await updateInstallmentAmount(installmentId, amount);
  await clearSession(telegramUserId);

  await ctx.reply(`✅ Monto actualizado a ${formatARS(amount)}.`);
}

async function handleEditServiceDayText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);
  const installmentId = session.installmentId || "";

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= 31;
  if (!isValidDay) {
    await ctx.reply("Día inválido. Ingresá un número entre 1 y 31.");
    return;
  }

  await updateInstallmentDueDay(installmentId, day);
  await clearSession(telegramUserId);

  await ctx.reply(`✅ Vencimiento actualizado al día ${day}.`);
}
