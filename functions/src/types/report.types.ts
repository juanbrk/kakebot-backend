import { Context } from "telegraf";

export interface MonthlyReport {
  detail: string;
  balance: string;
}

export interface ShowMonthSelectorParams {
  ctx: Context;
  year: string;
  allPastMonths: string[];
  backCallback: string;
}
