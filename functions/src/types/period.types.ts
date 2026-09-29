import { InlineKeyboardButton } from "telegraf/types";

export interface BuildYearSelectorKeyboardParams {
  years: string[];
  callbackPrefix: string;
  backCallback: string;
  backLabel?: string;
  actionRows?: InlineKeyboardButton[][];
}
