import { z } from 'zod';
import type { ApiClient } from '../api.js';
import { errorResult, jsonResult, runTool } from '../result.js';
import type {
  CollectedDocument,
  RequestDetail,
  RequestSummary,
  ToolRegistrar,
} from './types.js';

export const GET_REQUEST_DESCRIPTION =
  'Call this when the Professional asks where a Document Request stands: which documents arrived, which were approved or rejected, and when the Client was last chased. ' +
  'Give the request id when you have it, or a search term matching the title, the Client name or the Client email; several matches come back as a short list to choose from. ' +
  'One call returns the status, the checklist, every collected file with its verdict, and the reminder state, so no follow-up read is needed. ' +
  'Approving or rejecting a document is the decision of the Professional, made in the DokuTrak dashboard, and no tool here can take it.';

const CANDIDATES_LIMIT = '10';

export const registerGetRequest: ToolRegistrar = (server, api) => {
  server.registerTool(
    'get_request',
    {
      title: 'Where does a Document Request stand',
      description: GET_REQUEST_DESCRIPTION,
      inputSchema: {
        request_id: z
          .uuid()
          .optional()
          .describe('The id of the Document Request, when known.'),
        search: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Text to match against the request title, the Client name or the Client email, when the id is not known.'
          ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ request_id, search }) =>
      runTool(async () => {
        if (request_id) return jsonResult(await compose(api, request_id));

        if (!search) {
          return errorResult(
            'Give either request_id or search: without one of them there is nothing to look up.'
          );
        }

        const list = await api.get<RequestSummary[]>('/v1/requests', {
          search,
          limit: CANDIDATES_LIMIT,
        });
        const rows = list.data ?? [];

        if (rows.length === 0) {
          return errorResult(`No Document Request matches "${search}".`);
        }
        if (rows.length === 1 && rows[0]) {
          return jsonResult(await compose(api, rows[0].id));
        }
        return jsonResult({
          matches: rows.map(summarize),
          total: list.pagination?.total ?? rows.length,
          hint: 'Several Document Requests match. Call get_request again with the request_id of the right one.',
        });
      })
  );
};

/**
 * The three reads the agent surface already opens, composed into one answer.
 * Detail and documents are independent, so they go out together.
 */
export async function compose(api: ApiClient, requestId: string) {
  const [detail, documents] = await Promise.all([
    api.get<RequestDetail>(`/v1/requests/${requestId}`),
    api.get<CollectedDocument[]>(`/v1/requests/${requestId}/documents`),
  ]);
  const r = detail.data;

  return {
    request: {
      id: r.id,
      title: r.title,
      status: r.status,
      recipient: { name: r.recipientName, email: r.recipientEmail },
      message: r.message,
      deadline: r.deadline,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt ?? null,
      uploadLink: {
        active: r.hasMagicLink ?? false,
        lastOpenedByClientAt: r.linkOpenedAt ?? null,
      },
    },
    checklist: (r.documentRequirements ?? []).map((slot) => ({
      title: slot.title ?? null,
      docType: slot.doc_type ?? null,
      description: slot.description ?? null,
      required: slot.required !== false,
      ...(slot.coverage_days !== undefined && { coverageDays: slot.coverage_days }),
    })),
    documents: (documents.data ?? []).map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      verdict: doc.validationStatus,
      rejectionReason: doc.rejectionReason,
    })),
    reminders: {
      enabled: r.reminderEnabled ?? null,
      sentCount: r.reminderCount ?? 0,
      lastSentAt: r.lastReminderAt ?? null,
      nextDueAt: r.nextReminderAt ?? null,
      pausedUntil: r.reminderPausedUntil ?? null,
      pauseReason: r.reminderPauseReason ?? null,
    },
    ...(r.coverage !== undefined && { coverage: r.coverage }),
  };
}

function summarize(row: RequestSummary) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    recipient: { name: row.recipientName, email: row.recipientEmail },
    deadline: row.deadline,
    createdAt: row.createdAt,
    documentsCollected: row.uploadedDocumentCount ?? null,
  };
}
