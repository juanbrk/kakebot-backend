"use strict";

/**
 * UserPromptSubmit hook — no tool matcher, fires on every message.
 * Advances the commit counter by diffing git HEAD against the last-seen SHA in
 * dream-state.json. Claude never runs `git commit` itself (hard wall), so a
 * PostToolUse/Bash hook watching for that command can never fire — SHA-diffing on
 * every prompt is what actually observes commits made outside Claude's own tool
 * calls (Juan's terminal, `!` prefix, an IDE). Emits an advisory when memory
 * consolidation thresholds are exceeded.
 * Never blocks — exits 0 on every path, including the catch.
 */

const fs = require("fs");
const path = require("path");
const { runGit, resolveRoot } = require("./git-utils");

const STATE_FILE_REL = [".claude", "dream-state.json"];
const MEM_SESSIONS_FILE_REL = [".claude", "rules", "shared", "memory-sessions.md"];

const DEFAULT_STATE = {
  commit_count: 0,
  last_consolidation_commit: 0,
  last_consolidation_timestamp: null,
  total_consolidations: 0,
  last_counted_sha: null,
  thresholds: {
    commits: 10,
    memory_lines: 300,
    memory_bytes: 30720,
  },
};

/**
 * Reads and parses dream-state.json, returning defaults merged with whatever exists.
 * @param {string} stateFile - Absolute path to dream-state.json.
 * @return {object}
 */
function readState(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) {
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(stateFile, "utf8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Writes the state object back to dream-state.json.
 * @param {string} stateFile - Absolute path to dream-state.json.
 * @param {object} state - The state to persist.
 */
function writeState(stateFile, state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch {
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
  } catch {
    return null;
  }
}

/**
 * Emits the consolidation advisory as hookSpecificOutput.additionalContext.
 * @param {string} reason - Human-readable reason the threshold was crossed.
 */
function emitAdvisory(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        `Memory consolidation recommended: ${reason}. Run /mem-consolidate to prune and re-index memory files.`,
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

    const stateFile = path.join(root, ...STATE_FILE_REL);
    const state = readState(stateFile);

    const currentHead = runGit(["rev-parse", "HEAD"], root);
    if (!currentHead) {
      process.exit(0);
    }

    if (!state.last_counted_sha) {
      // Bootstrap: nothing to diff against yet — seed from live HEAD and count
      // nothing this run, so switching to SHA-diff doesn't retroactively count
      // pre-existing history as new commits.
      state.last_counted_sha = currentHead;
      writeState(stateFile, state);
      process.exit(0);
    }

    if (state.last_counted_sha !== currentHead) {
      const newCommits = runGit(
        ["rev-list", "--count", `${state.last_counted_sha}..${currentHead}`],
        root
      );
      const delta = newCommits ? parseInt(newCommits, 10) : 0;
      if (delta > 0) {
        state.commit_count = (state.commit_count || 0) + delta;
      }
      state.last_counted_sha = currentHead;
      writeState(stateFile, state);
    }

    const thresholds = state.thresholds || DEFAULT_STATE.thresholds;
    const commitsSinceLast = state.commit_count - (state.last_consolidation_commit || 0);

    let triggerReason = null;

    if (commitsSinceLast >= (thresholds.commits || 10)) {
      triggerReason = `${commitsSinceLast} commits since last consolidation (threshold: ${thresholds.commits})`;
    }

    if (!triggerReason) {
      const metrics = getFileMetrics(path.join(root, ...MEM_SESSIONS_FILE_REL));
      if (metrics) {
        if (metrics.lines >= (thresholds.memory_lines || 300)) {
          triggerReason = `memory-sessions.md has ${metrics.lines} lines (threshold: ${thresholds.memory_lines})`;
        } else if (metrics.bytes >= (thresholds.memory_bytes || 30720)) {
          triggerReason = `memory-sessions.md is ${metrics.bytes} bytes (threshold: ${thresholds.memory_bytes})`;
        }
      }
    }

    if (triggerReason) {
      emitAdvisory(triggerReason);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
