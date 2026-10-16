import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import {
  defaultSettings,
  settingsSchema,
  workspaceSchema,
  type Settings,
  type Workspace,
} from '../shared/schema';
import type { Run, RunSummary } from '../shared/types';

export interface RunStore {
  saveRun(run: Run): void;
  getRun(id: string): Run | undefined;
}
export class Repository implements RunStore {
  private db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file)) copyFileSync(file, `${file}.startup-backup`);
    this.db = new DatabaseSync(file);
    this.db.exec(
      'PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 1)
      throw new Error('This database was created by a newer InstaStart. Install that version.');
    if (version === 0)
      this.transaction(() => {
        this.db
          .exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL);
        CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
        CREATE TABLE runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, started_at TEXT NOT NULL, document TEXT NOT NULL);
        CREATE INDEX runs_by_time ON runs(started_at DESC); PRAGMA user_version=1;`);
      });
    for (const row of this.db.prepare('SELECT document FROM runs').all() as {
      document: string;
    }[]) {
      const run = JSON.parse(row.document) as Run;
      if (run.status === 'running') {
        run.status = 'interrupted';
        run.finishedAt = new Date().toISOString();
        for (const a of run.actions)
          if (a.status === 'running' || a.status === 'queued') {
            a.status = 'interrupted';
            a.message = 'The launcher stopped. Outcome unknown; inspect before launching again.';
          }
        this.saveRun(run);
      }
    }
  }
  // Keep transaction ownership in the repository so changing the SQLite driver
  // does not affect workspace edits or expose database details to the UI.
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }
  listWorkspaces(): Workspace[] {
    return (
      this.db.prepare('SELECT document FROM workspaces ORDER BY name COLLATE NOCASE').all() as {
        document: string;
      }[]
    ).map((r) => workspaceSchema.parse(JSON.parse(r.document)));
  }
  getWorkspace(id: string): Workspace | undefined {
    const row = this.db.prepare('SELECT document FROM workspaces WHERE id=?').get(id) as
      { document: string } | undefined;
    return row ? workspaceSchema.parse(JSON.parse(row.document)) : undefined;
  }
  saveWorkspace(input: Workspace): Workspace {
    const w = workspaceSchema.parse(input);
    return this.transaction(() => {
      const existing = this.getWorkspace(w.id);
      if (existing && existing.revision !== w.revision)
        throw new Error('This workspace changed. Close the editor and reopen it.');
      if (!existing && w.revision !== 0) throw new Error('This workspace no longer exists.');
      const now = new Date().toISOString();
      const saved = {
        ...w,
        revision: w.revision + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.db
        .prepare(
          'INSERT INTO workspaces VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,document=excluded.document',
        )
        .run(saved.id, saved.name, saved.revision, JSON.stringify(saved));
      return saved;
    });
  }
  deleteWorkspace(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id=?').run(id);
  }
  getSettings(): Settings {
    const r = this.db.prepare('SELECT document FROM settings WHERE id=1').get() as
      { document: string } | undefined;
    return r ? settingsSchema.parse(JSON.parse(r.document)) : structuredClone(defaultSettings);
  }
  saveSettings(settings: Settings): Settings {
    const s = settingsSchema.parse(settings);
    this.db
      .prepare(
        'INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',
      )
      .run(JSON.stringify(s));
    return s;
  }
  saveRun(run: Run): void {
    this.db
      .prepare(
        'INSERT INTO runs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',
      )
      .run(run.id, run.workspaceId, run.startedAt, JSON.stringify(run));
    this.db
      .prepare(
        "DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY started_at DESC LIMIT 100) AND json_extract(document,'$.status') != 'running'",
      )
      .run();
  }
  getRun(id: string): Run | undefined {
    const r = this.db.prepare('SELECT document FROM runs WHERE id=?').get(id) as
      { document: string } | undefined;
    return r ? (JSON.parse(r.document) as Run) : undefined;
  }
  listRuns(): RunSummary[] {
    return (
      this.db.prepare('SELECT document FROM runs ORDER BY started_at DESC LIMIT 40').all() as {
        document: string;
      }[]
    ).map((r) => {
      const { actions: _a, snapshot: _s, ...summary } = JSON.parse(r.document) as Run;
      return summary;
    });
  }
  close(): void {
    this.db.close();
  }
}
