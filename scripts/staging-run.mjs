#!/usr/bin/env node
/**
 * The scripted run ADR-014 asks for before the first public release:
 * create → chase → read → collect → revoke → 401, driven through the built
 * binary (`dist/cli.js`) by a real MCP client over stdio, against a real
 * workspace. Its transcript is pasted into the release PR.
 *
 * It is a record, not a check. ADR-013: a blocking check calls no third party
 * at request time, so this never runs in CI and no workflow references it.
 *
 * It needs a human at the keyboard twice, because the service refuses both
 * acts to an Agent Connection by design: rejecting the uploaded file
 * (Human Approval, ADR-009 §2) and revoking the key (`/v1/api-keys` is
 * session-only). The script pauses and says what to do.
 *
 * Environment:
 *   DOKUTRAK_API_KEY          the Agent Connection to exercise — issued from
 *                             Settings → Connect an agent, origin `mcp`
 *   DOKUTRAK_API_URL          base URL ending in /api (default: production)
 *   STAGING_RECIPIENT_EMAIL   the Client mailbox. A real email leaves the
 *                             service to this address; it must be yours.
 *   STAGING_REPORT            where to write the transcript
 *                             (default: ./staging-run-<timestamp>.md, git-ignored)
 *
 * Usage: npm run build && npm run staging
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const EXPECTED_TOOLS = ['create_request', 'request_replacement', 'get_request', 'download_documents'];
const CLI = new URL('../dist/cli.js', import.meta.url).pathname;

const apiKey = process.env.DOKUTRAK_API_KEY?.trim();
const baseUrl = (process.env.DOKUTRAK_API_URL?.trim() || 'https://app.dokutrak.com/api').replace(/\/+$/, '');
const recipient = process.env.STAGING_RECIPIENT_EMAIL?.trim();
const startedAt = new Date();
const reportPath = process.env.STAGING_REPORT?.trim() || `staging-run-${startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 16)}.md`;

if (!apiKey) die('DOKUTRAK_API_KEY is not set. Issue an Agent Connection from Settings → Connect an agent and export it.');
if (!recipient) die('STAGING_RECIPIENT_EMAIL is not set. A real Document Request email goes to that address; use a mailbox you control.');
if (!existsSync(CLI)) die(`${CLI} does not exist. Run \`npm run build\` first: the run exercises the built binary.`);
if (!stdin.isTTY) die('This run needs a terminal: it pauses twice for acts only a signed-in Professional can perform.');

const steps = [];
const rl = createInterface({ input: stdin, output: stdout });

log(`dokutrak-mcp staging run — ${startedAt.toISOString()}`);
log(`API: ${baseUrl}`);
log(`Key: ${apiKey.slice(0, 8)}… (${apiKey.length} chars; never written to the report)`);
log(`Recipient: ${recipient}`);
log(`Report: ${reportPath}`);
log('');
log('This creates a real Document Request in the workspace of the key and emails the recipient above.');
await confirm('Continue?');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [CLI],
  env: { ...getDefaultEnvironment(), DOKUTRAK_API_KEY: apiKey, DOKUTRAK_API_URL: baseUrl },
  stderr: 'pipe',
});
transport.stderr?.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
const client = new Client({ name: 'dokutrak-mcp-staging-run', version: '0' });

let requestId;
let failed = false;
try {
  await client.connect(transport);
  const info = client.getServerVersion();
  log(`Connected to ${info?.name} ${info?.version}`);

  // 0. The surface, as a client sees it on connect.
  await step('tools/list', null, async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expectEqual(names, [...EXPECTED_TOOLS].sort(), 'tool names');
    return { content: [{ type: 'text', text: names.join(', ') }] };
  });

  // 1. Ask.
  const stamp = startedAt.toISOString().slice(0, 16).replace('T', ' ');
  const title = `Connector staging run ${stamp}`;
  const created = await step('create_request', {
    recipient_email: recipient,
    recipient_name: 'Staging Client',
    title,
    message: 'Staging run of the DokuTrak Connector. Upload any file; it will be rejected on purpose.',
    deadline: plusDays(14),
    documents: [{ title: 'Any document', description: 'Any file will do — it is rejected on purpose to exercise the chase.' }],
  }, async (args) => {
    const result = await callTool('create_request', args);
    expectOk(result);
    const body = json(result);
    expectTruthy(body.sent === true, 'sent === true');
    expectTruthy(isUuid(body.requestId), 'requestId is a uuid');
    expectTruthy(!text(result).includes('/upload/'), 'no upload link relayed');
    requestId = body.requestId;
    return result;
  });
  log(`Document Request ${requestId} created and sent.`);

  // Human act 1: upload as the Client, reject as the Professional.
  log('');
  log('── Human act 1 ─────────────────────────────────────────────────────────');
  log(`1. Open the email received at ${recipient} and upload one file through its Secure Upload Link.`);
  log(`2. In the DokuTrak dashboard, open "${title}" and REJECT that file, with any reason.`);
  log('   (Rejecting is the Professional’s decision; no tool here can take it — that is the point.)');
  await confirm('Done?');

  // 2. Know, before the chase: the rejection must be visible to the agent.
  await step('get_request (by id, before the chase)', { request_id: requestId }, async (args) => {
    const result = await callTool('get_request', args);
    expectOk(result);
    const body = json(result);
    const rejected = body.documents.filter((d) => d.verdict === 'rejected');
    expectTruthy(rejected.length >= 1, 'at least one rejected document');
    expectTruthy(!JSON.stringify(body).includes('/upload/'), 'no upload link relayed');
    expectTruthy(!('url' in (body.documents[0] ?? {})), 'no storage locator relayed');
    return result;
  });

  // 3. Chase.
  await step('request_replacement', { request_id: requestId, message: 'Staging run: please send the file again.' }, async (args) => {
    const result = await callTool('request_replacement', args);
    expectOk(result);
    const body = json(result);
    expectEqual(body.status, 'pending_resubmission', 'status after the chase');
    expectTruthy(/No email was sent/.test(body.note), 'the note says nothing was emailed');
    return result;
  });

  // 4. Know, by search this time.
  await step('get_request (by search)', { search: title }, async (args) => {
    const result = await callTool('get_request', args);
    expectOk(result);
    const body = json(result);
    expectEqual(body.request?.id, requestId, 'search resolves to the created request');
    expectEqual(body.request?.status, 'pending_resubmission', 'status read back');
    return result;
  });

  // 5. Collect.
  await step('download_documents', { request_id: requestId }, async (args) => {
    const result = await callTool('download_documents', args);
    expectOk(result);
    const resource = result.content.find((c) => c.type === 'resource')?.resource;
    expectTruthy(resource?.blob, 'an embedded resource with a blob');
    expectEqual(resource.mimeType, 'application/zip', 'mime type');
    const bytes = Buffer.from(resource.blob, 'base64');
    expectTruthy(bytes.length > 22 && bytes[0] === 0x50 && bytes[1] === 0x4b, `a zip (PK header, ${bytes.length} bytes)`);
    return { ...result, content: result.content.map((c) => (c.type === 'resource' ? { type: 'resource', resource: { ...c.resource, blob: `<${bytes.length} bytes, base64 omitted>` } } : c)) };
  });

  // Human act 2: revoke.
  log('');
  log('── Human act 2 ─────────────────────────────────────────────────────────');
  log('In DokuTrak, Settings → Connect an agent: REVOKE the Agent Connection this run is using.');
  log('(Keys cannot revoke keys; the service answers 403 to any key on /v1/api-keys.)');
  await confirm('Revoked?');

  // 6. The very next call fails with the service's 401. The server process has
  // not restarted: the key it holds in memory is the one just revoked.
  await step('get_request (after revocation)', { request_id: requestId }, async (args) => {
    const result = await callTool('get_request', args);
    expectTruthy(result.isError === true, 'isError');
    expectTruthy(/\(401\)/.test(text(result)), `the tool relays a 401 — got: ${text(result).slice(0, 200)}`);
    return result;
  });
} catch (error) {
  failed = true;
  log('');
  log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  rl.close();
  await client.close().catch(() => {});
  writeFileSync(reportPath, report());
  log('');
  log(`${failed ? 'FAIL' : 'PASS'} — transcript written to ${reportPath}`);
  process.exit(failed ? 1 : 0);
}

// ── helpers ──────────────────────────────────────────────────────────────

async function step(name, args, body) {
  const t0 = Date.now();
  log('');
  log(`▶ ${name}`);
  try {
    const result = await body(args);
    steps.push({ name, args, ok: true, ms: Date.now() - t0, result });
    log(`  ok (${Date.now() - t0} ms)`);
    return result;
  } catch (error) {
    steps.push({ name, args, ok: false, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function callTool(name, args) {
  return client.callTool({ name, arguments: args });
}

function text(result) {
  return result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}
function json(result) {
  return JSON.parse(text(result));
}
function expectOk(result) {
  if (result.isError) throw new Error(`tool returned an error: ${text(result)}`);
}
function expectTruthy(value, what) {
  if (!value) throw new Error(`expected ${what}`);
}
function expectEqual(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
function plusDays(days) {
  const d = new Date(startedAt);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function confirm(question) {
  let answer;
  try {
    answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  } catch {
    die('Aborted by the operator (end of input).');
  }
  if (answer !== 'y' && answer !== 'yes') die('Aborted by the operator.');
}
function log(line) {
  stdout.write(`${line}\n`);
}
function die(message) {
  process.stderr.write(`staging-run: ${message}\n`);
  process.exit(1);
}

function report() {
  const lines = [];
  lines.push(`## Staging run — ${startedAt.toISOString()}`);
  lines.push('');
  lines.push(`Result: **${failed ? 'FAIL' : 'PASS'}**. API \`${baseUrl}\`, binary \`dist/cli.js\` over stdio, client \`@modelcontextprotocol/sdk\`.`);
  lines.push(`Document Request: \`${requestId ?? '—'}\`. Recipient: \`${recipient}\`. Key: \`${apiKey.slice(0, 8)}…\` (revoked at the end of the run).`);
  lines.push('');
  lines.push('| # | Step | Outcome | ms |');
  lines.push('| - | ---- | ------- | -- |');
  steps.forEach((s, i) => lines.push(`| ${i + 1} | \`${s.name}\` | ${s.ok ? 'ok' : `**failed** — ${s.error}`} | ${s.ms} |`));
  lines.push('');
  for (const s of steps) {
    lines.push(`<details><summary><code>${s.name}</code></summary>`);
    lines.push('');
    if (s.args) {
      lines.push('Arguments:');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(s.args, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (s.result) {
      lines.push(`Result${s.result.isError ? ' (isError)' : ''}:`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(s.result.content, null, 2));
      lines.push('```');
      lines.push('');
    }
    lines.push('</details>');
    lines.push('');
  }
  return lines.join('\n');
}
