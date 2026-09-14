import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import detail from './fixtures/request-detail.json' with { type: 'json' };
import { connect, envelope, jsonOf, problem, textOf, type Route } from './harness.js';

const ID = detail.id;
const CREATE = '/api/v1/requests';
const SEND = `/api/v1/requests/${ID}/send`;
const RESUBMIT = `/api/v1/requests/${ID}/request-resubmission`;
const DETAIL = `/api/v1/requests/${ID}`;
const ZIP = `/api/v1/requests/${ID}/download-zip`;

const created = { ...detail, status: 'pending', magicLinkToken: 'tok_secret', magicLinkUrl: 'https://app.dokutrak.com/upload/tok_secret' };
const sentLink = { id: 'ml1', requestId: ID, token: 'tok_secret_2', url: 'https://app.dokutrak.com/upload/tok_secret_2', expiresAt: '2026-10-07T12:00:00.000Z' };

const INPUT = {
  recipient_email: 'marie.dupont@example.com',
  recipient_name: 'Marie Dupont',
  title: 'Dossier Dupont — prêt immobilier',
  message: 'Merci de nous transmettre les pièces ci-dessous.',
  deadline: '2026-09-30',
  documents: [
    { title: "Pièce d'identité" },
    { title: 'Relevés bancaires', description: '3 derniers mois', coverage_days: 90 },
    { title: "Avis d'imposition", required: false },
  ],
};

let close: () => Promise<void> = async () => {};
afterEach(() => close());

describe('create_request', () => {
  it('creates then sends, in that order, and the recipient enters once', async () => {
    const t = await connect([
      { method: 'POST', path: CREATE, reply: { status: 201, json: { success: true, data: created } } },
      { method: 'POST', path: SEND, reply: envelope(sentLink) },
    ]);
    close = t.close;

    const result = await t.call('create_request', INPUT);
    expect(result.isError).toBeFalsy();

    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${CREATE}`, `POST ${SEND}`]);
    expect(t.calls[0]?.body).toMatchObject({
      recipientEmail: 'marie.dupont@example.com',
      recipientName: 'Marie Dupont',
      deadline: '2026-09-30T12:00:00.000Z',
      sendEmail: false,
    });
    expect((t.calls[0]?.body as any).documents).toEqual([
      { title: "Pièce d'identité" },
      { title: 'Relevés bancaires', description: '3 derniers mois', coverage_days: 90 },
      { title: "Avis d'imposition", required: false },
    ]);
    // Lock 2: the send takes no address of its own.
    expect(Object.keys((t.calls[1]?.body as object) ?? {})).toEqual([]);

    const body = jsonOf(result);
    expect(body).toMatchObject({ requestId: ID, sent: true, uploadLinkExpiresAt: '2026-10-07T12:00:00.000Z' });
  });

  it('passes an ISO datetime deadline through untouched', async () => {
    const t = await connect([
      { method: 'POST', path: CREATE, reply: { status: 201, json: { success: true, data: created } } },
      { method: 'POST', path: SEND, reply: envelope(sentLink) },
    ]);
    close = t.close;

    await t.call('create_request', { ...INPUT, deadline: '2026-09-30T17:00:00+02:00' });
    expect((t.calls[0]?.body as any).deadline).toBe('2026-09-30T17:00:00+02:00');
  });

  it('never relays the secure upload link or its token', async () => {
    const t = await connect([
      { method: 'POST', path: CREATE, reply: { status: 201, json: { success: true, data: created } } },
      { method: 'POST', path: SEND, reply: envelope(sentLink) },
    ]);
    close = t.close;

    const text = textOf(await t.call('create_request', INPUT));
    expect(text).not.toContain('tok_secret');
    expect(text).not.toContain('/upload/');
  });

  it('a send failure is an error result that names the created request', async () => {
    const t = await connect([
      { method: 'POST', path: CREATE, reply: { status: 201, json: { success: true, data: created } } },
      { method: 'POST', path: SEND, reply: problem(409, 'Conflict', 'Cannot send a link for a closed request') },
    ]);
    close = t.close;

    const result = await t.call('create_request', INPUT);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(ID);
    expect(textOf(result)).toContain('Cannot send a link for a closed request');
    expect(t.calls).toHaveLength(2);
  });

  it('a creation refusal stops before any send', async () => {
    const t = await connect([
      { method: 'POST', path: CREATE, reply: problem(400, 'Bad Request', 'Deadline must be between today and 90 days from now') },
    ]);
    close = t.close;

    const result = await t.call('create_request', INPUT);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Deadline must be between today and 90 days from now');
    expect(t.calls).toHaveLength(1);
  });
});

describe('request_replacement', () => {
  it('calls the deterministic resubmission and reads the request back', async () => {
    const t = await connect([
      { method: 'POST', path: RESUBMIT, reply: envelope(undefined) },
      { method: 'GET', path: DETAIL, reply: envelope({ ...detail, status: 'pending_resubmission' }) },
    ]);
    close = t.close;

    const result = await t.call('request_replacement', { request_id: ID, message: 'Please send the three months.' });
    expect(result.isError).toBeFalsy();
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${RESUBMIT}`, `GET ${DETAIL}`]);
    expect(t.calls[0]?.body).toEqual({ message: 'Please send the three months.' });

    const body = jsonOf(result);
    expect(body.status).toBe('pending_resubmission');
    expect(body.reminders.nextDueAt).toBe('2026-09-16T08:00:00.000Z');
    expect(body.note).toMatch(/No email was sent/);
  });

  it('sends an empty body when there is no message (the schema is strict)', async () => {
    const t = await connect([
      { method: 'POST', path: RESUBMIT, reply: envelope(undefined) },
      { method: 'GET', path: DETAIL, reply: envelope(detail) },
    ]);
    close = t.close;

    await t.call('request_replacement', { request_id: ID });
    expect(t.calls[0]?.body).toEqual({});
  });

  it('relays the refusal when nothing is rejected', async () => {
    const t = await connect([
      { method: 'POST', path: RESUBMIT, reply: problem(400, 'Bad Request', 'No rejected documents to request resubmission for') },
    ]);
    close = t.close;

    const result = await t.call('request_replacement', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No rejected documents');
    expect(t.calls).toHaveLength(1);
  });

  it('never references the server-side agent replacement route', () => {
    const files = readdirSync(join(process.cwd(), 'src'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/agent\/replace-document|replace_document|replaceDocument/);
    }
  });

  it('does not promise the Client reads the message', async () => {
    const t = await connect([]);
    close = t.close;
    const { tools } = await t.client.listTools();
    const tool = tools.find((x) => x.name === 'request_replacement');
    expect(tool?.description).toMatch(/Nothing is emailed by this call/);
    expect(JSON.stringify(tool?.inputSchema)).toMatch(/Not sent to the Client/);
  });
});

describe('download_documents', () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);

  it('returns the zip as an embedded binary resource, with its file name', async () => {
    const t = await connect([
      {
        method: 'GET',
        path: ZIP,
        reply: {
          status: 200,
          body: bytes,
          headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="Dossier-Dupont.zip"' },
        },
      },
    ]);
    close = t.close;

    const result = await t.call('download_documents', { request_id: ID });
    expect(result.isError).toBeFalsy();

    const resource = result.content.find((c) => c.type === 'resource') as any;
    expect(resource.resource.mimeType).toBe('application/zip');
    expect(resource.resource.uri).toBe(`dokutrak://requests/${ID}/Dossier-Dupont.zip`);
    expect(Buffer.from(resource.resource.blob, 'base64')).toEqual(Buffer.from(bytes));
    expect(textOf(result)).toContain('Dossier-Dupont.zip');
    expect(textOf(result)).toContain('8 bytes');
    expect(t.calls[0]?.headers.accept).toBeUndefined();
  });

  it('falls back to a name from the request id when the service gives none', async () => {
    const t = await connect([{ method: 'GET', path: ZIP, reply: { status: 200, body: bytes, headers: { 'content-type': 'application/zip' } } }]);
    close = t.close;

    const result = await t.call('download_documents', { request_id: ID });
    expect(textOf(result)).toContain(`request-${ID}.zip`);
  });
});

describe('every tool relays 401 / 403 / 402 as an error result', () => {
  const calls: Array<[string, Record<string, unknown>]> = [
    ['create_request', INPUT],
    ['request_replacement', { request_id: ID }],
    ['get_request', { request_id: ID }],
    ['download_documents', { request_id: ID }],
  ];
  const refusals: Array<[string, Route['reply'], string]> = [
    ['401 revoked', problem(401, 'Unauthorized', 'Invalid or expired token'), 'Invalid or expired token'],
    ['403 out of surface', problem(403, 'Endpoint out of the agent surface', 'POST /api/v1/x is not reachable by an agent connection. No agent tool calls it.'), 'not reachable by an agent connection'],
    ['402 plan gate', problem(402, 'Payment Required', 'Active subscription required.', { code: 'PAYMENT_REQUIRED' }), 'PAYMENT_REQUIRED'],
  ];

  for (const [tool, args] of calls) {
    for (const [label, reply, expected] of refusals) {
      it(`${tool} — ${label}`, async () => {
        const t = await connect([
          { method: 'GET', path: /.*/, reply },
          { method: 'POST', path: /.*/, reply },
        ]);
        close = t.close;

        const result = await t.call(tool, args);
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain(expected);
      });
    }
  }
});
