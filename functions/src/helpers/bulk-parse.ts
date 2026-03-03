import { BulkExpenseEntry } from "../types/index";
import { parseExpenseMessage } from "./parse-amount";
import { formatARS } from "./format";

export const MAX_BULK_LINES = 50;

export function stripLinePrefix(line: string): string {
  return line.replace(/^[\d.\-\s]*/, "").trim();
}

export function isBulkMessage(text: string): boolean {
  const nonEmptyLines = text.split("\n")
    .filter((l) => l.trim().length > 0);
  return nonEmptyLines.length >= 2;
}

export function parseBulkLines(
  text: string
): { parsed: BulkExpenseEntry[]; failedLines: string[] } {
  const lines = text.split("\n")
    .filter((l) => l.trim().length > 0);
  const parsed: BulkExpenseEntry[] = [];
  const failedLines: string[] = [];

  for (const line of lines) {
    const cleanedLine = stripLinePrefix(line);
    const result = parseExpenseMessage(cleanedLine);
    if (result) {
      parsed.push({
        description: result.description,
        amount: result.amount,
      });
    } else {
      failedLines.push(line.trim());
    }
  }

  return { parsed, failedLines };
}

export function buildBulkConfirmText(expenses: BulkExpenseEntry[]): string {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  return `¿Deseas registrar ${expenses.length} gastos` +
    ` por un total de ${formatARS(total)}?`;
}

export function buildBulkSummaryText(expenses: BulkExpenseEntry[]): string {
  const lines = [
    `✅ Registrados ${expenses.length} gastos:`,
  ];
  for (const expense of expenses) {
    lines.push(`• ${expense.description} ${formatARS(expense.amount)}`);
  }
  return lines.join("\n");
}
