import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { CommandAction } from '../shared/schema';
import type { ExecutionContext } from '../application/runner';

export class ProcessFailure extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null = null,
  ) {
    super(message);
  }
}
export function redact(text: string, secrets: string[] = []): string {
  let output = text
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|key|password|secret|access_token)=)[^&\s]+/gi, '$1[redacted]');
  for (const secret of secrets.filter((s) => s.length > 3))
    output = output.split(secret).join('[redacted]');
  return output;
}
export function mergeEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    for (const existing of Object.keys(env))
      if (existing.toLowerCase() === key.toLowerCase()) delete env[existing];
    env[key] = value;
  }
  return env;
}
function terminate(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' },
    );
    killer.on('error', () => child.kill());
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}
export function runProcess(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal: AbortSignal;
    log: (text: string) => void;
    windowsVerbatimArguments?: boolean;
  },
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new ProcessFailure('Cancelled.'));
      return;
    }
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stopReason = '',
      settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string) => {
      if (stopReason) return;
      stopReason = reason;
      terminate(child);
      forceTimer = setTimeout(() => {
        if (child.exitCode === null) {
          try {
            if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
            else child.kill();
          } catch {
            /* It may already have exited. */
          }
        }
      }, 1500);
      forceTimer.unref();
    };
    const abort = () => stop('Cancelled.');
    options.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => stop(`Timed out after ${Math.ceil(options.timeoutMs / 1000)} seconds.`),
      options.timeoutMs,
    );
    const outDecoder = new StringDecoder('utf8'),
      errDecoder = new StringDecoder('utf8');
    child.stdout?.on('data', (chunk) => options.log(outDecoder.write(chunk)));
    child.stderr?.on('data', (chunk) => options.log(errDecoder.write(chunk)));
    const done = (error: Error | null, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      options.signal.removeEventListener('abort', abort);
      options.log(outDecoder.end() + errDecoder.end());
      if (error) reject(error);
      else if (stopReason) reject(new ProcessFailure(stopReason, code));
      else if (code !== 0)
        reject(new ProcessFailure(`Command exited with code ${code ?? 'unknown'}.`, code));
      else resolve(0);
    };
    child.once('error', (error) => done(new ProcessFailure(error.message), null));
    child.once('close', (code) => done(null, code));
  });
}

export function shellScript(shell: CommandAction['shell'], source: string): string {
  if (shell === 'cmd')
    return `@echo off\r\nchcp 65001 >nul\r\n${source.replace(/\r?\n/g, '\r\n')}\r\nexit /b %errorlevel%\r\n`;
  return `\uFEFF$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n$global:LASTEXITCODE = 0\ntry {\n${source}\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n} catch {\n[Console]::Error.WriteLine($_.ToString())\nexit 1\n}\nexit 0\n`;
}
export async function executeCommands(
  action: CommandAction,
  executable: string,
  cwd: string,
  context: ExecutionContext,
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'instastart-'));
  const secrets = Object.entries(action.env)
    .filter(([k]) => /token|secret|password|key|credential/i.test(k))
    .map(([, v]) => v);
  const steps =
    action.mode === 'script'
      ? [
          {
            id: action.id,
            name: 'Shared script',
            command: action.script,
            timeoutSeconds: action.timeoutSeconds,
            continueOnError: false,
          },
        ]
      : action.steps;
  for (const s of steps) context.updateStep({ id: s.id, name: s.name, status: 'queued' });
  let failed = false;
  try {
    for (const [index, step] of steps.entries()) {
      if (context.signal.aborted) throw new ProcessFailure('Cancelled.');
      context.updateStep({ id: step.id, name: step.name, status: 'running' });
      context.log(`\n[${new Date().toLocaleTimeString()}] ${step.name}\n`);
      const file = path.join(dir, `step-${index}.${action.shell === 'cmd' ? 'cmd' : 'ps1'}`);
      await writeFile(file, shellScript(action.shell, step.command), 'utf8');
      try {
        const args =
          action.shell === 'cmd'
            ? ['/d', '/s', '/c', `""${file}""`]
            : ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file];
        await runProcess(executable, args, {
          cwd,
          env: mergeEnvironment(action.env),
          timeoutMs: step.timeoutSeconds * 1000,
          signal: context.signal,
          log: (text) => context.log(redact(text, secrets)),
          windowsVerbatimArguments: action.shell === 'cmd',
        });
        context.updateStep({ id: step.id, name: step.name, status: 'succeeded', exitCode: 0 });
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        context.updateStep({
          id: step.id,
          name: step.name,
          status: context.signal.aborted ? 'cancelled' : 'failed',
          message,
          exitCode: error instanceof ProcessFailure ? error.exitCode : null,
        });
        if (!step.continueOnError || context.signal.aborted) {
          for (const next of steps.slice(index + 1))
            context.updateStep({
              id: next.id,
              name: next.name,
              status: 'blocked',
              message: 'Previous command did not succeed.',
            });
          throw error;
        }
      }
    }
    if (failed)
      throw new ProcessFailure('Sequence completed with failed steps. Review the output.');
    return `${steps.length} ${steps.length === 1 ? 'command' : 'commands'} completed successfully.`;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
