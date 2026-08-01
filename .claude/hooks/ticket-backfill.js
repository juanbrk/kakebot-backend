"use strict";

/**
 * UserPromptSubmit hook — no tool matcher, fires on every message.
 * Backfills PENDING-SHA placeholders in TICKET.md's Hecho|Done section once the
 * pending-since marker shows a real commit landed since /commit or /commit-lite
 * wrote it. Never blocks — exits 0 on every path, including the catch.
 */

const fs = require("fs");
const path = require("path");
const { runGit, resolveRoot } = require("./git-utils");

const HEADING_RE = /^##\s+(Hecho|Done)\b.*$/m;
const MARKER_RE = /^[ \t]*<!--\s*pending-since:\s*([0-9a-f]{7,40})\s*-->[ \t]*\n?/m;
const PENDING_SHA_TOKEN = "`PENDING-SHA`";

/**
 * Locates the Hecho|Done section within TICKET.md content, bounded by the next
 * `## ` heading or end of file.
 * @param {string} content - Full TICKET.md content.
 * @return {{ start: number, end: number } | null}
 */
function findDoneSection(content) {
  const headingMatch = HEADING_RE.exec(content);
  if (!headingMatch) return null;
  const start = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(start);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? start + nextHeadingMatch.index : content.length;
  return { start, end };
}

/**
 * Emits a short confirmation of the backfill as hookSpecificOutput.additionalContext.
 * @param {number} count - Number of PENDING-SHA entries resolved.
 * @param {string} sha - The real short SHA they were backfilled with.
 */
function emitBackfillContext(count, sha) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        `ticket-backfill: resolved ${count} PENDING-SHA ${count === 1 ? "entry" : "entries"} in TICKET.md to \`${sha}\`.`,
    },
  }));
}

function main() {
  try {
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const root = resolveRoot(payload.cwd);
    if (!root) {
      process.exit(0);
    }

    const ticketPath = path.join(root, "TICKET.md");
    if (!fs.existsSync(ticketPath)) {
      process.exit(0);
    }

    const content = fs.readFileSync(ticketPath, "utf8");
    const section = findDoneSection(content);
    if (!section) {
      process.exit(0);
    }

    const sectionText = content.slice(section.start, section.end);
    if (!sectionText.includes(PENDING_SHA_TOKEN)) {
      process.exit(0);
    }

    const markerMatch = MARKER_RE.exec(sectionText);
    if (!markerMatch) {
      process.exit(0);
    }

    const markerSha = markerMatch[1];
    const currentHead = runGit(["rev-parse", "--short", "HEAD"], root);
    if (!currentHead || currentHead === markerSha) {
      process.exit(0);
    }

    const pendingCount = sectionText.split(PENDING_SHA_TOKEN).length - 1;
    const updatedSectionText = sectionText
      .replace(MARKER_RE, "")
      .split(PENDING_SHA_TOKEN)
      .join(`\`${currentHead}\``);

    const updatedContent =
      content.slice(0, section.start) + updatedSectionText + content.slice(section.end);

    fs.writeFileSync(ticketPath, updatedContent);
    emitBackfillContext(pendingCount, currentHead);
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
