import { z } from 'zod';
import { runTool } from '../result.js';
import type { ToolRegistrar } from './types.js';

export const DOWNLOAD_DOCUMENTS_DESCRIPTION =
  'Call this when the Professional wants the files a Client has uploaded on a Document Request, for example to file them or read them locally. ' +
  'It returns every collected document as one zip archive, embedded in the result as binary content. ' +
  'The archive is the same download the dashboard offers and comes back only to the agent of the Professional, never to a third party. ' +
  'Use get_request first to check that documents have actually arrived.';

/**
 * `GET /v1/requests/:id/download-zip`, relayed as an embedded resource with a
 * base64 blob. Binary content rather than a link: the service has no
 * short-link endpoint for a zip, and the Connector writes nothing to disk
 * (ADR-014 §2). The client decides what to do with the bytes.
 */
export const registerDownloadDocuments: ToolRegistrar = (server, api) => {
  server.registerTool(
    'download_documents',
    {
      title: 'Collect the documents of a Document Request',
      description: DOWNLOAD_DOCUMENTS_DESCRIPTION,
      inputSchema: {
        request_id: z.uuid().describe('The Document Request whose collected files are wanted.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ request_id }) =>
      runTool(async () => {
        const zip = await api.getBinary(`/v1/requests/${request_id}/download-zip`);
        const fileName = zip.fileName ?? `request-${request_id}.zip`;
        return {
          content: [
            {
              type: 'text',
              text: `${fileName} — ${zip.bytes.byteLength} bytes, ${zip.contentType}. The archive follows as an embedded resource.`,
            },
            {
              type: 'resource',
              resource: {
                uri: `dokutrak://requests/${request_id}/${encodeURIComponent(fileName)}`,
                mimeType: zip.contentType,
                blob: Buffer.from(zip.bytes).toString('base64'),
              },
            },
          ],
        };
      })
  );
};
