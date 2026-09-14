import type { ToolRegistrar } from './types.js';
import { registerCreateRequest } from './create-request.js';
import { registerRequestReplacement } from './request-replacement.js';
import { registerGetRequest } from './get-request.js';
import { registerDownloadDocuments } from './download-documents.js';

/**
 * The four tools of the first release (ADR-014 §4), in the order of the
 * round trip: ask, chase, know, collect. Every entry maps onto endpoints the
 * service opens to Agent Connections; nothing here approves, rejects, bills
 * or manages keys, and nothing ever will without a decision recorded in the
 * product repo (ADR-009, ADR-014).
 */
export const TOOL_REGISTRARS: readonly ToolRegistrar[] = [
  registerCreateRequest,
  registerRequestReplacement,
  registerGetRequest,
  registerDownloadDocuments,
];
