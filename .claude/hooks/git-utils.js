"use strict";

/**
 * Shared git helpers for the TICKET.md tracking hooks (ticket-check.js,
 * ticket-backfill.js, commit-dream-check.js).
 */

const { execFileSync } = require("child_process");

/**
 * Runs a git command against the given cwd, returning trimmed stdout or null on failure.
 * @param {string[]} args - Argv for git (no shell).
 * @param {string} cwd - Working directory for the command.
 * @return {string | null}
 */
function runGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolves the repo (worktree) root: payload.cwd -> $CLAUDE_PROJECT_DIR -> process.cwd(),
 * then `git rev-parse --show-toplevel` from that base. Never derived from __dirname.
 * @param {string} payloadCwd - cwd field from the hook payload, if present.
 * @return {string | null}
 */
function resolveRoot(payloadCwd) {
  const base = payloadCwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return runGit(["rev-parse", "--show-toplevel"], base);
}

module.exports = { runGit, resolveRoot };
