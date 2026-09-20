import { escapeHtml } from "./format";

/**
 * Builds an italic HTML breadcrumb string with two trailing blank lines.
 * Abbreviates when more than 3 segments: First / ... / Previous / Current.
 * Each segment is HTML-escaped so user-supplied names (entity, tax, card)
 * cannot break the surrounding markup.
 *
 * @param {string[]} segments - Breadcrumb path segments
 * @return {string} Formatted breadcrumb or empty string if no segments
 */
export function buildBreadcrumb(segments: string[]): string {
  if (segments.length === 0) return "";

  const escaped = segments.map(escapeHtml);

  let path: string;
  if (escaped.length <= 3) {
    path = escaped.join(" / ");
  } else {
    const first = escaped[0];
    const previous = escaped[escaped.length - 2];
    const current = escaped[escaped.length - 1];
    path = `${first} / ... / ${previous} / ${current}`;
  }

  return `<i>${path}</i>\n\n`;
}
