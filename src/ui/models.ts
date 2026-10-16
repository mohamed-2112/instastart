import type { Action, Workspace } from '../shared/schema';
export const labels = {
  ide: 'IDE project',
  browser: 'Chrome tabs',
  path: 'File or folder',
  app: 'Application',
  commands: 'Commands',
};
export const icons = {
  ide: 'code',
  browser: 'globe',
  path: 'folder',
  app: 'monitor',
  commands: 'terminal',
};
export const uid = () => crypto.randomUUID();
export function newWorkspace(): Workspace {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    revision: 0,
    name: '',
    description: '',
    rootPath: '',
    color: 'mint',
    actions: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function newAction(type: Action['type']): Action {
  const base = { id: uid(), name: labels[type], enabled: true, optional: false, dependsOn: [] };
  switch (type) {
    case 'ide':
      return { ...base, type, app: 'vscode', path: '${projectRoot}', newWindow: true };
    case 'browser':
      return { ...base, type, urls: ['https://github.com/'], newWindow: true, profile: '' };
    case 'path':
      return { ...base, type, kind: 'file', path: '${projectRoot}/README.md' };
    case 'app':
      return { ...base, type, executable: '', args: [], cwd: '${projectRoot}' };
    case 'commands':
      return {
        ...base,
        type,
        shell: 'cmd',
        cwd: '${projectRoot}',
        mode: 'steps',
        steps: [
          {
            id: uid(),
            name: 'Command 1',
            command: 'echo Workspace ready',
            timeoutSeconds: 60,
            continueOnError: false,
          },
        ],
        script: '',
        timeoutSeconds: 300,
        env: {},
      };
  }
}
export function actionDescription(a: Action): string {
  switch (a.type) {
    case 'ide':
      return `${a.app === 'vscode' ? 'VS Code' : 'IntelliJ IDEA'} · ${a.path}`;
    case 'browser':
      return `${a.urls.length} ${a.urls.length === 1 ? 'link' : 'links'}${a.newWindow ? ' · new window' : ''}`;
    case 'path':
      return a.path;
    case 'app':
      return a.executable || 'Choose an application';
    case 'commands':
      return `${a.mode === 'script' ? 'Shared script' : `${a.steps.length} ordered commands`} · ${a.shell === 'cmd' ? 'Command Prompt' : a.shell === 'pwsh' ? 'PowerShell 7' : 'Windows PowerShell'}`;
  }
}
