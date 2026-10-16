import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, RpcResult, Run } from '../shared/types';
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as RpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const api: DesktopApi = {
  bootstrap: () => call('bootstrap'),
  saveWorkspace: (w) => call('save-workspace', w),
  deleteWorkspace: (id) => call('delete-workspace', id),
  validateWorkspace: (id) => call('validate-workspace', id),
  launchWorkspace: (id, retry) => call('launch-workspace', id, retry),
  getRun: (id) => call('get-run', id),
  cancelRun: (id) => call('cancel-run', id),
  createShortcut: (id) => call('create-shortcut', id),
  saveSettings: (settings) => call('save-settings', settings),
  detectApps: () => call('detect-apps'),
  pickPath: (kind) => call('pick-path', kind),
  readScript: () => call('read-script'),
  onRun: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, run: Run) => listener(run);
    ipcRenderer.on('run-changed', handler);
    return () => ipcRenderer.removeListener('run-changed', handler);
  },
};
contextBridge.exposeInMainWorld('instastart', api);
