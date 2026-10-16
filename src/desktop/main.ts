import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { Repository } from '../infrastructure/repository';
import { WindowsExecutor, detectApplications } from '../infrastructure/windows';
import { LaunchEngine } from '../application/runner';
import { idSchema, settingsSchema, workspaceSchema } from '../shared/schema';
import type { Bootstrap, RpcResult, Run } from '../shared/types';
import { workspaceFromArguments } from './arguments';

let window: BrowserWindow | null = null;
let repository: Repository;
let engine: LaunchEngine;
let closing = false;
let closePrompt = false;
let shortcutRunId: string | undefined;
const queuedLaunches: string[] = [];
app.setName('InstaStart');

function publish(run: Run): void {
  if (window && !window.isDestroyed()) window.webContents.send('run-changed', run);
}
function assertSender(event: IpcMainInvokeEvent): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('Untrusted application request.');
  const expected = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
  const actual = new URL(event.senderFrame.url);
  expected.hash = '';
  actual.hash = '';
  if (actual.href !== expected.href) throw new Error('Untrusted application page.');
}
function handle<T>(name: string, fn: (...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(name, async (event, ...args): Promise<RpcResult<T>> => {
    try {
      assertSender(event);
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join('\n')
            : error instanceof Error
              ? error.message
              : 'Operation failed.',
      };
    }
  });
}
function workspace(id: unknown) {
  const found = repository.getWorkspace(idSchema.parse(id));
  if (!found) throw new Error('Workspace no longer exists.');
  return found;
}
async function createWindow(): Promise<void> {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  const assets = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.resolve('assets');
  window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    show: false,
    title: 'InstaStart',
    backgroundColor: '#f4f6f3',
    autoHideMenuBar: true,
    icon: path.join(assets, 'instastart.png'),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = null;
  });
  window.on('close', (event) => {
    if (closing || !engine?.activeCount) return;
    event.preventDefault();
    if (closePrompt) return;
    closePrompt = true;
    void dialog
      .showMessageBox(window!, {
        type: 'question',
        title: 'Launch in progress',
        message: 'A workspace is still launching.',
        detail: 'You can keep it running or cancel its remaining commands and close InstaStart.',
        buttons: ['Keep running', 'Cancel launch and close'],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        closePrompt = false;
        if (response !== 1) return;
        engine.cancelAll();
        const timer = setInterval(() => {
          if (!engine.activeCount) {
            clearInterval(timer);
            closing = true;
            app.quit();
          }
        }, 100);
      });
  });
  await window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}
async function createShortcut(id: unknown): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Desktop shortcuts are available on Windows.');
  if (!app.isPackaged)
    throw new Error(
      'Create and open a packaged build first (npm run package). Development shortcuts would depend on this source folder.',
    );
  const w = workspace(id);
  const iconDir = path.join(app.getPath('userData'), 'icons');
  await mkdir(iconDir, { recursive: true });
  const icon = path.join(iconDir, 'instastart.ico');
  await copyFile(path.join(process.resourcesPath, 'assets', 'instastart.ico'), icon);
  const safeName =
    w.name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/[. ]+$/g, '')
      .slice(0, 70) || 'Workspace';
  const filename = path.join(
    app.getPath('desktop'),
    `InstaStart - ${safeName} - ${w.id.slice(0, 8)}.lnk`,
  );
  const updater = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const launchArgs = `launch --workspace ${w.id}`;
  const useUpdater = existsSync(updater);
  const created = shell.writeShortcutLink(filename, 'create', {
    target: useUpdater ? updater : process.execPath,
    args: useUpdater
      ? `--processStart InstaStart.exe --process-start-args "${launchArgs}"`
      : launchArgs,
    cwd: path.dirname(useUpdater ? updater : process.execPath),
    description: `Open ${w.name}`,
    icon,
    iconIndex: 0,
    appUserModelId: 'app.instastart.desktop',
  });
  if (!created)
    throw new Error('Windows could not create the shortcut. Check access to your Desktop.');
  return filename;
}
function registerIpc(): void {
  handle('bootstrap', (): Bootstrap => ({
    workspaces: repository.listWorkspaces(),
    settings: repository.getSettings(),
    runs: repository.listRuns(),
    platform: process.platform,
    version: app.getVersion(),
    packaged: app.isPackaged,
    dataPath: app.getPath('userData'),
    launchRunId: shortcutRunId,
  }));
  handle('save-workspace', (input) => repository.saveWorkspace(workspaceSchema.parse(input)));
  handle('delete-workspace', (id) => {
    const w = workspace(id);
    if (engine.getActive(w.id))
      throw new Error('Cancel or finish the active launch before deleting this workspace.');
    repository.deleteWorkspace(w.id);
  });
  handle('validate-workspace', (id) =>
    new WindowsExecutor(repository.getSettings(), shell).validate(workspace(id)),
  );
  handle('launch-workspace', (id, retry) =>
    engine.launch(workspace(id), retry === undefined ? undefined : idSchema.parse(retry)),
  );
  handle('get-run', (id) => {
    const run = repository.getRun(idSchema.parse(id));
    if (!run) throw new Error('Launch history is no longer available.');
    return run;
  });
  handle('cancel-run', (id) => engine.cancel(idSchema.parse(id)));
  handle('create-shortcut', createShortcut);
  handle('save-settings', (input) => repository.saveSettings(settingsSchema.parse(input)));
  handle('detect-apps', async () =>
    repository.saveSettings(await detectApplications(repository.getSettings())),
  );
  handle('pick-path', async (input) => {
    const kind = z.enum(['folder', 'file', 'executable', 'script']).parse(input);
    const result = await dialog.showOpenDialog(window!, {
      title: kind === 'folder' ? 'Choose a folder' : 'Choose a file',
      properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
      filters:
        kind === 'executable'
          ? [{ name: 'Applications', extensions: ['exe'] }]
          : kind === 'script'
            ? [{ name: 'Scripts', extensions: ['cmd', 'bat', 'ps1'] }]
            : [],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('read-script', async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: 'Import a script into this resource',
      properties: ['openFile'],
      filters: [{ name: 'Scripts', extensions: ['cmd', 'bat', 'ps1'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    if ((await stat(result.filePaths[0])).size > 32000)
      throw new Error('Choose a script smaller than 32 KB.');
    return (await readFile(result.filePaths[0], 'utf8')).replace(/^\uFEFF/, '');
  });
}
async function launchFromShortcut(id: string): Promise<void> {
  try {
    shortcutRunId = engine.launch(workspace(id)).id;
    await createWindow();
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Workspace could not launch',
      message: error instanceof Error ? error.message : String(error),
    });
    await createWindow();
  }
}
async function boot(): Promise<void> {
  if (squirrelStartup) {
    app.quit();
    return;
  }
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', (_event, argv) => {
    const id = workspaceFromArguments(argv);
    if (!engine) {
      if (id) queuedLaunches.push(id);
      return;
    }
    if (id) void launchFromShortcut(id);
    else void createWindow();
  });
  await app.whenReady();
  app.setAppUserModelId('app.instastart.desktop');
  repository = new Repository(path.join(app.getPath('userData'), 'instastart.sqlite'));
  repository.saveSettings(await detectApplications(repository.getSettings()));
  engine = new LaunchEngine(
    repository,
    () => new WindowsExecutor(repository.getSettings(), shell),
    publish,
  );
  registerIpc();
  const id = workspaceFromArguments(process.argv);
  if (id) await launchFromShortcut(id);
  else await createWindow();
  for (const pending of queuedLaunches) await launchFromShortcut(pending);
  app.on('activate', () => {
    void createWindow();
  });
}
app.on('window-all-closed', () => {
  if (!engine?.activeCount) app.quit();
});
app.on('will-quit', () => repository?.close());
void boot().catch((error) => {
  dialog.showErrorBox(
    'InstaStart could not start',
    error instanceof Error ? error.message : String(error),
  );
  app.quit();
});
