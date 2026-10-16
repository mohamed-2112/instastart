import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { Repository } from '../src/infrastructure/repository';
import { workspace } from './fixtures';
import type { Run } from '../src/shared/types';
describe('SQLite persistence', () => {
  it('retains workspaces across restarts and rejects stale edits', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'instastart-db-'));
    let repo = new Repository(path.join(dir, 'test.sqlite'));
    try {
      const original = workspace();
      const saved = repo.saveWorkspace(original);
      expect(saved.revision).toBe(1);
      expect(() => repo.saveWorkspace(original)).toThrow('changed');
      expect(repo.getWorkspace(saved.id)?.revision).toBe(1);
      const edited = repo.saveWorkspace({
        ...saved,
        description: 'Saved after a rolled-back edit',
      });
      expect(edited.revision).toBe(2);
      repo.close();
      repo = new Repository(path.join(dir, 'test.sqlite'));
      expect(repo.getWorkspace(saved.id)?.name).toBe(saved.name);
      expect(repo.getWorkspace(saved.id)?.description).toBe(edited.description);
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('marks an unfinished run interrupted instead of replaying it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'instastart-db-'));
    let repo = new Repository(path.join(dir, 'test.sqlite'));
    try {
      const w = repo.saveWorkspace(workspace());
      const run: Run = {
        id: w.id,
        workspaceId: w.id,
        workspaceName: w.name,
        workspaceRevision: w.revision,
        snapshot: w,
        startedAt: w.createdAt,
        status: 'running',
        actions: [
          {
            id: w.actions[0].id,
            type: 'path',
            name: 'Notes',
            status: 'running',
            message: '',
            logs: '',
            steps: [],
          },
        ],
      };
      repo.saveRun(run);
      repo.close();
      repo = new Repository(path.join(dir, 'test.sqlite'));
      expect(repo.getRun(run.id)?.status).toBe('interrupted');
      expect(repo.getRun(run.id)?.actions[0].status).toBe('interrupted');
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
