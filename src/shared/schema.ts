import { z } from 'zod';

export const appIds = ['chrome', 'vscode', 'intellij', 'cmd', 'powershell', 'pwsh'] as const;
export const appIdSchema = z.enum(appIds);
export const idSchema = z.string().uuid();
const shortText = z.string().trim().max(120);
const pathText = z.string().trim().min(1).max(4096);
const httpUrl = z
  .string()
  .trim()
  .max(4096)
  .refine((value) => {
    try {
      const u = new URL(value);
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Enter an http:// or https:// URL without embedded credentials.');
const base = {
  id: idSchema,
  name: shortText.min(1),
  enabled: z.boolean(),
  optional: z.boolean(),
  dependsOn: z.array(idSchema).max(40),
};
export const commandStepSchema = z
  .object({
    id: idSchema,
    name: shortText.min(1),
    command: z
      .string()
      .min(1)
      .max(8000)
      .refine((s) => !/[\r\n]/.test(s), 'Use script mode for multiple lines.'),
    timeoutSeconds: z.number().int().min(1).max(3600),
    continueOnError: z.boolean(),
  })
  .strict();
const environment = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(8000))
  .refine((v) => {
    const keys = Object.keys(v).map((k) => k.toLowerCase());
    return keys.length <= 40 && new Set(keys).size === keys.length;
  }, 'Use at most 40 environment variables with distinct names (case insensitive).');
export const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...base,
      type: z.literal('ide'),
      app: z.enum(['vscode', 'intellij']),
      path: pathText,
      newWindow: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('browser'),
      urls: z.array(httpUrl).min(1).max(30),
      newWindow: z.boolean(),
      profile: z
        .string()
        .max(120)
        .regex(/^[^\r\n"\\/]*$/),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal('path'), path: pathText, kind: z.enum(['file', 'folder']) })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('app'),
      executable: pathText,
      args: z.array(z.string().max(4000)).max(40),
      cwd: pathText,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('commands'),
      shell: z.enum(['cmd', 'powershell', 'pwsh']),
      cwd: pathText,
      mode: z.enum(['steps', 'script']),
      steps: z.array(commandStepSchema).max(30),
      script: z.string().max(32000),
      timeoutSeconds: z.number().int().min(1).max(3600),
      env: environment,
    })
    .strict(),
]);
export const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    revision: z.number().int().nonnegative(),
    name: shortText.min(1),
    description: z.string().max(500),
    rootPath: pathText,
    color: z.enum(['mint', 'blue', 'peach', 'lavender']),
    actions: z.array(actionSchema).max(40),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((w, ctx) => {
    const ids = new Set(w.actions.map((a) => a.id));
    if (ids.size !== w.actions.length)
      ctx.addIssue({ code: 'custom', message: 'Resource IDs must be unique.' });
    const byId = new Map(w.actions.map((a) => [a.id, a]));
    const visited = new Set<string>(),
      visiting = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      for (const dep of byId.get(id)?.dependsOn ?? [])
        if (ids.has(dep) && !visit(dep)) return false;
      visiting.delete(id);
      visited.add(id);
      return true;
    };
    for (const [i, a] of w.actions.entries()) {
      if (!visit(a.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i],
          message: 'Dependencies contain a cycle.',
        });
        break;
      }
      if (new Set(a.dependsOn).size !== a.dependsOn.length)
        ctx.addIssue({ code: 'custom', path: ['actions', i], message: 'Duplicate dependency.' });
      for (const dep of a.dependsOn) {
        if (!ids.has(dep) || dep === a.id || (a.enabled && !byId.get(dep)?.enabled))
          ctx.addIssue({
            code: 'custom',
            path: ['actions', i],
            message: 'Dependencies must refer to another enabled resource.',
          });
      }
      if (a.type === 'commands') {
        if (a.mode === 'steps' && a.steps.length === 0)
          ctx.addIssue({
            code: 'custom',
            path: ['actions', i],
            message: 'Add at least one command.',
          });
        if (a.mode === 'script' && !a.script.trim())
          ctx.addIssue({ code: 'custom', path: ['actions', i], message: 'Enter a script.' });
        if (new Set(a.steps.map((s) => s.id)).size !== a.steps.length)
          ctx.addIssue({
            code: 'custom',
            path: ['actions', i],
            message: 'Command IDs must be unique.',
          });
      }
    }
  });
export const settingsSchema = z
  .object({
    bindings: z
      .object({
        chrome: z.string().max(4096),
        vscode: z.string().max(4096),
        intellij: z.string().max(4096),
        cmd: z.string().max(4096),
        powershell: z.string().max(4096),
        pwsh: z.string().max(4096),
      })
      .strict(),
  })
  .strict();
export const defaultSettings = {
  bindings: { chrome: '', vscode: '', intellij: '', cmd: '', powershell: '', pwsh: '' },
};
export type Workspace = z.infer<typeof workspaceSchema>;
export type Action = z.infer<typeof actionSchema>;
export type CommandAction = Extract<Action, { type: 'commands' }>;
export type CommandStep = z.infer<typeof commandStepSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type AppId = z.infer<typeof appIdSchema>;
