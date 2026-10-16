import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runProcess, redact, mergeEnvironment } from '../src/infrastructure/processes';
describe('real subprocess behavior', () => {
  it('preserves spaces, Unicode arguments, and the working directory', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'InstaStart spaces é '));
    let output = '';
    try {
      await runProcess(
        process.execPath,
        [
          '-e',
          'process.stdout.write(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1)}))',
          'a b',
          'مرحبا',
        ],
        {
          cwd,
          signal: new AbortController().signal,
          timeoutMs: 5000,
          log: (x) => {
            output += x;
          },
        },
      );
      expect(JSON.parse(output)).toEqual({ cwd, args: ['a b', 'مرحبا'] });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('surfaces nonzero exit codes and captures stderr', async () => {
    let output = '';
    await expect(
      runProcess(process.execPath, ['-e', 'process.stderr.write("failed");process.exit(7)'], {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        timeoutMs: 5000,
        log: (x) => {
          output += x;
        },
      }),
    ).rejects.toMatchObject({ exitCode: 7 });
    expect(output).toContain('failed');
  });
  it('times out a process that never finishes', async () => {
    await expect(
      runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        timeoutMs: 100,
        log: () => undefined,
      }),
    ).rejects.toThrow('Timed out');
  });
  it('redacts configured secrets and avoids duplicate Windows environment keys', () => {
    expect(
      redact('Bearer abcdefg?x=1 token-secret https://x/?token=xyz', ['token-secret']),
    ).not.toContain('token-secret');
    const env = mergeEnvironment({ Path: 'custom' });
    expect(Object.keys(env).filter((k) => k.toLowerCase() === 'path')).toEqual(['Path']);
    expect(env.Path).toBe('custom');
  });
});
