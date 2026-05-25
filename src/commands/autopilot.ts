import type { Command } from 'commander';
import { invokeFn, restGet, restPatch } from '../api.js';
import { output, fail } from '../output.js';

export function registerAutopilot(program: Command): void {
  const autopilot = program.command('autopilot').description('Manage AI autopilot for inbox conversations');

  autopilot
    .command('ls')
    .description('List autopilot configurations')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { limit: string; json?: boolean }) => {
      const rows = await restGet(
        `autopilots?select=id,name,status,channel,created_at,updated_at&order=updated_at.desc&limit=${opts.limit}`,
      );
      output(rows, { json: opts.json });
    });

  autopilot
    .command('trigger')
    .description('Trigger AI autopilot on an existing conversation')
    .argument('<conversationId>')
    .option('--json', 'Emit JSON')
    .action(async (conversationId: string, opts: { json?: boolean }) => {
      const result = await invokeFn('inbox-autopilot-trigger', { conversationId });
      output(result, { json: opts.json });
    });

  autopilot
    .command('pause')
    .description('Pause AI on a conversation')
    .argument('<conversationId>')
    .option('--hours <n>', 'How many hours to pause', '24')
    .option('--json', 'Emit JSON')
    .action(async (conversationId: string, opts: { hours: string; json?: boolean }) => {
      const hours = Number(opts.hours);
      if (!Number.isFinite(hours) || hours <= 0) fail('--hours must be a positive number');
      const until = new Date(Date.now() + hours * 3600_000).toISOString();
      const updated = await restPatch<unknown[]>(`crm_conversations?id=eq.${conversationId}`, {
        ai_enabled: false,
        ai_paused_until: until,
      });
      output(Array.isArray(updated) ? updated[0] : updated, { json: opts.json });
    });

  autopilot
    .command('resume')
    .description('Re-enable AI on a conversation')
    .argument('<conversationId>')
    .option('--json', 'Emit JSON')
    .action(async (conversationId: string, opts: { json?: boolean }) => {
      const updated = await restPatch<unknown[]>(`crm_conversations?id=eq.${conversationId}`, {
        ai_enabled: true,
        ai_paused_until: null,
      });
      output(Array.isArray(updated) ? updated[0] : updated, { json: opts.json });
    });
}
