/**
 * params-rule-core.js
 *
 * Shared logic for the 4+ params rule.
 * Used by track-modified-file.js (PostToolUse) and check-session-params.js (Stop).
 */

"use strict";

/** @param {string} src @return {string} */
function stripStringsAndComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "//")
    .replace(/\/\*[\s\S]*?\*\//g, "/**/")
    .replace(/`[^`]*`/gs, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** @param {string} paramBlock @return {number} */
function countTopLevelCommas(paramBlock) {
  let depth = 0;
  let commas = 0;
  for (const ch of paramBlock) {
    if ("<({[".includes(ch)) depth++;
    else if (">)}]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) commas++;
  }
  return commas;
}

/** @param {string} src @param {number} openParen @return {string} */
function extractParamBlock(src, openParen) {
  let depth = 1;
  let i = openParen + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") depth--;
    i++;
  }
  return src.slice(openParen + 1, i - 1);
}

/**
 * Scans TypeScript source for functions with 4+ positional parameters.
 *
 * @param {string} content - Raw file content
 * @return {string[]} Violation descriptions (empty = clean)
 */
function findViolations(content) {
  const cleaned = stripStringsAndComments(content);
  const violations = [];
  const FN_REGEX = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;

  let match;
  while ((match = FN_REGEX.exec(cleaned)) !== null) {
    const fnName = match[1];
    const openParen = match.index + match[0].length - 1;
    const paramBlock = extractParamBlock(cleaned, openParen);

    if (paramBlock.trim().startsWith("{")) continue;

    const commas = countTopLevelCommas(paramBlock);
    const hasTrailingComma = paramBlock.trim().endsWith(",");
    const paramCount = commas + 1 - (hasTrailingComma ? 1 : 0);
    if (paramCount < 4) continue;

    const lineNum = cleaned.slice(0, match.index).split("\n").length;
    violations.push(`línea ${lineNum}: \`${fnName}\` — ${paramCount} parámetros posicionales`);
  }

  return violations;
}

/**
 * Returns true if the file path should be checked (TS source, not .d.ts).
 *
 * @param {string} filePath
 * @return {boolean}
 */
function isCheckableFile(filePath) {
  return (
    typeof filePath === "string" &&
    filePath.endsWith(".ts") &&
    !filePath.endsWith(".d.ts")
  );
}

module.exports = { findViolations, isCheckableFile };
