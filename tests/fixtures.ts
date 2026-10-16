import { randomUUID } from 'node:crypto';
import type { Action, Workspace } from '../src/shared/schema';
export function action(name = 'Resource', deps: string[] = []): Action {
  return {
    id: randomUUID(),
    name,
    type: 'path',
    path: '${projectRoot}',
    kind: 'folder',
    enabled: true,
    optional: false,
    dependsOn: deps,
  };
}
export function workspace(actions: Action[] = [action()]): Workspace {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    schemaVersion: 1,
    revision: 0,
    name: 'Test workspace',
    description: '',
    rootPath: process.cwd(),
    color: 'mint',
    actions,
    createdAt: now,
    updatedAt: now,
  };
}
