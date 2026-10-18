/**
 * Stdio entry for the mge-league MCP server.
 * stdout is the protocol channel. Logs go to stderr.
 */

import { createInterface } from 'node:readline';
import { LeagueApi, resolveApiBase } from './api.js';
import { dispatchMcp } from './mcp.js';

const baseUrl = resolveApiBase();
const api = new LeagueApi({ baseUrl });
console.error(`mge-league MCP reading ${baseUrl}`);

const lines = createInterface({ input: process.stdin, terminal: false });
lines.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void handleLine(trimmed);
});

async function handleLine(line: string): Promise<void> {
  let message: unknown;
  try {
    message = JSON.parse(line) as unknown;
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  try {
    if (Array.isArray(message)) {
      if (message.length === 0) {
        write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
        return;
      }
      const bodies: unknown[] = [];
      for (const item of message) {
        const result = await dispatchMcp(item, api);
        if (result.kind === 'json') bodies.push(result.body);
      }
      if (bodies.length > 0) write(bodies);
      return;
    }

    const result = await dispatchMcp(message, api);
    if (result.kind === 'json') write(result.body);
  } catch (err) {
    const text = err instanceof Error ? err.message : 'Internal error';
    write({ jsonrpc: '2.0', id: null, error: { code: -32603, message: text } });
  }
}

function write(body: unknown): void {
  process.stdout.write(`${JSON.stringify(body)}\n`);
}
