#!/usr/bin/env node

/**
 * PreToolUse Hook: Validates WizardScene structural standard
 *
 * Activates on Edit|Write of files matching functions/src/bot/scenes/*.scene.ts.
 *
 * Checks (all must pass; first failure blocks the operation):
 *  1. Imports getMessageText from helpers/wizard (only if the scene reads message text)
 *  2. CANCEL_REGEX declared with canonical literal
 *  3. Exports [DOMAIN]_SCENE_ID with "-wizard" suffix
 *  4. Registers scene.hears(CANCEL_REGEX, ...)
 *  5. Registers scene.on("photo", ...) and scene.on("document", ...)
 *  6. Defines function repromptCurrentStep
 *  7. Async function names use sanctioned prefixes (step/handle/reprompt/get/...)
 *  8. Exports the scene as `[domain]Scene = new Scenes.WizardScene<...>(...)`
 *
 * Reglamento: .claude/rules/shared/wizard-scenes.md
 *
 * Exit 0 if OK or N/A, Exit 2 if violations found.
 */

const fs = require("fs");
const path = require("path");

const SANCTIONED_PREFIXES = [
  "step", "handle", "reprompt", "get", "build", "is", "has",
  "find", "format", "parse", "download", "upload", "fetch",
  "create", "save", "update", "delete", "mark", "should",
  "can", "ensure", "validate", "resolve",
];

/** Returns true if path looks like functions/src/bot/scenes/*.scene.ts. */
function isWizardSceneFile(filePath) {
  if (typeof filePath !== "string") return false;
  return /\/bot\/scenes\/[a-z][\w-]*\.scene\.ts$/.test(filePath);
}

/** Strips comments and string literals to avoid false positives. */
function stripStringsAndComments(src) {
  let r = src;
  r = r.replace(/\/\/.*$/gm, "");
  r = r.replace(/\/\*[\s\S]*?\*\//g, " ");
  r = r.replace(/'(?:\\.|[^'\\])*'/g, "''");
  r = r.replace(/"(?:\\.|[^"\\])*"/g, "\"\"");
  r = r.replace(/`(?:\\.|[^`\\])*`/g, "``");
  return r;
}

/**
 * Reconstructs the file content as it would look after the tool call.
 * - Write: tool_input.content is the full new file.
 * - Edit: apply old_string → new_string against current disk content.
 */
function getMergedContent(input) {
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;

  if (typeof toolInput.content === "string") {
    return toolInput.content;
  }

  if (typeof toolInput.new_string === "string" && filePath) {
    let original = "";
    try {
      original = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
      return toolInput.new_string;
    }
    const oldString = toolInput.old_string || "";
    if (oldString === "") return original;
    return original.replace(oldString, toolInput.new_string);
  }

  return "";
}

/** Returns the list of async function names declared at top level. */
function extractAsyncFunctionNames(stripped) {
  const names = [];
  const re = /async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    names.push(m[1]);
  }
  return names;
}

/** Returns array of violation strings. Empty array means compliant. */
function findViolations(content, filePath) {
  const violations = [];
  const stripped = stripStringsAndComments(content);

  // 1. Import getMessageText from helpers/wizard — only for scenes that read incoming text.
  // Keyboard-only scenes (doc-router, bulk, tax-receipt) never touch message text, so requiring
  // the import there would only add a dead import. The rule's intent is to stop scenes from
  // hand-rolling text extraction, so it applies exactly when the scene reads text.
  const readsMessageText =
    /getMessageText\s*\(/.test(stripped) || /ctx\.message[^\n]*\.text/.test(stripped);
  const importsGetMessageText = /import\s*\{[^}]*\bgetMessageText\b[^}]*\}\s*from\s*['"][^'"]*helpers\/wizard['"]/.test(content);
  if (readsMessageText && !importsGetMessageText) {
    violations.push(
      "[import] Missing import: `getMessageText` must be imported from `helpers/wizard` " +
      "(reglamento §12). Add: import { getMessageText } from \"../../helpers/wizard\";"
    );
  }

  // 2. CANCEL_REGEX canonical literal
  // Match against the original (string literals not stripped of regex literals).
  const hasCanonicalCancelRegex = /CANCEL_REGEX\s*=\s*\/\^\\s\*\(salir\|cancelar\|terminar\|stop\)\\s\*\$\/i/.test(content);
  if (!hasCanonicalCancelRegex) {
    violations.push(
      "[cancel-regex] Missing canonical CANCEL_REGEX (reglamento §2.1). Add: " +
      "const CANCEL_REGEX = /^\\s*(salir|cancelar|terminar|stop)\\s*$/i;"
    );
  }

  // 3. Export [DOMAIN]_SCENE_ID with -wizard suffix
  const sceneIdMatch = content.match(/export\s+const\s+(\w+_SCENE_ID)\s*=\s*"([a-z][\w-]*-wizard)"/);
  if (!sceneIdMatch) {
    violations.push(
      "[scene-id] Missing exported SCENE_ID with `-wizard` suffix (reglamento §2.1). " +
      "Expected: export const [DOMAIN]_SCENE_ID = \"[domain]-wizard\";"
    );
  }

  // 4. scene.hears(CANCEL_REGEX, ...)
  const hasHearsCancel = /\w+Scene\.hears\(\s*CANCEL_REGEX\s*,/.test(stripped);
  if (!hasHearsCancel) {
    violations.push(
      "[hears] Missing scene.hears(CANCEL_REGEX, ...) registration (reglamento §7.1)."
    );
  }

  // 5. scene.on("photo", ...) and scene.on("document", ...)
  const hasOnPhoto = /\w+Scene\.on\(\s*['"]photo['"]\s*,/.test(content);
  const hasOnDocument = /\w+Scene\.on\(\s*['"]document['"]\s*,/.test(content);
  if (!hasOnPhoto) {
    violations.push(
      "[on-photo] Missing scene.on(\"photo\", ...) registration (reglamento §7.3). " +
      "Required even if the flow does not accept files."
    );
  }
  if (!hasOnDocument) {
    violations.push(
      "[on-document] Missing scene.on(\"document\", ...) registration (reglamento §7.3). " +
      "Required even if the flow does not accept files."
    );
  }

  // 6. function repromptCurrentStep
  const hasReprompt = /(async\s+)?function\s+repromptCurrentStep\s*\(/.test(stripped);
  if (!hasReprompt) {
    violations.push(
      "[reprompt] Missing `repromptCurrentStep` function (reglamento §6). " +
      "Must include switch over ctx.wizard.cursor."
    );
  }

  // 7. Async function naming
  const asyncNames = extractAsyncFunctionNames(stripped);
  const offenders = asyncNames.filter((name) => {
    if (name === "repromptCurrentStep") return false;
    return !SANCTIONED_PREFIXES.some((p) => name.startsWith(p));
  });
  if (offenders.length > 0) {
    violations.push(
      "[naming] Async function(s) with non-sanctioned prefix: " +
      offenders.map((n) => `\`${n}\``).join(", ") +
      ". Use `step*` for wizard steps, `handle*` for action handlers, " +
      "or descriptive helper prefixes (get/build/find/format/parse/...). " +
      "Reglamento §2.2, §2.3."
    );
  }

  // 8. Export of the scene
  const sceneExportMatch = content.match(/export\s+const\s+(\w+Scene)\s*=\s*new\s+Scenes\.WizardScene\s*</);
  if (!sceneExportMatch) {
    violations.push(
      "[scene-export] Missing scene export. Expected: " +
      "export const [domain]Scene = new Scenes.WizardScene<KakebotContext>(SCENE_ID, ...steps);"
    );
  } else if (sceneIdMatch) {
    // Cross-check: scene export name domain should match SCENE_ID domain.
    const sceneVarName = sceneExportMatch[1];
    const sceneIdValue = sceneIdMatch[2];
    const domainFromVar = sceneVarName.replace(/Scene$/, "").toLowerCase();
    const domainFromId = sceneIdValue.replace(/-wizard$/, "");
    if (domainFromVar !== domainFromId.replace(/-/g, "")) {
      violations.push(
        `[scene-export] Domain mismatch: \`${sceneVarName}\` (export) vs ` +
        `\`${sceneIdValue}\` (SCENE_ID). Expected matching domain (kebab-case in ID, camelCase in export).`
      );
    }
  }

  return violations;
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf-8"));
  } catch (err) {
    process.exit(0);
  }

  const filePath = (input.tool_input && input.tool_input.file_path) || "";
  if (!isWizardSceneFile(filePath)) {
    process.exit(0);
  }

  let content;
  try {
    content = getMergedContent(input);
  } catch (err) {
    process.exit(0);
  }

  if (!content || content.trim().length === 0) {
    process.exit(0);
  }

  const violations = findViolations(content, filePath);

  if (violations.length > 0) {
    const fileName = path.basename(filePath);
    process.stderr.write(
      `\n[check-wizard-scene] Violations in ${fileName} ` +
      "(see .claude/rules/shared/wizard-scenes.md):\n"
    );
    violations.forEach((v) => process.stderr.write(`  • ${v}\n`));
    process.stderr.write("\n");
    process.exit(2);
  }

  process.exit(0);
}

main();
