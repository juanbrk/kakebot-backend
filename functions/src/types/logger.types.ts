/**
 * Structured context fields for log entries.
 * All fields are optional — include what's relevant per call site.
 */
export interface LogContext {
  module?: string;
  userId?: string;
  action?: string;
  [key: string]: unknown;
}
