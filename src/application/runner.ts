import { randomUUID } from 'node:crypto';
import type { Action, Workspace } from '../shared/schema';
import type { Run, ActionResult, ValidationIssue } from '../shared/types';
import type { RunStore } from '../infrastructure/repository';

export interface ExecutionContext {
  signal: AbortSignal;
  log(text: string): void;
  updateStep(step: ActionResult['steps'][number]): void;
}
export interface Executor {
  validate(workspace: Workspace): Promise<ValidationIssue[]>;
  execute(action: Action, workspace: Workspace, context: ExecutionContext): Promise<string>;
}
const finishedSuccess = (a: ActionResult) => a.status === 'succeeded';
export class LaunchEngine {
  private active = new Map<string, { run: Run; controller: AbortController }>();
  private executing = 0;
  private waiters: { grant: () => void; abort: () => void }[] = [];
  constructor(
    private store: RunStore,
    private executorFactory: () => Executor,
    private publish: (run: Run) => void,
    private concurrency = 3,
  ) {}
  get activeCount(): number {
    return this.active.size;
  }
  getActive(workspaceId: string): Run | undefined {
    return this.active.get(workspaceId)?.run;
  }
  launch(workspace: Workspace, retryRunId?: string): Run {
    const existing = this.active.get(workspace.id);
    if (existing) return structuredClone(existing.run);
    const old = retryRunId ? this.store.getRun(retryRunId) : undefined;
    if (
      retryRunId &&
      (!old || old.workspaceId !== workspace.id || old.workspaceRevision !== workspace.revision)
    )
      throw new Error(
        'Workspace changed or previous run is unavailable. Launch the current workspace instead.',
      );
    if (old && (old.status === 'interrupted' || old.status === 'running'))
      throw new Error(
        'Inspect the interrupted run before launching again. Automatic retry is unavailable.',
      );
    const now = new Date().toISOString();
    const run: Run = {
      id: randomUUID(),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceRevision: workspace.revision,
      snapshot: structuredClone(workspace),
      startedAt: now,
      status: 'running',
      actions: workspace.actions.map((a) => {
        const wasSuccessful = old?.actions.some((r) => r.id === a.id && r.status === 'succeeded');
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          status: !a.enabled ? 'skipped' : wasSuccessful ? 'succeeded' : 'queued',
          message: !a.enabled
            ? 'Disabled'
            : wasSuccessful
              ? 'Completed in the previous run; not repeated.'
              : '',
          logs: '',
          steps: [],
        };
      }),
    };
    const controller = new AbortController();
    this.active.set(workspace.id, { run, controller });
    this.persist(run);
    void this.perform(run, controller, this.executorFactory())
      .catch((error) => {
        run.status = 'failed';
        for (const a of run.actions)
          if (a.status === 'queued' || a.status === 'running') {
            a.status = 'failed';
            a.message = String(error);
          }
      })
      .finally(() => {
        run.finishedAt = new Date().toISOString();
        this.active.delete(workspace.id);
        this.persist(run);
      });
    return structuredClone(run);
  }
  cancel(runId: string): void {
    for (const active of this.active.values())
      if (active.run.id === runId) active.controller.abort();
  }
  cancelAll(): void {
    for (const a of this.active.values()) a.controller.abort();
  }
  private acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Cancelled.'));
        return;
      }
      const release = () => {
        this.executing--;
        this.waiters.shift()?.grant();
      };
      if (this.executing < this.concurrency) {
        this.executing++;
        resolve(release);
        return;
      }
      const entry = {
        grant: () => {
          signal.removeEventListener('abort', entry.abort);
          this.executing++;
          resolve(release);
        },
        abort: () => {
          const index = this.waiters.indexOf(entry);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error('Cancelled.'));
        },
      };
      this.waiters.push(entry);
      signal.addEventListener('abort', entry.abort, { once: true });
    });
  }
  private persist(run: Run): void {
    this.store.saveRun(run);
    this.publish(structuredClone(run));
  }
  private async perform(run: Run, controller: AbortController, executor: Executor): Promise<void> {
    const w = run.snapshot;
    const issues = await executor.validate(w);
    if (!w.actions.some((a) => a.enabled))
      issues.push({ message: 'Add and enable at least one resource.', optional: false });
    if (issues.some((i) => !i.optional)) {
      for (const a of run.actions)
        if (a.status === 'queued') {
          const issue = issues.find((i) => i.actionId === a.id) ?? issues.find((i) => !i.actionId);
          a.status = issue ? 'failed' : 'blocked';
          a.message = issue?.message ?? 'Preflight failed; nothing was launched.';
        }
      run.status = 'failed';
      return;
    }
    for (const issue of issues) {
      const a = run.actions.find((a) => a.id === issue.actionId);
      if (a && a.status === 'queued') {
        a.status = 'skipped';
        a.message = issue.message;
      }
    }
    const running = new Map<string, Promise<void>>();
    while (run.actions.some((a) => a.status === 'queued') || running.size) {
      if (controller.signal.aborted)
        for (const a of run.actions)
          if (a.status === 'queued') {
            a.status = 'cancelled';
            a.message = 'Cancelled before launch.';
          }
      let scheduled = false;
      for (const action of w.actions) {
        const result = run.actions.find((a) => a.id === action.id)!;
        if (result.status !== 'queued') continue;
        const deps = action.dependsOn.map((id) => run.actions.find((a) => a.id === id)!);
        if (
          deps.some(
            (d) =>
              !d || ['failed', 'blocked', 'skipped', 'cancelled', 'interrupted'].includes(d.status),
          )
        ) {
          result.status = 'blocked';
          result.message = 'A prerequisite did not succeed.';
          continue;
        }
        if (running.size < this.concurrency && deps.every(finishedSuccess)) {
          const promise = this.executeOne(
            action,
            w,
            result,
            run,
            controller.signal,
            executor,
          ).finally(() => running.delete(action.id));
          running.set(action.id, promise);
          scheduled = true;
        }
      }
      this.persist(run);
      if (running.size) await Promise.race(running.values());
      else if (!scheduled) {
        for (const a of run.actions)
          if (a.status === 'queued') {
            a.status = 'blocked';
            a.message = 'Dependencies could not be satisfied.';
          }
        break;
      }
    }
    const bad = run.actions.some((a) => ['failed', 'blocked', 'interrupted'].includes(a.status));
    run.status = controller.signal.aborted
      ? 'cancelled'
      : bad
        ? run.actions.some(finishedSuccess)
          ? 'partial'
          : 'failed'
        : 'succeeded';
  }
  private async executeOne(
    action: Action,
    workspace: Workspace,
    result: ActionResult,
    run: Run,
    signal: AbortSignal,
    executor: Executor,
  ): Promise<void> {
    let lastPublish = 0;
    let release: (() => void) | undefined;
    try {
      release = await this.acquire(signal);
      if (signal.aborted) throw new Error('Cancelled.');
      result.status = 'running';
      result.startedAt = new Date().toISOString();
      this.persist(run);
      result.message = await executor.execute(action, workspace, {
        signal,
        log: (text) => {
          result.logs = (result.logs + text).slice(-32000);
          if (Date.now() - lastPublish > 150) {
            lastPublish = Date.now();
            this.persist(run);
          }
        },
        updateStep: (step) => {
          const i = result.steps.findIndex((s) => s.id === step.id);
          if (i < 0) result.steps.push(step);
          else result.steps[i] = step;
          this.persist(run);
        },
      });
      result.status = 'succeeded';
    } catch (error) {
      result.status = signal.aborted ? 'cancelled' : 'failed';
      result.message = error instanceof Error ? error.message : String(error);
    } finally {
      release?.();
    }
    result.finishedAt = new Date().toISOString();
    this.persist(run);
  }
}
