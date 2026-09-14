import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, readConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = readConfig();
  } catch (error) {
    // stderr only: stdout is the MCP channel and must stay clean.
    process.stderr.write(
      `dokutrak-mcp: ${error instanceof ConfigError ? error.message : String(error)}\n`
    );
    process.exit(1);
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`dokutrak-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
