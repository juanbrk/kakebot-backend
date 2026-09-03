import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";

export function registerStartHandler(bot: Telegraf<KakebotContext>): void {
  bot.start(async (ctx) => {
    const firstName = ctx.from?.first_name || "Usuario";
    await ctx.reply(
      `Hola ${firstName}! Bienvenido a KakeBot.\n\n` +
      "Envia un mensaje con descripcion y monto para registrar un gasto:\n" +
      "Ej: Panaderia 5000\n" +
      "Ej: Carrefour express 14.819\n\n" +
      "Comandos:\n" +
      "/menu - Ver opciones\n" +
      "/reporte - Resumen del mes actual\n" +
      "/categorizar - Asignar categorías a gastos sin categorizar\n" +
      "/servicios - Gestionar servicios fijos (Expensas, Gas, etc.)\n" +
      "/tarjetas - Gestionar tarjetas de crédito\n" +
      "/ingreso - Registrar un ingreso\n" +
      "/ventausd - Registrar una venta de dólares"
    );
  });
}
