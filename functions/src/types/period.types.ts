import { InlineKeyboardButton } from "telegraf/types";

export interface BuildPaginatedKeyboardRowsParams<T> {
  items: T[];
  page: number;
  perPage: number;
  buttonLabel: (item: T) => string;
  buttonCallback: (item: T) => string;
  navCallback: (navPage: number) => string;
}

export interface BuildYearSelectorKeyboardParams {
  years: string[];
  callbackPrefix: string;
  backCallback: string;
  backLabel?: string;
  actionRows?: InlineKeyboardButton[][];
}
