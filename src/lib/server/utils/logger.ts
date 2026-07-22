/**
 * Logging Utilities
 * Provides structured logging for server-side operations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getOptionalEnv } from '$lib/server/utils/env';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

/**
 * Get log file path based on date
 */
function getLogFilePath(prefix: string = 'app'): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logDir = getOptionalEnv('LOG_DIR', 'logs');
  return path.join(logDir, `${prefix}-${date}.log`);
}

/**
 * Write log entry to file
 */
async function writeLog(entry: LogEntry, filename?: string): Promise<void> {
  const logFile = filename || getLogFilePath();
  const logLine = JSON.stringify(entry) + '\n';

  try {
    // Ensure log directory exists
    const logDir = path.dirname(logFile);
    await fs.mkdir(logDir, { recursive: true });

    // Append to log file
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    // Fallback to console if file write fails
    console.error('Failed to write log:', error);
    console.log(logLine);
  }
}

/**
 * Create a log entry
 */
function createLogEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (data !== undefined && data !== null) {
    entry.data = data;
  }
  return entry;
}

/**
 * Log error message
 */
export async function logError(message: string, error?: unknown): Promise<void> {
  const entry = createLogEntry('error', message, error);
  console.error(`[ERROR] ${message}`, error ? error : '');
  await writeLog(entry);
}
