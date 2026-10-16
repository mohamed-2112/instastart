import { spawn } from 'node:child_process';
import { access, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Action, AppId, Settings, Workspace } from '../shared/schema';
import type { ValidationIssue } from '../shared/types';
import type { Executor, ExecutionContext } from '../application/runner';
import { executeCommands } from './processes';

export function resolvePath(input: string, root: string): string {
  const expanded = input.split('${projectRoot}').join(root);
  if (/\$\{[^}]+\}/.test(expanded))
    throw new Error('Only ${projectRoot} is supported in path fields.');
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(root, expanded);
}
async function exists(file: string): Promise<boolean> {
  if (!file) return false;
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
const blockedFileExtensions = new Set([
  '.exe',
  '.com',
  '.cmd',
  '.bat',
  '.ps1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.msi',
  '.scr',
  '.lnk',
  '.url',
  '.hta',
  '.py',
  '.pyw',
]);
export async function detectApplications(current: Settings): Promise<Settings> {
  if (process.platform !== 'win32') return current;
  const settings = structuredClone(current);
  const local = process.env.LOCALAPPDATA ?? '',
    pf = process.env.ProgramFiles ?? 'C:\\Program Files',
    pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    win = process.env.SystemRoot ?? 'C:\\Windows';
  const candidates: Record<AppId, string[]> = {
    chrome: [
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
      path.join(local, 'Google/Chrome/Application/chrome.exe'),
    ],
    vscode: [
      path.join(local, 'Programs/Microsoft VS Code/Code.exe'),
      path.join(pf, 'Microsoft VS Code/Code.exe'),
    ],
    intellij: [],
    cmd: [path.join(win, 'System32/cmd.exe')],
    powershell: [path.join(win, 'System32/WindowsPowerShell/v1.0/powershell.exe')],
    pwsh: [path.join(pf, 'PowerShell/7/pwsh.exe')],
  };
  for (const base of [path.join(pf, 'JetBrains'), path.join(local, 'Programs')]) {
    for (const entry of await readdir(base, { withFileTypes: true }).catch(() => []))
      if (entry.isDirectory() && /intellij|idea/i.test(entry.name))
        candidates.intellij.push(path.join(base, entry.name, 'bin/idea64.exe'));
  }
  for (const id of Object.keys(candidates) as AppId[]) {
    if (await exists(settings.bindings[id])) continue;
    for (const file of candidates[id])
      if (await exists(file)) {
        settings.bindings[id] = file;
        break;
      }
  }
  return settings;
}
export interface Openers {
  openPath(path: string): Promise<string>;
}
export class WindowsExecutor implements Executor {
  constructor(
    private settings: Settings,
    private openers: Openers,
  ) {}
  async validate(workspace: Workspace): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    if (process.platform !== 'win32')
      return [
        {
          optional: false,
          message:
            'Application launching is supported on Windows. This build can still edit workspaces.',
        },
      ];
    const check = async (file: string, kind: 'file' | 'folder') => {
      const info = await stat(file).catch(() => undefined);
      if (!info || (kind === 'folder' ? !info.isDirectory() : !info.isFile()))
        throw new Error(`${kind === 'folder' ? 'Folder' : 'File'} not found: ${file}`);
    };
    if (!path.isAbsolute(workspace.rootPath))
      issues.push({ optional: false, message: 'Choose an absolute project folder path.' });
    else {
      try {
        await check(workspace.rootPath, 'folder');
      } catch (e) {
        issues.push({ optional: false, message: (e as Error).message });
      }
    }
    for (const a of workspace.actions.filter((a) => a.enabled)) {
      try {
        let binding: AppId | undefined;
        if (a.type === 'ide') {
          binding = a.app;
          await check(resolvePath(a.path, workspace.rootPath), 'folder');
        }
        if (a.type === 'browser') binding = 'chrome';
        if (a.type === 'commands') {
          binding = a.shell;
          await check(resolvePath(a.cwd, workspace.rootPath), 'folder');
        }
        if (a.type === 'path') {
          const resolved = resolvePath(a.path, workspace.rootPath);
          await check(resolved, a.kind);
          if (a.kind === 'file' && blockedFileExtensions.has(path.extname(resolved).toLowerCase()))
            throw new Error(
              'Use an Application or Commands resource for executable files and scripts.',
            );
        }
        if (a.type === 'app') {
          if (!path.isAbsolute(a.executable) || path.extname(a.executable).toLowerCase() !== '.exe')
            throw new Error('Choose an absolute .exe application path.');
          await check(a.executable, 'file');
          await check(resolvePath(a.cwd, workspace.rootPath), 'folder');
        }
        if (binding) {
          const executable = this.settings.bindings[binding];
          if (
            !executable ||
            !path.isAbsolute(executable) ||
            path.extname(executable).toLowerCase() !== '.exe'
          )
            throw new Error(`Set the ${binding} executable path in Settings.`);
          await check(executable, 'file');
        }
      } catch (error) {
        issues.push({
          actionId: a.id,
          optional: a.optional,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return issues;
  }
  async execute(a: Action, w: Workspace, context: ExecutionContext): Promise<string> {
    if (context.signal.aborted) throw new Error('Cancelled.');
    if (process.platform !== 'win32')
      throw new Error('Windows is required to launch this workspace.');
    if (a.type === 'commands')
      return executeCommands(
        a,
        this.settings.bindings[a.shell],
        resolvePath(a.cwd, w.rootPath),
        context,
      );
    if (a.type === 'path') {
      const error = await this.openers.openPath(resolvePath(a.path, w.rootPath));
      if (error) throw new Error(error);
      return 'Open request accepted by Windows.';
    }
    let executable: string,
      args: string[],
      cwd = w.rootPath;
    if (a.type === 'ide') {
      executable = this.settings.bindings[a.app];
      args =
        a.app === 'vscode'
          ? [a.newWindow ? '--new-window' : '--reuse-window', resolvePath(a.path, w.rootPath)]
          : [resolvePath(a.path, w.rootPath)];
    } else if (a.type === 'browser') {
      executable = this.settings.bindings.chrome;
      args = [
        ...(a.newWindow ? ['--new-window'] : []),
        ...(a.profile ? [`--profile-directory=${a.profile}`] : []),
        ...a.urls,
      ];
    } else {
      executable = a.executable;
      args = a.args;
      cwd = resolvePath(a.cwd, w.rootPath);
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return 'Launch request accepted. Loading is handled by the application.';
  }
}
