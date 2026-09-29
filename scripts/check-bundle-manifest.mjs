// The MCP Bundle manifest must describe the server it ships: same version as
// package.json, and the same tools as the built server lists over MCP.
// Run by `npm run bundle` after the build, before `mcpb pack`.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${root}mcpb/manifest.json`, 'utf8'));

const problems = [];
if (manifest.version !== pkg.version) {
  problems.push(`mcpb/manifest.json version ${manifest.version} != package.json ${pkg.version}`);
}

// Start the bundled server the way Claude Desktop does, and ask it for its tools.
const server = spawn(process.execPath, [`${root}mcpb/server/index.cjs`], {
  env: { ...process.env, DOKUTRAK_API_KEY: 'dk_live_bundle_check', DOKUTRAK_API_URL: 'https://app.dokutrak.com/api' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const replies = new Map();
let buffer = '';
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.id !== undefined) replies.set(message.id, message);
    }
  }
});

const send = (message) => server.stdin.write(`${JSON.stringify(message)}\n`);
const reply = async (id) => {
  for (let i = 0; i < 100 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 50));
  if (!replies.has(id)) throw new Error(`the bundled server did not answer request ${id}`);
  return replies.get(id);
};

try {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bundle-check', version: '0' } },
  });
  const init = await reply(1);
  if (init.result?.serverInfo?.version !== pkg.version) {
    problems.push(`bundled server reports version ${init.result?.serverInfo?.version} != package.json ${pkg.version}`);
  }
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = (await reply(2)).result.tools.map((t) => t.name).sort();
  const declared = manifest.tools.map((t) => t.name).sort();
  if (JSON.stringify(listed) !== JSON.stringify(declared)) {
    problems.push(`manifest tools [${declared}] != server tools [${listed}]`);
  }
  console.log(`bundled server ${init.result.serverInfo.name} ${init.result.serverInfo.version}: tools ${listed.join(', ')}`);
} finally {
  server.kill();
}

if (problems.length) {
  for (const p of problems) console.error(`check-bundle-manifest: ${p}`);
  process.exit(1);
}
