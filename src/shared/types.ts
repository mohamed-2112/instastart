import type { Settings, Workspace } from './schema';
export type Status =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'cancelled'
  | 'interrupted';
export interface StepResult {
  id: string;
  name: string;
  status: Status;
  exitCode?: number | null;
  message?: string;
}
export interface ActionResult {
  id: string;
  name: string;
  type: string;
  status: Status;
  message: string;
  startedAt?: string;
  finishedAt?: string;
  logs: string;
  steps: StepResult[];
}
export interface Run {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceRevision: number;
  snapshot: Workspace;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
  actions: ActionResult[];
}
export type RunSummary = Omit<Run, 'snapshot' | 'actions'>;
export interface ValidationIssue {
  actionId?: string;
  message: string;
  optional: boolean;
}
export interface Bootstrap {
  workspaces: Workspace[];
  settings: Settings;
  runs: RunSummary[];
  platform: string;
  version: string;
  packaged: boolean;
  dataPath: string;
  launchRunId?: string;
}
export type PickKind = 'folder' | 'file' | 'executable' | 'script';
export interface DesktopApi {
  bootstrap(): Promise<Bootstrap>;
  saveWorkspace(workspace: Workspace): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  validateWorkspace(id: string): Promise<ValidationIssue[]>;
  launchWorkspace(id: string, retryRunId?: string): Promise<Run>;
  getRun(id: string): Promise<Run>;
  cancelRun(id: string): Promise<void>;
  createShortcut(id: string): Promise<string>;
  saveSettings(settings: Settings): Promise<Settings>;
  detectApps(): Promise<Settings>;
  pickPath(kind: PickKind): Promise<string | null>;
  readScript(): Promise<string | null>;
  onRun(listener: (run: Run) => void): () => void;
}
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };
