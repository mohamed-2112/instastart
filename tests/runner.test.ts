import { describe, expect, it } from 'vitest';
import { LaunchEngine, type Executor } from '../src/application/runner';
import type { Run } from '../src/shared/types';
import { action, workspace } from './fixtures';

function harness(executor: Executor, concurrency = 3) {
  const runs = new Map<string, Run>();
  const engine = new LaunchEngine(
    {
      saveRun: (r) => {
        runs.set(r.id, structuredClone(r));
      },
      getRun: (id) => runs.get(id),
    },
    () => executor,
    () => undefined,
    concurrency,
  );
  const finish = async (id: string) => {
    const deadline = Date.now() + 3000;
    while (runs.get(id)?.status === 'running') {
      if (Date.now() > deadline) throw new Error('Run did not finish');
      await new Promise((r) => setTimeout(r, 5));
    }
    return runs.get(id)!;
  };
  return { engine, runs, finish };
}
describe('launch orchestration', () => {
  it('blocks dependents after failure while completing independent work', async () => {
    const a = action('Build'),
      b = action('Browser', [a.id]),
      c = action('Notes');
    const executed: string[] = [];
    const h = harness({
      validate: async () => [],
      execute: async (a) => {
        executed.push(a.name);
        if (a.name === 'Build') throw new Error('Build failed');
        return 'Opened';
      },
    });
    const run = await h.finish(h.engine.launch(workspace([a, b, c])).id);
    expect(executed.sort()).toEqual(['Build', 'Notes']);
    expect(run.status).toBe('partial');
    expect(run.actions[1].status).toBe('blocked');
  });
  it('does not dispatch anything when a required preflight check fails', async () => {
    let calls = 0;
    const h = harness({
      validate: async () => [{ message: 'Project moved', optional: false }],
      execute: async () => {
        calls++;
        return 'Opened';
      },
    });
    const run = await h.finish(h.engine.launch(workspace()).id);
    expect(run.status).toBe('failed');
    expect(calls).toBe(0);
  });
  it('coalesces concurrent launches of one workspace', async () => {
    const h = harness({
      validate: async () => [],
      execute: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return 'Done';
      },
    });
    const w = workspace();
    const first = h.engine.launch(w),
      second = h.engine.launch(w);
    expect(first.id).toBe(second.id);
    await h.finish(first.id);
  });
  it('waits for dependencies and respects the concurrency bound', async () => {
    const a = action('First'),
      b = action('Second', [a.id]),
      c = action('Third');
    const done = new Set<string>();
    let concurrent = 0,
      max = 0;
    const h = harness(
      {
        validate: async () => [],
        execute: async (a) => {
          if (a.name === 'Second') expect(done.has('First')).toBe(true);
          concurrent++;
          max = Math.max(max, concurrent);
          await new Promise((r) => setTimeout(r, 15));
          done.add(a.name);
          concurrent--;
          return 'Done';
        },
      },
      2,
    );
    expect((await h.finish(h.engine.launch(workspace([a, b, c])).id)).status).toBe('succeeded');
    expect(max).toBe(2);
  });
  it('cancels running work and never starts a dependent action', async () => {
    const a = action('First'),
      b = action('Second', [a.id]);
    let calls = 0;
    const h = harness({
      validate: async () => [],
      execute: async (_a, _w, ctx) => {
        calls++;
        await new Promise<void>((_resolve, reject) => {
          if (ctx.signal.aborted) reject(new Error('Cancelled'));
          else
            ctx.signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
              once: true,
            });
        });
        return '';
      },
    });
    const r = h.engine.launch(workspace([a, b]));
    await new Promise((r) => setTimeout(r, 10));
    h.engine.cancel(r.id);
    const end = await h.finish(r.id);
    expect(end.status).toBe('cancelled');
    expect(calls).toBe(1);
    expect(end.actions[1].status).toBe('cancelled');
  });
  it('retries failed actions without repeating previously successful resources', async () => {
    const first = action('IDE'),
      second = action('Build');
    let fail = true;
    const calls: string[] = [];
    const h = harness({
      validate: async () => [],
      execute: async (a) => {
        calls.push(a.name);
        if (a.name === 'Build' && fail) throw new Error('Failed');
        return 'Done';
      },
    });
    const w = workspace([first, second]);
    const old = await h.finish(h.engine.launch(w).id);
    fail = false;
    const retried = await h.finish(h.engine.launch(w, old.id).id);
    expect(calls).toEqual(['IDE', 'Build', 'Build']);
    expect(retried.status).toBe('succeeded');
  });
  it('rejects a retry after the saved workspace revision changes', async () => {
    const h = harness({
      validate: async () => [],
      execute: async () => {
        throw new Error('fail');
      },
    });
    const w = workspace();
    const run = await h.finish(h.engine.launch(w).id);
    expect(() => h.engine.launch({ ...w, revision: 1 }, run.id)).toThrow('Workspace changed');
  });
  it('shares its concurrency bound across different workspaces', async () => {
    let current = 0,
      peak = 0;
    const h = harness(
      {
        validate: async () => [],
        execute: async () => {
          current++;
          peak = Math.max(current, peak);
          await new Promise((r) => setTimeout(r, 15));
          current--;
          return 'Done';
        },
      },
      2,
    );
    const first = h.engine.launch(workspace([action(), action()]));
    const second = h.engine.launch(workspace([action(), action()]));
    await Promise.all([h.finish(first.id), h.finish(second.id)]);
    expect(peak).toBe(2);
  });
});
