export const WORKFLOW_STUDIO_TELEMETRY_EVENT = 'ctbms:workflow-studio-telemetry';

export type WorkflowStudioTelemetryEventName =
  | 'node_preview_triggered'
  | 'node_preview_completed'
  | 'node_preview_failed'
  | 'node_preview_locate_clicked'
  | 'node_preview_auto_toggle'
  | 'node_preview_summary_exported'
  | 'node_preview_summary_cleared';

export interface WorkflowStudioTelemetryEventDetail {
  event: WorkflowStudioTelemetryEventName;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface WorkflowPreviewTelemetrySnapshot {
  triggered: number;
  completed: number;
  failed: number;
  locateClicked: number;
  autoToggle: number;
  jsonParseError: number;
  requestError: number;
  lastFailureReason: string;
  updatedAt: string;
}

export interface WorkflowPreviewTelemetrySnapshotRow {
  nodeId: string;
  snapshot: WorkflowPreviewTelemetrySnapshot;
}

export interface WorkflowPreviewTelemetryTotals {
  triggered: number;
  completed: number;
  failed: number;
  locateClicked: number;
  autoToggle: number;
  jsonParseError: number;
  requestError: number;
}

const PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX = 'ctbms:workflow-preview-telemetry:';

const DEFAULT_PREVIEW_SNAPSHOT: WorkflowPreviewTelemetrySnapshot = {
  triggered: 0,
  completed: 0,
  failed: 0,
  locateClicked: 0,
  autoToggle: 0,
  jsonParseError: 0,
  requestError: 0,
  lastFailureReason: '',
  updatedAt: '',
};

const parsePreviewTelemetrySnapshot = (raw: string): WorkflowPreviewTelemetrySnapshot | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowPreviewTelemetrySnapshot>;
    return {
      ...DEFAULT_PREVIEW_SNAPSHOT,
      ...parsed,
    };
  } catch {
    return null;
  }
};

export const trackWorkflowStudioEvent = (
  event: WorkflowStudioTelemetryEventName,
  payload: Record<string, unknown> = {},
) => {
  if (typeof window === 'undefined') {
    return;
  }
  const detail: WorkflowStudioTelemetryEventDetail = {
    event,
    timestamp: new Date().toISOString(),
    payload,
  };
  window.dispatchEvent(
    new CustomEvent<WorkflowStudioTelemetryEventDetail>(WORKFLOW_STUDIO_TELEMETRY_EVENT, {
      detail,
    }),
  );
};

export const readWorkflowPreviewTelemetrySnapshot = (
  nodeId: string,
): WorkflowPreviewTelemetrySnapshot => {
  if (typeof window === 'undefined' || !nodeId.trim()) {
    return DEFAULT_PREVIEW_SNAPSHOT;
  }

  const raw = window.localStorage.getItem(`${PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX}${nodeId}`);
  if (!raw) {
    return DEFAULT_PREVIEW_SNAPSHOT;
  }
  const parsed = parsePreviewTelemetrySnapshot(raw);
  if (!parsed) {
    return DEFAULT_PREVIEW_SNAPSHOT;
  }
  return parsed;
};

export const writeWorkflowPreviewTelemetrySnapshot = (
  nodeId: string,
  snapshot: WorkflowPreviewTelemetrySnapshot,
) => {
  if (typeof window === 'undefined' || !nodeId.trim()) {
    return;
  }
  window.localStorage.setItem(
    `${PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX}${nodeId}`,
    JSON.stringify(snapshot),
  );
};

export const clearWorkflowPreviewTelemetrySnapshot = (nodeId: string) => {
  if (typeof window === 'undefined' || !nodeId.trim()) {
    return;
  }
  window.localStorage.removeItem(`${PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX}${nodeId}`);
};

export const clearAllWorkflowPreviewTelemetrySnapshots = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const keysToDelete: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX)) {
      continue;
    }
    keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => {
    window.localStorage.removeItem(key);
  });
};

export const listWorkflowPreviewTelemetrySnapshots = (): WorkflowPreviewTelemetrySnapshotRow[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const rows: WorkflowPreviewTelemetrySnapshotRow[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX)) {
      continue;
    }
    const nodeId = key.slice(PREVIEW_TELEMETRY_STORAGE_KEY_PREFIX.length);
    if (!nodeId) {
      continue;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    const snapshot = parsePreviewTelemetrySnapshot(raw);
    if (!snapshot) {
      continue;
    }
    rows.push({
      nodeId,
      snapshot,
    });
  }

  rows.sort((a, b) => {
    const aTime = a.snapshot.updatedAt ? new Date(a.snapshot.updatedAt).getTime() : 0;
    const bTime = b.snapshot.updatedAt ? new Date(b.snapshot.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  return rows;
};

export const buildWorkflowPreviewTelemetryTotals = (
  rows: WorkflowPreviewTelemetrySnapshotRow[],
): WorkflowPreviewTelemetryTotals => {
  return rows.reduce<WorkflowPreviewTelemetryTotals>(
    (acc, row) => ({
      triggered: acc.triggered + row.snapshot.triggered,
      completed: acc.completed + row.snapshot.completed,
      failed: acc.failed + row.snapshot.failed,
      locateClicked: acc.locateClicked + row.snapshot.locateClicked,
      autoToggle: acc.autoToggle + row.snapshot.autoToggle,
      jsonParseError: acc.jsonParseError + row.snapshot.jsonParseError,
      requestError: acc.requestError + row.snapshot.requestError,
    }),
    {
      triggered: 0,
      completed: 0,
      failed: 0,
      locateClicked: 0,
      autoToggle: 0,
      jsonParseError: 0,
      requestError: 0,
    },
  );
};
