/**
 * The thin HTTP layer under every tool. It knows three things: where the API
 * is, how to present the Agent Connection, and how the service reports a
 * refusal (RFC 7807, `application/problem+json`). It holds no rule of its own:
 * plan gates, the agent allow-list, roles and rate limits are the service's,
 * and their answers come back here as `ApiError` for the tool to relay.
 */
export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
  userAgent?: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  [extension: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly problem: ProblemDetails | undefined;

  constructor(status: number, title: string, detail: string, problem?: ProblemDetails) {
    super(`${title} (${status}): ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.problem = problem;
  }
}

export interface Envelope<T> {
  success: boolean;
  data: T;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  [extra: string]: unknown;
}

export interface BinaryResponse {
  bytes: Uint8Array;
  contentType: string;
  fileName: string | undefined;
}

export interface ApiClient {
  get<T>(path: string, query?: Record<string, string | undefined>): Promise<Envelope<T>>;
  post<T>(path: string, body?: unknown): Promise<Envelope<T>>;
  getBinary(path: string): Promise<BinaryResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    'User-Agent': options.userAgent ?? 'dokutrak-mcp',
  };

  function url(path: string, query?: Record<string, string | undefined>): string {
    const u = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) u.searchParams.set(key, value);
    }
    return u.toString();
  }

  async function raiseIfNotOk(res: Response): Promise<void> {
    if (res.ok) return;
    const text = await res.text();
    let problem: ProblemDetails | undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') problem = parsed as ProblemDetails;
    } catch {
      // Not JSON: the body is the message.
    }
    const title = problem?.title ?? res.statusText ?? 'Request failed';
    const detail =
      problem?.detail ?? (text.trim() || `The API answered ${res.status} with no detail.`);
    throw new ApiError(res.status, title, detail, problem);
  }

  async function json<T>(path: string, init: RequestInit, query?: Record<string, string | undefined>) {
    const res = await fetchImpl(url(path, query), {
      ...init,
      headers: { ...headers, Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
    });
    await raiseIfNotOk(res);
    return (await res.json()) as Envelope<T>;
  }

  return {
    get: (path, query) => json(path, { method: 'GET' }, query),
    post: (path, body) =>
      json(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    async getBinary(path) {
      const res = await fetchImpl(url(path), { method: 'GET', headers });
      await raiseIfNotOk(res);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        bytes,
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        fileName: fileNameFromDisposition(res.headers.get('content-disposition')),
      };
    },
  };
}

function fileNameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1];
}
