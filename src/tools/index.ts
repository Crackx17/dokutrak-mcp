import type { ToolRegistrar } from './types.js';
import { registerGetRequest } from './get-request.js';

/**
 * The tools of this release, in the order the agent sees them. Every entry
 * maps onto endpoints the service opens to Agent Connections; nothing here
 * approves, rejects, bills or manages keys, and nothing ever will without a
 * decision recorded in the product repo (ADR-009, ADR-014).
 */
export const TOOL_REGISTRARS: readonly ToolRegistrar[] = [registerGetRequest];
