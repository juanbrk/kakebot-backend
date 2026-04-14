#!/usr/bin/env node
/**
 * check-session-params.js
 *
 * Claude Code Stop hook.
 * Reads the session-scoped list of modified .ts files (built by track-modified-file.js),
 * runs the 4+ params rule on each one, and exits 2 if violations are found.
 *
 * Exit 0: all clean (or no .ts files were modified in this session)
 * Exit 2: violations found — Claude must fix before session can end
 *
 * The tracking file is always deleted after the check, whether clean or not.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { findViolations, isCheckableFile } = require("./params-rule-core");

let rawInput = "";
process.stdin.on("data", (chunk) => (rawInput += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    process.exit(0);
  }

  const sessionId = input.session_id || "default";
  const trackFile = path.join(os.tmpdir(), `kakebot-params-${sessionId}.txt`);

  if (!fs.existsSync(trackFile)) process.exit(0);

  const modifiedFiles = fs
    .readFileSync(trackFile, "utf8")
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => isCheckableFile(f));

  // Always clean up the tracking file
  try {
    fs.unlinkSync(trackFile);
  } catch {
    // ignore
  }

  if (modifiedFiles.length === 0) process.exit(0);

  const violatingFiles = [];

  for (const filePath of modifiedFiles) {
    if (!fs.existsSync(filePath)) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const violations = findViolations(content);
    if (violations.length > 0) {
      violatingFiles.push({ filePath, violations });
    }
  }

  if (violatingFiles.length === 0) process.exit(0);

  const lines = [
    "",
    "❌ VIOLACIÓN — Funciones con 4+ parámetros posicionales",
    "   Regla: usar un objeto único como parámetro (ver .claude/rules/shared/conventions.md)",
    "",
  ];

  for (const { filePath, violations } of violatingFiles) {
    const relPath = filePath.replace(process.cwd() + "/", "");
    lines.push(`   ${relPath}:`);
    violations.forEach((v) => lines.push(`     ${v}`));
  }

  lines.push("");
  process.stderr.write(lines.join("\n") + "\n");
  process.exit(2);
});
