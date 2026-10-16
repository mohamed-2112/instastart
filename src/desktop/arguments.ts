import { idSchema } from '../shared/schema';
export function workspaceFromArguments(argv: string[]): string | undefined {
  const launch = argv.indexOf('launch');
  if (launch < 0 || argv[launch + 1] !== '--workspace') return undefined;
  const parsed = idSchema.safeParse(argv[launch + 2]);
  return parsed.success ? parsed.data : undefined;
}
