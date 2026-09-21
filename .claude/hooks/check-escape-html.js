#!/usr/bin/env node
/**
 * PreToolUse hook: warns when a .ts edit interpolates a likely entity name
 * inside a template literal near parse_mode: "HTML" without escapeHtml().
 *
 * Advisory only (exit 0) — flags the pattern, never blocks.
 */

const ENTITY_FIELDS = [
  "name", "serviceName", "taxName", "cardLabel", "bank",
  "reason", "description", "displayName", "label",
  "categoryName", "displayReason", "entityName",
];

const FIELD_PATTERN = ENTITY_FIELDS.map((f) => `(?:${f})`).join("|");
const UNESCAPED_INTERPOLATION = new RegExp(
  `\\$\\{(?!escapeHtml\\()(?:[^}]*\\.)?(?:${FIELD_PATTERN})(?:\\s*\\|\\|[^}]*)?\\}`,
);

function main() {
  const input = JSON.parse(require("fs").readFileSync("/dev/stdin", "utf8"));

  const toolName = input.tool_name;
  if (toolName !== "Edit" && toolName !== "Write" && toolName !== "MultiEdit") {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path || "";
  if (!filePath.endsWith(".ts")) {
    process.exit(0);
  }

  const content = input.tool_input?.new_string || input.tool_input?.content || "";
  if (!content) {
    process.exit(0);
  }

  const hasHtmlParseMode = /parse_mode.*HTML/i.test(content) || /<b>|<i>|<code>/.test(content);
  if (!hasHtmlParseMode) {
    process.exit(0);
  }

  const match = content.match(UNESCAPED_INTERPOLATION);
  if (match) {
    process.stderr.write(
      `[check-escape-html] WARNING: possible unescaped entity field in HTML context: ${match[0]}\n`
      + `  File: ${filePath}\n`
      + `  Rule: wrap user-supplied text with escapeHtml() at the interpolation site.\n`
      + `  See: .claude/rules/shared/conventions.md "HTML Escaping"\n`,
    );
  }

  process.exit(0);
}

main();
