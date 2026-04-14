#!/usr/bin/env node
/**
 * track-modified-file.js
 *
 * Claude Code PostToolUse hook (Edit | Write).
 * Registers the modified .ts file path in a session-scoped temp file.
 * The actual param check happens at session end via check-session-params.js (Stop hook).
 *
 * Exit 0 always — this hook never blocks.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isCheckableFile } = require("./params-rule-core");

let rawInput = "";
process.stdin.on("data", (chunk) => (rawInput += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path || input.tool_input?.path;
  const sessionId = input.session_id || "default";

  if (!isCheckableFile(filePath)) process.exit(0);

  const trackFile = path.join(os.tmpdir(), `kakebot-params-${sessionId}.txt`);

  try {
    const existing = fs.existsSync(trackFile)
      ? fs.readFileSync(trackFile, "utf8")
      : "";

    // Append only if not already tracked in this session
    if (!existing.split("\n").includes(filePath)) {
      fs.appendFileSync(trackFile, filePath + "\n");
    }
  } catch {
    // Non-blocking: silently ignore tracking errors
  }

  process.exit(0);
});
