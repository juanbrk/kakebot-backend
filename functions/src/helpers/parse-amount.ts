const AMOUNT_PATTERN =
  /([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?|[\d]+(?:\.[\d]{1,2})?)/;
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
 * Handles thousands separator (dot) and decimal separator (comma).
 *
 * @param {string} input - e.g. "238.130,00", "9.444,32", "238130", "8.50"
 * @return {number | null} Parsed number or null if invalid
 */
export function parseArgentineAmount(input: string): number | null {
  if (input.includes(",")) {
    const withoutThousands = input.replace(/\./g, "");
    const withDotDecimal = withoutThousands.replace(",", ".");
    return toFloatOrNull(withDotDecimal);
  }

  if (input.includes(".")) {
    const dotSegments = input.split(".");
    const decimalPart = dotSegments[dotSegments.length - 1];
    const looksLikeDecimal =
      dotSegments.length === 2 && decimalPart.length <= 2;

    if (looksLikeDecimal) {
      return toFloatOrNull(input);
    }

    const withoutThousands = input.replace(/\./g, "");
    return toFloatOrNull(withoutThousands);
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
