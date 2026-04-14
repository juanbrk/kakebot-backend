#!/usr/bin/env node
/**
 * PostToolUse Hook: GitHub Secrets reminder when .env.prod is modified
 *
 * When Claude writes or edits .env.prod, outputs a critical reminder:
 * the deploy reads from GitHub Repository Secrets, NOT from .env.prod.
 * Without updating the GitHub Secret, the change is invisible in production.
 *
 * Exit 0 always — this hook never blocks (PostToolUse).
 *
 * Matcher: Write|Edit
 */

"use strict";

const fs = require("fs");
const path = require("path");

function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const filePath = input.tool_input?.file_path || "";

    if (path.basename(filePath) !== ".env.prod") {
      process.exit(0);
    }

    // Extract variable names from the written/edited content to be specific
    const content = input.tool_input?.content || input.tool_input?.new_string || "";
    const changedVars = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0].trim())
      .filter(Boolean);

    const varList = changedVars.length > 0
      ? changedVars.map((v) => `  • ${v}`).join("\n")
      : "  (no se pudieron determinar las variables modificadas)";

    process.stderr.write(
      "\n⚠️  .env.prod modificado — ACCIÓN REQUERIDA ANTES DE PRODUCCIÓN\n" +
      "\n" +
      "Variables detectadas:\n" +
      varList + "\n" +
      "\n" +
      "El deploy lee de GitHub Repository Secrets, NO del .env.prod local.\n" +
      "Sin actualizar el Secret, el cambio es invisible en producción.\n" +
      "\n" +
      "Pasos requeridos:\n" +
      "  1. Actualizar cada variable en: GitHub → repo → Settings → Secrets and variables → Actions\n" +
      "  2. Registrar en .pending-secrets: echo 'VAR_NAME' >> scripts/.pending-secrets\n" +
      "  3. Antes del deploy a prod: npm run go → Prod → Sync secrets\n" +
      "\nVer: .claude/rules/shared/environment-secrets.md\n"
    );

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
