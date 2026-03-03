import { Telegraf, Context } from "telegraf";

export function registerStartHandler(bot: Telegraf<Context>): void {
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
      "/categorizar - Asignar categorías a gastos sin categorizar"
    );
  });
}
