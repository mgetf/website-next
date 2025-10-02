/**
 * Logging Utilities
 * Provides structured logging for server-side operations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequestEvent } from '@sveltejs/kit';

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
	const logDir = process.env.LOG_DIR || 'logs';
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
	return {
		timestamp: new Date().toISOString(),
		level,
		message,
		...(data && { data })
	};
}

/**
 * Log info message
 */
export async function logInfo(message: string, data?: unknown): Promise<void> {
	const entry = createLogEntry('info', message, data);
	console.log(`[INFO] ${message}`, data ? data : '');
	await writeLog(entry);
}

/**
 * Log warning message
 */
export async function logWarn(message: string, data?: unknown): Promise<void> {
	const entry = createLogEntry('warn', message, data);
	console.warn(`[WARN] ${message}`, data ? data : '');
	await writeLog(entry);
}

/**
 * Log error message
 */
export async function logError(message: string, error?: unknown): Promise<void> {
	const entry = createLogEntry('error', message, error);
	console.error(`[ERROR] ${message}`, error ? error : '');
	await writeLog(entry);
}

/**
 * Log debug message (only in development)
 */
export async function logDebug(message: string, data?: unknown): Promise<void> {
	if (process.env.NODE_ENV !== 'development') {
		return;
	}

	const entry = createLogEntry('debug', message, data);
	console.debug(`[DEBUG] ${message}`, data ? data : '');
	await writeLog(entry);
}

/**
 * Log request details to file (useful for debugging)
 */
export async function logRequest(event: RequestEvent, filename?: string): Promise<void> {
	const reqData = {
		method: event.request.method,
		url: event.url.toString(),
		pathname: event.url.pathname,
		searchParams: Object.fromEntries(event.url.searchParams),
		headers: Object.fromEntries(event.request.headers),
		ip: event.getClientAddress(),
		user: event.locals.user?.steamId || 'anonymous'
	};

	const entry = createLogEntry('info', `Request: ${event.request.method} ${event.url.pathname}`, reqData);
	await writeLog(entry, filename);
}

/**
 * Log form action to file
 */
export async function logFormAction(
	action: string,
	user: string | undefined,
	data: unknown,
	filename?: string
): Promise<void> {
	const entry = createLogEntry('info', `Form Action: ${action}`, {
		user: user || 'anonymous',
		data
	});
	await writeLog(entry, filename);
}

/**
 * Create a custom logger with a specific prefix
 */
export function createLogger(prefix: string) {
	return {
		info: (message: string, data?: unknown) => logInfo(`[${prefix}] ${message}`, data),
		warn: (message: string, data?: unknown) => logWarn(`[${prefix}] ${message}`, data),
		error: (message: string, error?: unknown) => logError(`[${prefix}] ${message}`, error),
		debug: (message: string, data?: unknown) => logDebug(`[${prefix}] ${message}`, data)
	};
}

/**
 * Logger instance for general use
 */
export const logger = {
	info: logInfo,
	warn: logWarn,
	error: logError,
	debug: logDebug,
	request: logRequest,
	formAction: logFormAction
};

