import { Markup } from "telegraf";
import { Category } from "../../types/index";
import { formatARS } from "../../helpers/format";

export const CATEGORIES_PER_PAGE = 4;

export function buildCategoryKeyboard(categories: Category[], page: number) {
  const start = page * CATEGORIES_PER_PAGE;
  const pageCategories = categories.slice(start, start + CATEGORIES_PER_PAGE);
  const hasNext = start + CATEGORIES_PER_PAGE < categories.length;
  const hasPrev = page > 0;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (let i = 0; i < pageCategories.length; i += 2) {
    const row: ReturnType<typeof Markup.button.callback>[] = [];
    row.push(Markup.button.callback(pageCategories[i].name,
      `cat_sel:${pageCategories[i].id}`));
    if (i + 1 < pageCategories.length) {
      row.push(Markup.button.callback(pageCategories[i + 1].name,
        `cat_sel:${pageCategories[i + 1].id}`));
    }
    buttons.push(row);
  }

  const navRow: ReturnType<typeof Markup.button.callback>[] = [];
  if (hasPrev) {
    navRow.push(Markup.button.callback("← Anterior", `cat_pg:${page - 1}`));
  }
  if (hasNext) {
    navRow.push(Markup.button.callback("Más categorías →", `cat_pg:${page + 1}`));
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback("+ Agregar categoría", "cat_new"),
  ]);

  return Markup.inlineKeyboard(buttons);
}

export function buildExpensePromptText(
  displayName: string,
  totalAmount: number,
  current: number,
  total: number
): string {
  return (
    `*${displayName}* ${formatARS(totalAmount)} (${current} de ${total})\n` +
    "• Elegí una categoría o creá una nueva\n" +
    "• Enviá \"omitir\" para saltar\n" +
    "• Enviá \"cancelar\" para salir"
  );
}
