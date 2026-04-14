#!/usr/bin/env node

/**
 * PreToolUse Hook: Enforces bullet character usage in TypeScript list formatting
 *
 * Detects tree-style characters (├─, └─) used as list item prefixes in TypeScript
 * string/template literals. These must be replaced with the standard bullet: •
 *
 * Exit 0 if OK, Exit 2 if violations found
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 * Matcher: Edit|Write
 */

const fs = require("fs");

/** Tree characters that should be replaced with bullet • in list formatting. */
const TREE_CHARS = ["\u251C\u2500", "\u2514\u2500"]; // ├─ and └─

/**
 * Returns true if the file path is a TypeScript source file.
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isTypeScriptFile(filePath) {
  return typeof filePath === "string" && filePath.endsWith(".ts");
}

/**
 * Finds tree-character violations in the given content.
 * Returns an array of violation objects with line number and char found.
 *
 * @param {string} content
 * @return {{ line: number; char: string }[]}
 */
function findViolations(content) {
  const violations = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    for (const treeChar of TREE_CHARS) {
      if (line.includes(treeChar)) {
        violations.push({ line: index + 1, char: treeChar });
        break;
      }
    }
  });

  return violations;
}

/**
 * Main entry point: reads stdin, checks content, outputs violations.
 */
function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const filePath = input.tool_input.file_path || "";

    if (!isTypeScriptFile(filePath)) {
      process.exit(0);
    }

    const fileContent =
      input.tool_input.content || input.tool_input.new_string || "";

    if (!fileContent) {
      process.exit(0);
    }

    const violations = findViolations(fileContent);

    if (violations.length > 0) {
      violations.forEach((v) => {
        console.error(
          `Line ${v.line}: [list-bullet] Tree character "${v.char}" detected — ` +
          "use bullet • (U+2022) for list items instead (see shared/conventions.md)"
        );
      });
      process.exit(2);
    }

    process.exit(0);
  } catch (err) {
    console.error("Hook error:", err.message);
    process.exit(0); // Don't block on hook errors
  }
}

main();
