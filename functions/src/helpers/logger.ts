import { logger } from "firebase-functions/logger";
import { LogContext } from "../types/logger.types";

/**
 * Serializes an unknown catch-block error into a plain object safe for structured logging.
 *
 * @param {unknown} error - The caught error value from a catch block.
 * @return {Record<string, unknown>} Plain object with name, message, and stack when available.
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: String(error), raw: error };
}

/**
 * Structured logger wrapping firebase-functions/logger.
 * Writes JSON with severity levels recognized by Cloud Logging.
 * In local dev, writes structured output to stdout/stderr.
 */
export const log = {
  /**
   * Logs an informational message with optional structured context.
   *
   * @param {string} message - Human-readable description of the event.
   * @param {LogContext} context - Optional structured fields (module, userId, action, etc.)
   * @return {void}
   */
  info(message: string, context?: LogContext): void {
    logger.info(message, context ?? {});
  },

  /**
   * Logs a warning with optional structured context.
   *
   * @param {string} message - Description of the warning condition.
   * @param {LogContext} context - Optional structured fields.
   * @return {void}
   */
  warn(message: string, context?: LogContext): void {
    logger.warn(message, context ?? {});
  },

  /**
   * Logs an error from a catch block with serialized error details.
   *
   * @param {string} message - Description of the operation that failed.
   * @param {unknown} error - The caught error value (unknown in strict TS).
   * @param {LogContext} context - Optional structured fields (module, userId, action, etc.)
   * @return {void}
   */
  error(message: string, error: unknown, context?: LogContext): void {
    logger.error(message, { ...context, error: serializeError(error) });
  },
};
