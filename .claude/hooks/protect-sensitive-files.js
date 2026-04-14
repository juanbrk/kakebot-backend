#!/usr/bin/env node
/**
 * PreToolUse Hook: Blocks reads of sensitive environment files
 *
 * Prevents Claude from reading .env, .env.prod, .env.test via Read or Grep.
 * These files contain live secrets (Telegram token, GCS bucket, user IDs).
 * If you need to check env structure, ask the user directly.
 *
 * Exit 0 if OK, Exit 2 if blocked
 *
 * Matcher: Read|Grep
 */

"use strict";

const fs = require("fs");
const path = require("path");

/** Env file basenames that must not be read directly. */
const BLOCKED_BASENAMES = new Set([".env", ".env.prod", ".env.test"]);

/**
 * Returns true if the given file path targets a sensitive env file.
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isSensitiveFile(filePath) {
  if (typeof filePath !== "string") return false;
  return BLOCKED_BASENAMES.has(path.basename(filePath));
}

function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const toolName = input.tool_name || "";

    let targetPath = "";
    if (toolName === "Read") {
      targetPath = input.tool_input?.file_path || "";
    } else if (toolName === "Grep") {
      targetPath = input.tool_input?.path || "";
    }

    if (!isSensitiveFile(targetPath)) {
      process.exit(0);
    }

    process.stderr.write(
      `[protect-sensitive-files] Acceso bloqueado a: ${path.basename(targetPath)}\n` +
      "Estos archivos contienen secrets reales (tokens, keys, bucket names).\n" +
      "Si necesitás saber el valor de una variable, pedísela al usuario.\n" +
      "Para verificar la lista de variables definidas, pedile al usuario que corra: cat functions/.env.prod | cut -d'=' -f1\n"
    );
    process.exit(2);
  } catch {
    process.exit(0); // Fail open — never block Claude due to hook errors
  }
}

main();
