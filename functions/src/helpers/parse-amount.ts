const AMOUNT_PATTERN =
  /([\d]+(?:\.[\d]{3})*,[\d]+|[\d]+[.,][\d]+|[\d]+)/;
export const AMOUNT_AT_END =
  new RegExp(`^(.+?)\\s+${AMOUNT_PATTERN.source}$`);
export const AMOUNT_AT_START =
  new RegExp(`^${AMOUNT_PATTERN.source}\\s+(.+)$`);

export function toFloatOrNull(value: string): number | null {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses Argentine-format amount strings into numbers.
 *
 * Rules:
 * - Comma = decimal separator (e.g. "1000,50" → 1000.50)
 * - Dot + comma = AR format: dot = thousands, comma = decimal (e.g. "238.130,00" → 238130)
 * - Dot without comma = decimal separator, truncated to 2 digits (e.g. "157.324" → 157.32)
 *
 * @param {string} input - e.g. "238.130,00", "9.444,32", "238130", "54.32", "157.324"
 * @return {number | null} Parsed number or null if invalid
 */
export function parseArgentineAmount(input: string): number | null {
  // AR format: dot = thousands separator, comma = decimal separator (e.g. "238.130,00")
  if (input.includes(",")) {
    const withoutThousands = input.replace(/\./g, "");
    const withDotDecimal = withoutThousands.replace(",", ".");
    return toFloatOrNull(withDotDecimal);
  }

  if (input.includes(".")) {
    // Dot is always treated as decimal separator. Truncate to 2 decimal digits (no rounding).
    const [intPart, decPart = ""] = input.split(".");
    const truncatedDecPart = decPart.slice(0, 2);
    const normalized = truncatedDecPart.length > 0 ? `${intPart}.${truncatedDecPart}` : intPart;
    return toFloatOrNull(normalized);
  }

  return toFloatOrNull(input);
}

export function parseExpenseMessage(
  text: string
): { description: string; amount: number } | null {
  const trimmed = text.trim();

  const amountAtEnd = trimmed.match(AMOUNT_AT_END);
  if (amountAtEnd) {
    const amount = parseArgentineAmount(amountAtEnd[2]);
    if (amount !== null && amount > 0) {
      return { description: amountAtEnd[1].trim(), amount };
    }
  }

  const amountAtStart = trimmed.match(AMOUNT_AT_START);
  if (amountAtStart) {
    const amount = parseArgentineAmount(amountAtStart[1]);
    if (amount !== null && amount > 0) {
      return { description: amountAtStart[2].trim(), amount };
    }
  }

  return null;
}
