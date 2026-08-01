"use strict";

/**
 * PostToolUse hook — Edit|Write|MultiEdit.
 * Unchecks the pr-audit checkpoint in TICKET.md when a source file changes, and
 * recommends /ticket-consolidate when TICKET.md itself grows past the line limit.
 * Never blocks — exits 0 on every path, including the catch.
 */

const fs = require("fs");
const path = require("path");
const { resolveRoot } = require("./git-utils");

const LINE_LIMIT = 150;
const SOURCE_EXTENSIONS = [".ts", ".js", ".json", ".rules"];
// .claude/rules/ is prose (conventions, decisions) — not source. Everything else under
// .claude/ (hooks, settings, commands) DOES count: editing tracking code must still
// invalidate a stale pr-audit checkmark.
const EXCLUDED_DIR_PREFIXES = [
  ".claude/rules/",
  "emulator-data/",
  "functions/lib/",
  "node_modules/",
];
const EXCLUDED_BASENAMES = ["package-lock.json", "dream-state.json"];

/**
 * Whether a modified file counts as a "source" change that invalidates a
 * completed pr-audit checkpoint.
 * @param {string} relativePath - File path relative to the repo root, forward-slash separated.
 * @return {boolean}
 */
function isSourceChange(relativePath) {
  if (!relativePath) return false;
  if (EXCLUDED_DIR_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) return false;
  if (EXCLUDED_BASENAMES.includes(path.basename(relativePath))) return false;
  return SOURCE_EXTENSIONS.includes(path.extname(relativePath));
}

/**
 * Unchecks the pr-audit checkpoint line if currently checked, stamping today's date
 * and dropping any stale verdict summary. Scoped strictly to the Checkpoints section
 * text — other sections (e.g. Acceptance Criteria) can legitimately contain a bullet
 * that also starts with "pr-audit" and must never be touched. Returns the content
 * unchanged when there's nothing to flip or the Checkpoints section is missing.
 * @param {string} content - Full TICKET.md content.
 * @return {string}
 */
function uncheckPrAudit(content) {
  const headingMatch = /^##\s+Checkpoints\b.*$/im.exec(content);
  if (!headingMatch) return content;

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(sectionStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const sectionEnd = nextHeadingMatch ? sectionStart + nextHeadingMatch.index : content.length;

  const sectionText = content.slice(sectionStart, sectionEnd);
  const prAuditLine = /^-\s\[x\]\spr-audit\b.*$/m;
  if (!prAuditLine.test(sectionText)) return content;

  const today = new Date().toISOString().slice(0, 10);
  const updatedSection = sectionText.replace(prAuditLine, `- [ ] pr-audit — ${today}`);
  return content.slice(0, sectionStart) + updatedSection + content.slice(sectionEnd);
}

/**
 * Emits the size-limit advisory as hookSpecificOutput.additionalContext.
 * @param {number} lineCount - Current TICKET.md line count.
 */
function emitSizeDirective(lineCount) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        `TICKET.md tiene ${lineCount} líneas (límite: ${LINE_LIMIT}). Correr /ticket-consolidate.`,
    },
  }));
}

function main() {
  try {
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const filePath = (payload.tool_input && payload.tool_input.file_path) || "";
    if (!filePath) {
      process.exit(0);
    }

    const root = resolveRoot(payload.cwd);
    if (!root) {
      process.exit(0);
    }

    const ticketPath = path.join(root, "TICKET.md");
    if (!fs.existsSync(ticketPath)) {
      process.exit(0);
    }

    const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const relativePath = path.relative(root, absoluteFilePath).split(path.sep).join("/");

    // TICKET.md itself always short-circuits to the size check — editing the ticket
    // can never uncheck a checkpoint.
    if (relativePath === "TICKET.md") {
      const content = fs.readFileSync(ticketPath, "utf8");
      const lineCount = content.split("\n").length;
      if (lineCount > LINE_LIMIT) {
        emitSizeDirective(lineCount);
      }
      process.exit(0);
    }

    if (!isSourceChange(relativePath)) {
      process.exit(0);
    }

    const content = fs.readFileSync(ticketPath, "utf8");
    const updated = uncheckPrAudit(content);
    if (updated !== content) {
      fs.writeFileSync(ticketPath, updated);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
