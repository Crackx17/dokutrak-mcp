import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.js';

/**
 * The seam the contract tests sit on: a real MCP client talking to the real
 * server over the SDK's in-process transport, with HTTP stubbed at `fetch`.
 * Tests call tools, never functions, and no DokuTrak account is involved.
 */
export const BASE_URL = 'https://api.test/api';
export const API_KEY = 'dk_live_test_only';

export interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface Reply {
  status?: number;
  json?: unknown;
  body?: Uint8Array | string;
  headers?: Record<string, string>;
}

export interface Route {
  method: string;
  path: string | RegExp;
  reply: Reply | ((call: RecordedCall) => Reply) | Error;
}

export function problem(status: number, title: string, detail: string, extra: Record<string, unknown> = {}): Reply {
  return {
    status,
    headers: { 'content-type': 'application/problem+json' },
    json: { type: `https://dokutrak.com/errors/${status}`, title, status, detail, instance: '/api/v1/x', ...extra },
  };
}

export function envelope(data: unknown, extra: Record<string, unknown> = {}): Reply {
  return { status: 200, json: { success: true, data, meta: { timestamp: '2026-09-14T00:00:00.000Z' }, ...extra } };
}

function toResponse(reply: Reply): Response {
  const headers = new Headers(reply.headers ?? {});
  if (reply.json !== undefined) {
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers });
  }
  return new Response(reply.body ?? '', { status: reply.status ?? 200, headers });
}

export async function connect(routes: Route[]) {
  const calls: RecordedCall[] = [];

  const fetchStub = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const call: RecordedCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
    };
    calls.push(call);

    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === call.method &&
        (typeof r.path === 'string' ? r.path === call.path : r.path.test(call.path))
    );
    if (!route) {
      return toResponse(problem(404, 'Not Found', `No stub for ${call.method} ${call.path}`));
    }
    if (route.reply instanceof Error) throw route.reply;
    return toResponse(typeof route.reply === 'function' ? route.reply(call) : route.reply);
  };

  const server = createServer({ apiKey: API_KEY, baseUrl: BASE_URL, fetch: fetchStub });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'contract-tests', version: '0.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    calls,
    call: (name: string, args: Record<string, unknown> = {}) =>
      client.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function textOf(result: CallToolResult): string {
  return result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

export function jsonOf<T = any>(result: CallToolResult): T {
  return JSON.parse(textOf(result)) as T;
}
