import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api.js';

export type ToolRegistrar = (server: McpServer, api: ApiClient) => void;

/** `GET /v1/requests/:id`, the fields the Connector relays. */
export interface RequestDetail {
  id: string;
  title: string | null;
  status: string;
  recipientEmail: string | null;
  recipientName: string | null;
  message: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  linkOpenedAt?: string | null;
  hasMagicLink?: boolean;
  reminderEnabled?: boolean | null;
  reminderCount?: number | null;
  lastReminderAt?: string | null;
  nextReminderAt?: string | null;
  reminderPausedUntil?: string | null;
  reminderPauseReason?: string | null;
  documentRequirements?: RequirementSlot[];
  coverage?: unknown;
}

export interface RequirementSlot {
  title?: string;
  doc_type?: string;
  description?: string;
  required?: boolean;
  coverage_days?: number;
}

/** `GET /v1/requests/:id/documents`. `url` is a storage locator, dropped on purpose. */
export interface CollectedDocument {
  id: string;
  name: string;
  size: number | null;
  type: string | null;
  validationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  url?: string;
}

/** A row of `GET /v1/requests`. */
export interface RequestSummary {
  id: string;
  title: string | null;
  status: string;
  recipientEmail: string | null;
  recipientName: string | null;
  deadline: string | null;
  createdAt: string;
  uploadedDocumentCount?: number;
  documentCount?: number;
}
