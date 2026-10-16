import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { executeCommands } from '../src/infrastructure/processes';
import type { CommandAction } from '../src/shared/schema';
import type { StepResult } from '../src/shared/types';
const step = (command: string) => ({
  id: randomUUID(),
  name: command,
  command,
  timeoutSeconds: 10,
  continueOnError: false,
});
function sequence(commands: string[]): CommandAction {
  return {
    id: randomUUID(),
    type: 'commands',
    name: 'Sequence',
    enabled: true,
    optional: false,
    dependsOn: [],
    shell: 'cmd',
    cwd: process.cwd(),
    mode: 'steps',
    steps: commands.map(step),
    script: '',
    timeoutSeconds: 10,
    env: {},
  };
}
describe.runIf(process.platform === 'win32')('native Windows command sequences', () => {
  const cmd = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cmd.exe');
  it('runs commands in order and blocks the next command after failure', async () => {
    let logs = '';
    const statuses = new Map<string, StepResult>();
    const a = sequence(['echo FIRST', 'exit /b 7', 'echo SHOULD_NOT_RUN']);
    await expect(
      executeCommands(a, cmd, process.cwd(), {
        signal: new AbortController().signal,
        log: (x) => {
          logs += x;
        },
        updateStep: (s) => statuses.set(s.id, s),
      }),
    ).rejects.toMatchObject({ exitCode: 7 });
    expect(logs).toContain('FIRST');
    expect(logs).not.toContain('SHOULD_NOT_RUN');
    expect(statuses.get(a.steps[2].id)?.status).toBe('blocked');
  });
  it('keeps shared shell state inside a script', async () => {
    const a = sequence([]);
    a.mode = 'script';
    a.script = 'set INSTA_TEST_VALUE=shared-value\necho %INSTA_TEST_VALUE%';
    let logs = '';
    await executeCommands(a, cmd, process.cwd(), {
      signal: new AbortController().signal,
      log: (x) => {
        logs += x;
      },
      updateStep: () => undefined,
    });
    expect(logs).toContain('shared-value');
  });
  it('preserves a nested batch file exit code with spaces in its path', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'InstaStart commands '));
    const script = path.join(dir, 'nested file.cmd');
    try {
      await writeFile(script, '@echo off\r\necho NESTED\r\nexit /b 9\r\n');
      const a = sequence([`"${script}"`]);
      await expect(
        executeCommands(a, cmd, dir, {
          signal: new AbortController().signal,
          log: () => undefined,
          updateStep: () => undefined,
        }),
      ).rejects.toMatchObject({ exitCode: 9 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
