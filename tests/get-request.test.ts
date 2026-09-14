import { afterEach, describe, expect, it } from 'vitest';
import detail from './fixtures/request-detail.json';
import documents from './fixtures/request-documents.json';
import list from './fixtures/request-list.json';
import { API_KEY, connect, envelope, jsonOf, problem, textOf } from './harness.js';

const ID = detail.id;
const DETAIL = `/api/v1/requests/${ID}`;
const DOCUMENTS = `/api/v1/requests/${ID}/documents`;
const LIST = '/api/v1/requests';

let close: () => Promise<void> = async () => {};
afterEach(() => close());

describe('get_request', () => {
  it('composes detail and documents into one answer: status, verdicts, reminders, checklist', async () => {
    const t = await connect([
      { method: 'GET', path: DETAIL, reply: envelope(detail) },
      { method: 'GET', path: DOCUMENTS, reply: envelope(documents) },
    ]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBeFalsy();

    const body = jsonOf(result);
    expect(body.request.status).toBe('in_progress');
    expect(body.request.recipient).toEqual({ name: 'Marie Dupont', email: 'marie.dupont@example.com' });
    expect(body.documents.map((d: any) => d.verdict)).toEqual(['approved', 'rejected', 'pending']);
    expect(body.documents[1].rejectionReason).toBe('Only one month; we need the last three.');
    expect(body.reminders).toMatchObject({ sentCount: 2, nextDueAt: '2026-09-16T08:00:00.000Z' });
    expect(body.checklist).toHaveLength(3);
    expect(body.checklist[1]).toMatchObject({ title: 'Relevés bancaires', coverageDays: 90, required: true });

    // The reads the agent surface opens, and nothing else — one round trip per read.
    expect(t.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([`GET ${DETAIL}`, `GET ${DOCUMENTS}`]);
  });

  it('never relays storage locators or the workspace id', async () => {
    const t = await connect([
      { method: 'GET', path: DETAIL, reply: envelope(detail) },
      { method: 'GET', path: DOCUMENTS, reply: envelope(documents) },
    ]);
    close = t.close;

    const text = textOf(await t.call('get_request', { request_id: ID }));
    expect(text).not.toContain('s3://');
    expect(text).not.toContain(detail.organizationId);
  });

  it('presents the Agent Connection as a bearer token and reads /v1 under the base URL', async () => {
    const t = await connect([
      { method: 'GET', path: DETAIL, reply: envelope(detail) },
      { method: 'GET', path: DOCUMENTS, reply: envelope(documents) },
    ]);
    close = t.close;

    await t.call('get_request', { request_id: ID });
    expect(t.calls[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(t.calls[0]?.path.startsWith('/api/v1/')).toBe(true);
  });

  it('resolves a search with a single match to the composed answer', async () => {
    const t = await connect([
      { method: 'GET', path: LIST, reply: envelope([list[0]], { pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } }) },
      { method: 'GET', path: DETAIL, reply: envelope(detail) },
      { method: 'GET', path: DOCUMENTS, reply: envelope(documents) },
    ]);
    close = t.close;

    const result = await t.call('get_request', { search: 'Marie' });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result).request.id).toBe(ID);
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: LIST, query: { search: 'Marie', limit: '10' } });
  });

  it('returns the candidates when a search matches several requests', async () => {
    const t = await connect([
      { method: 'GET', path: LIST, reply: envelope(list, { pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } }) },
    ]);
    close = t.close;

    const result = await t.call('get_request', { search: 'Dupont' });
    expect(result.isError).toBeFalsy();
    const body = jsonOf(result);
    expect(body.matches).toHaveLength(2);
    expect(body.matches.map((m: any) => m.status)).toEqual(['in_progress', 'pending']);
    expect(body.hint).toContain('request_id');
    expect(t.calls).toHaveLength(1);
  });

  it('is an error result when nothing matches, and when neither id nor search is given', async () => {
    const t = await connect([{ method: 'GET', path: LIST, reply: envelope([], { pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }) }]);
    close = t.close;

    const none = await t.call('get_request', { search: 'Nobody' });
    expect(none.isError).toBe(true);
    expect(textOf(none)).toContain('Nobody');

    const empty = await t.call('get_request', {});
    expect(empty.isError).toBe(true);
    expect(textOf(empty)).toContain('request_id');
  });
});

describe('get_request relays the service refusals as error results', () => {
  it('401 — revoked or unknown Agent Connection', async () => {
    const t = await connect([
      { method: 'GET', path: /.*/, reply: problem(401, 'Unauthorized', 'Invalid or expired token') },
    ]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid or expired token');
    expect(textOf(result)).toContain('401');
  });

  it('403 — endpoint out of the agent surface', async () => {
    const t = await connect([
      {
        method: 'GET',
        path: /.*/,
        reply: problem(
          403,
          'Endpoint out of the agent surface',
          `GET ${DETAIL} is not reachable by an agent connection. No agent tool calls it.`
        ),
      },
    ]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not reachable by an agent connection');
  });

  it('402 — plan gate, with its machine-readable code', async () => {
    const t = await connect([
      {
        method: 'GET',
        path: /.*/,
        reply: problem(402, 'Payment Required', 'Active subscription required.', {
          code: 'PAYMENT_REQUIRED',
          upgradeUrl: 'https://app.dokutrak.com/settings/billing',
        }),
      },
    ]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Active subscription required.');
    expect(textOf(result)).toContain('PAYMENT_REQUIRED');
  });

  it('a network failure is an error result, not an exception', async () => {
    const t = await connect([{ method: 'GET', path: /.*/, reply: new Error('ECONNREFUSED') }]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ECONNREFUSED');
  });

  it('a non-JSON error body is relayed as text', async () => {
    const t = await connect([
      { method: 'GET', path: /.*/, reply: { status: 502, body: 'Bad Gateway from the edge', headers: { 'content-type': 'text/plain' } } },
    ]);
    close = t.close;

    const result = await t.call('get_request', { request_id: ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Bad Gateway from the edge');
  });
});
