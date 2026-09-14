import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createApiClient, type FetchLike } from './api.js';
import { TOOL_REGISTRARS } from './tools/index.js';

export const SERVER_NAME = 'dokutrak';
export const SERVER_VERSION = '0.1.0';

export interface CreateServerOptions {
  apiKey: string;
  baseUrl: string;
  /** Injected by the contract tests; production uses the global fetch. */
  fetch?: FetchLike;
}

export function createServer(options: CreateServerOptions): McpServer {
  const api = createApiClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    userAgent: `dokutrak-mcp/${SERVER_VERSION}`,
    ...(options.fetch && { fetch: options.fetch }),
  });

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'DokuTrak collects documents from Clients on behalf of a Professional. ' +
        'These tools let the agent create a Document Request, chase the Client on rejected files, ' +
        'read where a request stands and collect the files. Approving or rejecting a document is the ' +
        'decision of the Professional and is not available here.',
    }
  );

  for (const register of TOOL_REGISTRARS) register(server, api);
  return server;
}
