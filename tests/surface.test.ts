import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connect } from './harness.js';
import { DEFAULT_API_URL, readConfig } from '../src/config.js';

/**
 * What the agent sees, and what it must never see. These tests read the tool
 * list through the MCP client, exactly as Claude Code does on connect.
 */
const EXPECTED_TOOLS = ['get_request'];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

let close: () => Promise<void> = async () => {};
afterEach(() => close());

describe('tool surface', () => {
  it('exposes exactly the tools of this release, and nothing that approves, rejects, bills or manages keys', async () => {
    const t = await connect([]);
    close = t.close;

    const { tools } = await t.client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...EXPECTED_TOOLS].sort());

    for (const tool of tools) {
      expect(tool.name).not.toMatch(/approve|reject|billing|invoice|api[_-]?key|revoke_key/i);
    }
  });

  it('describes every tool in three to four sentences that say when to call it', async () => {
    const t = await connect([]);
    close = t.close;

    const { tools } = await t.client.listTools();
    for (const tool of tools) {
      const count = sentences(tool.description ?? '').length;
      expect(count, `${tool.name}: ${count} sentences`).toBeGreaterThanOrEqual(3);
      expect(count, `${tool.name}: ${count} sentences`).toBeLessThanOrEqual(4);
      expect(tool.description, tool.name).toMatch(/\bCall this when\b/);
    }
  });

  it('tells the agent that approving or rejecting is the Professional’s decision', async () => {
    const t = await connect([]);
    close = t.close;

    const { tools } = await t.client.listTools();
    const getRequest = tools.find((tool) => tool.name === 'get_request');
    expect(getRequest?.description).toMatch(/Approving or rejecting .* decision of the Professional/);
  });
});

describe('configuration', () => {
  const src = sourceFiles(join(process.cwd(), 'src'));

  it('reads the Agent Connection from DOKUTRAK_API_KEY and never from the command line', () => {
    expect(() => readConfig({})).toThrow(/DOKUTRAK_API_KEY/);
    expect(readConfig({ DOKUTRAK_API_KEY: 'dk_live_x' })).toEqual({ apiKey: 'dk_live_x', baseUrl: DEFAULT_API_URL });
    expect(readConfig({ DOKUTRAK_API_KEY: 'dk_live_x', DOKUTRAK_API_URL: 'http://localhost:8080/api/' }).baseUrl).toBe(
      'http://localhost:8080/api'
    );

    for (const file of src) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/process\.argv|parseArgs|commander|yargs/);
    }
  });

  it('defaults to the production API, base URL ending in /api', () => {
    expect(DEFAULT_API_URL).toBe('https://app.dokutrak.com/api');
  });

  it('touches no disk: no fs writes, no cache, no temp files in the server', () => {
    for (const file of src) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/writeFile|createWriteStream|mkdtemp|appendFile|node:fs|from 'fs'/);
    }
  });
});
