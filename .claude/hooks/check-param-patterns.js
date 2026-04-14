#!/usr/bin/env node

/**
 * PreToolUse Hook: Validates TypeScript parameter patterns
 *
 * Detects two violations:
 * 1. Body destructuring: const { ... } = params; in function body
 * 2. Inline type annotations: }:{ in function signatures
 *
 * Exit 0 if OK, Exit 2 if violations found
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 * Matcher: Edit|Write
 */

const fs = require("fs");

/**
 * Removes strings and comments from TypeScript source to avoid false positives
 * in string literals and JSDoc/comments.
 */
function stripStringsAndComments(src) {
  let result = src;

  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, "");

  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Remove string literals (single, double, backtick)
  // Handle escaped quotes within strings
  result = result.replace(/'(?:\\.|[^'\\])*'/g, " ");
  result = result.replace(/"(?:\\.|[^"\\])*"/g, " ");
  result = result.replace(/`(?:\\.|[^`\\])*`/g, " ");

  return result;
}

/**
 * Finds parameter pattern violations in TypeScript code.
 * Returns array of violation objects with line number and message.
 */
function findViolations(content) {
  const violations = [];
  const stripped = stripStringsAndComments(content);

  // Pattern 1: Inline type annotations
  // Detects "}: {" which indicates inline parameter type definition
  // Example: function foo({ x, y }: { x: string; y: number })
  const inlineTypePattern = /\}\s*:\s*\{/g;
  let match;

  while ((match = inlineTypePattern.exec(stripped)) !== null) {
    const lineNum = content.substring(0, match.index).split("\n").length;
    violations.push({
      line: lineNum,
      type: "inline-type",
      message:
        "Inline type annotation detected (}:{) — define a named interface in types/ instead",
    });
  }

  // Pattern 2: Body destructuring
  // Detects "const { ... } = varName;" in function body
  // This is boilerplate that should be moved to the function signature
  const bodyDestructPattern = /\bconst\s+\{[^}]+\}\s*=\s*\w+\s*;/g;

  while ((match = bodyDestructPattern.exec(stripped)) !== null) {
    // Verify this is not a false positive by checking context
    // (could be in a different scope, but we err on the side of reporting)
    const lineNum = content.substring(0, match.index).split("\n").length;
    violations.push({
      line: lineNum,
      type: "body-destruct",
      message:
        "Destructuring in function body — move to function signature instead",
    });
  }

  return violations;
}

/**
 * Main entry point: reads stdin, checks content, outputs violations
 */
function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf-8"));
    const fileContent =
      input.tool_input.content || input.tool_input.new_string || "";

    if (!fileContent) {
      process.exit(0);
    }

    const violations = findViolations(fileContent);

    if (violations.length > 0) {
      violations.forEach((v) => {
        console.error(
          `Line ~${v.line}: [${v.type}] ${v.message}`
        );
      });
      process.exit(2); // Block the operation
    }

    process.exit(0);
  } catch (err) {
    console.error("Hook error:", err.message);
    process.exit(0); // Don't block on hook errors
  }
}

main();
