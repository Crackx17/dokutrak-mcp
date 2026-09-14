import { z } from 'zod';
import { jsonResult, runTool } from '../result.js';
import type { RequestDetail, ToolRegistrar } from './types.js';

export const REQUEST_REPLACEMENT_DESCRIPTION =
  'Call this when a Document Request has rejected files and the Professional wants the Client to send them again. ' +
  'It flags every rejected file, moves the request back to awaiting the Client, and returns it to the automatic reminder cadence, which is what reaches the Client. ' +
  'Nothing is emailed by this call itself, and the optional message is kept in the audit trail rather than sent. ' +
  'Do not use it on a request with no rejected file; get_request shows which files were rejected.';

/**
 * The deterministic chase: `POST /v1/requests/:id/request-resubmission`.
 * Not the agent route that drafts a personalised email server-side — that one
 * is a nested agent and sends document-derived text out (ADR-009 amendment
 * of 2026-09-14), and the service keeps it off the agent surface anyway.
 */
export const registerRequestReplacement: ToolRegistrar = (server, api) => {
  server.registerTool(
    'request_replacement',
    {
      title: 'Chase the Client on rejected files',
      description: REQUEST_REPLACEMENT_DESCRIPTION,
      inputSchema: {
        request_id: z.uuid().describe('The Document Request whose rejected files must be sent again.'),
        message: z
          .string()
          .min(1)
          .max(1000)
          .optional()
          .describe('A note from the Professional, recorded in the audit trail of the request. Not sent to the Client.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ request_id, message }) =>
      runTool(async () => {
        await api.post(`/v1/requests/${request_id}/request-resubmission`, {
          ...(message && { message }),
        });

        // Read back rather than assert: the status and the next reminder are
        // the service's to report.
        const after = await api.get<RequestDetail>(`/v1/requests/${request_id}`);
        const r = after.data;
        return jsonResult({
          requestId: r.id,
          status: r.status,
          recipient: { name: r.recipientName, email: r.recipientEmail },
          reminders: {
            enabled: r.reminderEnabled ?? null,
            sentCount: r.reminderCount ?? 0,
            nextDueAt: r.nextReminderAt ?? null,
            pausedUntil: r.reminderPausedUntil ?? null,
          },
          note: 'No email was sent by this call. The Client will be reached by the reminder cadence.',
        });
      })
  );
};
