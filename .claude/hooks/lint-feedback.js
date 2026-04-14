#!/usr/bin/env node
/**
 * PostToolUse Hook: ESLint feedback after editing .ts files
 *
 * Runs ESLint on the specific file that was written or edited.
 * Outputs lint violations as context for Claude so issues can be fixed
 * in the same session without waiting for a manual lint run.
 *
 * Exit 0 always — this hook never blocks (PostToolUse).
 *
 * Matcher: Write|Edit
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOKS_DIR = __dirname;
const PROJECT_ROOT = path.resolve(HOOKS_DIR, "../..");
const FUNCTIONS_DIR = path.join(PROJECT_ROOT, "functions");
const ESLINT_BIN = path.join(FUNCTIONS_DIR, "node_modules/.bin/eslint");

/**
 * Returns true if the file is a TypeScript source file worth linting.
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isLintableFile(filePath) {
  return (
    typeof filePath === "string" &&
    (filePath.endsWith(".ts") || filePath.endsWith(".js")) &&
    filePath.includes("/functions/src/") &&
    !filePath.endsWith(".d.ts")
  );
}

function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const filePath = input.tool_input?.file_path || "";

    if (!isLintableFile(filePath)) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    if (!fs.existsSync(ESLINT_BIN)) {
      process.stderr.write(`[lint] eslint not found at ${ESLINT_BIN} — skipping\n`);
      process.exit(0);
    }

    const result = spawnSync(ESLINT_BIN, ["--no-ignore", filePath], {
      cwd: FUNCTIONS_DIR,
      encoding: "utf8",
      timeout: 10000,
    });

    const output = (result.stdout || "").trim();

    if (result.status !== 0 && output) {
      const lines = output.split("\n");
      const preview = lines.slice(0, 20).join("\n");
      const truncated = lines.length > 20 ? `\n  ... (${lines.length - 20} more lines)` : "";

      process.stderr.write(
        `\n[lint] ❌ ESLint violations en ${path.relative(PROJECT_ROOT, filePath)}:\n\n` +
        preview + truncated + "\n"
      );
    } else if (result.status === 0) {
      process.stderr.write(`[lint] ✅ Sin violaciones de ESLint\n`);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
