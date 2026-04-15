"use strict";

/**
 * PostToolUse hook — Bash tool only.
 * Detects git commit commands, increments commit counter in dream-state.json,
 * and outputs an advisory to stderr when memory consolidation thresholds are exceeded.
 *
 * Never blocks. Always exits 0.
 */

const fs = require("fs");
const path = require("path");

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const STATE_FILE = path.join(PROJECT_DIR, ".claude", "dream-state.json");
const MEM_SESSIONS_FILE = path.join(
  PROJECT_DIR,
  ".claude",
  "rules",
  "shared",
  "memory-sessions.md"
);

const DEFAULT_STATE = {
  commit_count: 0,
  last_consolidation_commit: 0,
  last_consolidation_timestamp: null,
  total_consolidations: 0,
  thresholds: {
    commits: 10,
    memory_lines: 300,
    memory_bytes: 30720,
  },
};

/**
 * Reads and parses dream-state.json, returning defaults on any failure.
 * @return {object} The parsed state object.
 */
function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Writes the state object back to dream-state.json.
 * @param {object} state - The state to persist.
 */
function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    // Fail silently — never block the user
  }
}

/**
 * Returns line count and byte size of a file, or null if the file doesn't exist.
 * @param {string} filePath - Absolute path to the file.
 * @return {{ lines: number, bytes: number } | null}
 */
function getFileMetrics(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf8");
    return {
      lines: content.split("\n").length,
      bytes: Buffer.byteLength(content, "utf8"),
    };
  } catch (e) {
    return null;
  }
}

let inputData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { inputData += chunk; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(inputData);
    const command = (payload.tool_input && payload.tool_input.command) || "";

    // Only proceed for real git commit invocations.
    // Match: command starts with git commit, or it appears after &&, ||, ;
    // This prevents false positives like: echo '...git commit...' | node ...
    const isGitCommit =
      /(?:^|&&|\|\||;)\s*git\s+commit\b/.test(command) && !/--amend/.test(command);

    if (!isGitCommit) {
      process.exit(0);
    }

    // Increment commit count
    const state = readState();
    state.commit_count = (state.commit_count || 0) + 1;
    writeState(state);

    const thresholds = state.thresholds || DEFAULT_STATE.thresholds;
    const commitsSinceLast = state.commit_count - (state.last_consolidation_commit || 0);

    let triggerReason = null;

    // Check commit threshold
    if (commitsSinceLast >= (thresholds.commits || 10)) {
      triggerReason = `${commitsSinceLast} commits since last consolidation (threshold: ${thresholds.commits})`;
    }

    // Check memory file size (independent of commit count)
    if (!triggerReason) {
      const metrics = getFileMetrics(MEM_SESSIONS_FILE);
      if (metrics) {
        if (metrics.lines >= (thresholds.memory_lines || 300)) {
          triggerReason = `memory-sessions.md has ${metrics.lines} lines (threshold: ${thresholds.memory_lines})`;
        } else if (metrics.bytes >= (thresholds.memory_bytes || 30720)) {
          triggerReason = `memory-sessions.md is ${metrics.bytes} bytes (threshold: ${thresholds.memory_bytes})`;
        }
      }
    }

    if (triggerReason) {
      process.stderr.write(
        `\n🌙 Memory consolidation recommended: ${triggerReason}.\n   Run /mem-consolidate to prune and re-index memory files.\n\n`
      );
    }

    process.exit(0);
  } catch (e) {
    // Fail open — parse errors must never block the user
    process.exit(0);
  }
});
