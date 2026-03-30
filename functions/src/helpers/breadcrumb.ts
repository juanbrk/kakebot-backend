/**
 * Builds an italic Markdown breadcrumb string with two trailing blank lines.
 * Abbreviates when more than 3 segments: First / ... / Previous / Current.
 *
 * @param {string[]} segments - Breadcrumb path segments
 * @return {string} Formatted breadcrumb or empty string if no segments
 */
export function buildBreadcrumb(segments: string[]): string {
  if (segments.length === 0) return "";

  let path: string;
  if (segments.length <= 3) {
    path = segments.join(" / ");
  } else {
    const first = segments[0];
    const previous = segments[segments.length - 2];
    const current = segments[segments.length - 1];
    path = `${first} / ... / ${previous} / ${current}`;
  }

  return `_${path}_\n\n\n`;
}
