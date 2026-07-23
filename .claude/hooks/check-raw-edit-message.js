#!/usr/bin/env node

/**
 * PreToolUse Hook: Forbids bare .editMessageText calls in bot handlers and scenes
 *
 * Enforces the three-way rule (shared/conventions.md, wizard-scenes.md §9):
 *   - write-then-edit confirmation  → editOrReply (helpers/telegram.ts)
 *   - cosmetic edit in a callback   → replyOrEdit (helpers/telegram.ts)
 *   - bare ctx.editMessageText      → forbidden in bot/handlers/ and bot/scenes/
 *
 * The low-level ctx.telegram.editMessageText loop in services/category.service.ts
 * is a documented exception and lives outside the guarded paths.
 *
 * Exit 0 if OK, Exit 2 if violations found
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 * Matcher: Edit|Write
 */

const fs = require("fs");

/** Path fragments where bare .editMessageText is forbidden. */
const GUARDED_PATHS = ["functions/src/bot/handlers/", "functions/src/bot/scenes/"];

/**
 * Returns true if the file path is a TypeScript file inside a guarded bot directory.
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isGuardedBotFile(filePath) {
  if (typeof filePath !== "string" || !filePath.endsWith(".ts")) {
    return false;
  }
  return GUARDED_PATHS.some((fragment) => filePath.includes(fragment));
}

/**
 * Finds bare .editMessageText call violations in the given content.
 * Returns an array of violation objects with line number and matched text.
 *
 * @param {string} content
 * @return {{ line: number; snippet: string }[]}
 */
function findViolations(content) {
  const violations = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (line.includes(".editMessageText(")) {
      violations.push({ line: index + 1, snippet: line.trim().slice(0, 80) });
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

    if (!isGuardedBotFile(filePath)) {
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
          `Line ${v.line}: [raw-edit-message] Bare .editMessageText detected — ` +
          "use replyOrEdit (cosmetic edit) or editOrReply (write-then-edit) from " +
          `helpers/telegram.ts instead (see shared/conventions.md): ${v.snippet}`
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
