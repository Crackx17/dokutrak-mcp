import { z } from 'zod';
import { ApiError } from '../api.js';
import { describe, errorResult, jsonResult, runTool } from '../result.js';
import type { RequestDetail, ToolRegistrar } from './types.js';

export const CREATE_REQUEST_DESCRIPTION =
  'Call this when the Professional wants to ask a Client for documents: it creates the Document Request and sends the email in one step, so nothing is left created but unsent. ' +
  'Provide the Client email, a deadline, and the list of documents wanted, plus an optional title and a message written by the Professional. ' +
  'The email goes to the recipient given here and to nobody else, and the Client uploads through the secure link it contains. ' +
  'If the email fails after creation, the error names the created request so it can be sent from the dashboard.';

/**
 * Two calls, as the DokuTrak app itself does it: `POST /v1/requests` with
 * `sendEmail: false`, then `POST /v1/requests/:id/send`. Creation with the
 * default `sendEmail` would email inline and swallow the failure; the send
 * route reports it, and the request exists to be re-sent from the dashboard.
 */
export const registerCreateRequest: ToolRegistrar = (server, api) => {
  server.registerTool(
    'create_request',
    {
      title: 'Create and send a Document Request',
      description: CREATE_REQUEST_DESCRIPTION,
      inputSchema: {
        recipient_email: z.email().describe('The Client who must upload the documents. The only address the email will go to.'),
        recipient_name: z.string().min(1).max(255).optional().describe('How the Client is addressed in the email.'),
        title: z.string().min(1).max(500).optional().describe('Title of the request, as the Professional names the file.'),
        message: z.string().min(1).max(1000).optional().describe('A message from the Professional to the Client, included in the email.'),
        deadline: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/, 'A date (YYYY-MM-DD) or an ISO 8601 datetime.')
          .describe('When the documents are due. A date (YYYY-MM-DD) or an ISO 8601 datetime.'),
        documents: z
          .array(
            z.object({
              title: z.string().min(1).max(500).describe('What is asked for, as the Client will read it.'),
              description: z.string().min(1).max(1000).optional().describe('Precision for the Client, for example which period.'),
              required: z.boolean().optional().describe('Defaults to true.'),
              coverage_days: z.number().int().positive().optional().describe('For a span rather than a file: how many days the documents must cover.'),
            })
          )
          .min(1)
          .describe('The checklist the Client must fill.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      runTool(async () => {
        const created = await api.post<RequestDetail>('/v1/requests', {
          recipientEmail: input.recipient_email,
          ...(input.recipient_name && { recipientName: input.recipient_name }),
          ...(input.title && { title: input.title }),
          ...(input.message && { message: input.message }),
          deadline: toDeadlineIso(input.deadline),
          sendEmail: false,
          documents: input.documents.map((doc) => ({
            title: doc.title,
            ...(doc.description && { description: doc.description }),
            ...(doc.required !== undefined && { required: doc.required }),
            ...(doc.coverage_days !== undefined && { coverage_days: doc.coverage_days }),
          })),
        });
        const id = created.data.id;

        try {
          const sent = await api.post<{ expiresAt?: string }>(`/v1/requests/${id}/send`, {});
          return jsonResult({
            requestId: id,
            title: created.data.title,
            status: created.data.status,
            recipient: { name: created.data.recipientName, email: created.data.recipientEmail },
            deadline: created.data.deadline,
            sent: true,
            uploadLinkExpiresAt: sent.data?.expiresAt ?? null,
          });
        } catch (error) {
          const reason = error instanceof ApiError ? `${error.title} (${error.status}): ${error.detail}` : describe(error);
          return errorResult(
            `Document Request ${id} was created but the email did not go out — ${reason}. ` +
              'It is visible in the DokuTrak dashboard, where it can be sent.'
          );
        }
      })
  );
};

/** The API wants a datetime; a bare date becomes noon UTC so the stored day is the day given. */
export function toDeadlineIso(deadline: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? `${deadline}T12:00:00.000Z` : deadline;
}
