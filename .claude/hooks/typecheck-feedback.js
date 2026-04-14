#!/usr/bin/env node
/**
 * PostToolUse Hook: TypeScript type-check feedback after editing .ts files
 *
 * Runs `tsc --noEmit` from the functions/ directory when a .ts source file
 * is written or edited. Outputs type errors as context for Claude so issues
 * can be fixed in the same session without waiting for a manual build.
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
const TSC_BIN = path.join(FUNCTIONS_DIR, "node_modules/.bin/tsc");

/**
 * Returns true if the file is a TypeScript source file worth checking.
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isCheckableFile(filePath) {
  return (
    typeof filePath === "string" &&
    filePath.endsWith(".ts") &&
    !filePath.endsWith(".d.ts") &&
    filePath.includes("/functions/src/")
  );
}

function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const filePath = input.tool_input?.file_path || "";

    if (!isCheckableFile(filePath)) process.exit(0);

    if (!fs.existsSync(TSC_BIN)) {
      console.log("[typecheck] tsc not found at", TSC_BIN, "— skipping");
      process.exit(0);
    }

    const result = spawnSync(TSC_BIN, ["--noEmit"], {
      cwd: FUNCTIONS_DIR,
      encoding: "utf8",
      timeout: 15000,
    });

    const output = (result.stdout || "") + (result.stderr || "");

    if (result.status !== 0 && output.trim()) {
      const lines = output.trim().split("\n");
      const preview = lines.slice(0, 25).join("\n");
      const truncated = lines.length > 25 ? `\n  ... (${lines.length - 25} more lines)` : "";

      process.stderr.write(
        `\n[typecheck] ❌ TypeScript errors encontrados en ${path.relative(PROJECT_ROOT, filePath)}:\n\n` +
        preview + truncated + "\n"
      );
    } else if (result.status === 0) {
      process.stderr.write(`[typecheck] ✅ Sin errores de TypeScript\n`);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
