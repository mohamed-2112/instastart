import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { workspaceSchema } from '../src/shared/schema';
import { workspaceFromArguments } from '../src/desktop/arguments';
import { action, workspace } from './fixtures';
describe('input boundaries', () => {
  it('rejects dependency cycles, unknown prerequisites and disabled prerequisites', () => {
    const a = action(),
      b = action();
    a.dependsOn = [b.id];
    b.dependsOn = [a.id];
    expect(workspaceSchema.safeParse(workspace([a, b])).success).toBe(false);
    a.dependsOn = [randomUUID()];
    expect(workspaceSchema.safeParse(workspace([a])).success).toBe(false);
    a.dependsOn = [b.id];
    b.dependsOn = [];
    b.enabled = false;
    expect(workspaceSchema.safeParse(workspace([a, b])).success).toBe(false);
  });
  it('rejects executable browser schemes and credentials in URLs', () => {
    const base = action();
    for (const url of [
      'javascript:alert(1)',
      'file:///C:/script.cmd',
      'https://name:secret@example.com',
    ]) {
      const w = workspace([
        { ...base, type: 'browser', urls: [url], newWindow: true, profile: '' } as never,
      ]);
      expect(workspaceSchema.safeParse(w).success).toBe(false);
    }
  });
  it('accepts only a valid workspace ID at the shortcut entry point', () => {
    const id = randomUUID();
    expect(workspaceFromArguments(['InstaStart.exe', 'launch', '--workspace', id])).toBe(id);
    expect(
      workspaceFromArguments(['InstaStart.exe', 'launch', '--workspace', 'bad & echo test']),
    ).toBeUndefined();
  });
});
