import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from './api.js';

/**
 * A tool never throws. A refusal from the service, a network failure, a bug
 * in the Connector: each comes back as a tool result flagged `isError`, with
 * the service's own `detail` when there is one, so the agent can read it and
 * tell the Professional — instead of the MCP client surfacing a raw exception.
 */
export async function runTool(
  body: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await body();
  } catch (error) {
    return errorResult(describe(error));
  }
}

export function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const code = typeof error.problem?.code === 'string' ? ` [${error.problem.code}]` : '';
    return `DokuTrak refused the call — ${error.title} (${error.status})${code}: ${error.detail}`;
  }
  if (error instanceof Error) {
    return `The Connector could not reach DokuTrak: ${error.message}`;
  }
  return `The Connector failed: ${String(error)}`;
}

export function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}
