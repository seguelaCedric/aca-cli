import type { Command } from 'commander';
import { restGet, restPatch } from '../api.js';
import { output, fail } from '../output.js';
import { parseSendAt } from './reply.js';

interface QueueRow {
  id: string;
  conversation_id: string | null;
  contact_id: string;
  channel: string;
  recipient_display_name: string | null;
  scheduled_for: string;
  status: string;
  cancel_on_reply: boolean;
  cancelled_reason: string | null;
  error_message: string | null;
  content: string;
}

const COLS =
  'id,conversation_id,contact_id,channel,recipient_display_name,scheduled_for,status,cancel_on_reply,cancelled_reason,error_message,content';

export function registerScheduled(program: Command): void {
  const cmd = program.command('scheduled').description('Scheduled inbox replies (send later)');

  cmd
    .command('ls')
    .description('List scheduled replies (pending by default)')
    .option('-c, --conversation <id>', 'Only this conversation')
    .option('--all', 'Include sent, cancelled and failed')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { conversation?: string; all?: boolean; limit: string; json?: boolean }) => {
      const filters = ['source_type=eq.manual', 'conversation_id=not.is.null'];
      if (!opts.all) filters.push('status=eq.pending');
      if (opts.conversation) filters.push(`conversation_id=eq.${opts.conversation}`);
      const rows = await restGet<QueueRow[]>(
        `crm_message_queue?${filters.join('&')}&select=${COLS}&order=scheduled_for.${opts.all ? 'desc' : 'asc'}&limit=${Number(opts.limit) || 50}`,
      );
      if (opts.json) return output(rows, { json: true });
      output(
        rows.map((r) => ({
          id: r.id,
          to: r.recipient_display_name,
          channel: r.channel,
          send_at: new Date(r.scheduled_for).toLocaleString(),
          status: r.cancelled_reason ? `${r.status} (${r.cancelled_reason})` : r.status,
          cancel_on_reply: r.cancel_on_reply,
          preview: r.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
        })),
      );
    });

  cmd
    .command('cancel')
    .description('Cancel a pending scheduled reply')
    .argument('<id>')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      const rows = await restPatch<QueueRow[]>(`crm_message_queue?id=eq.${id}&status=eq.pending&select=${COLS}`, {
        status: 'cancelled',
        cancelled_reason: 'user_cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!rows?.length) fail(`No pending scheduled reply ${id} (already sent, cancelled or not found)`);
      output(rows[0], { json: opts.json });
    });

  cmd
    .command('reschedule')
    .description('Move a pending scheduled reply to a new time')
    .argument('<id>')
    .requiredOption('--at <datetime>', 'New time, e.g. "2026-12-08 09:00" (local) or ISO with offset')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { at: string; json?: boolean }) => {
      const at = parseSendAt(opts.at);
      if (at.getTime() <= Date.now()) fail(`--at is in the past: ${at.toString()}`);
      const rows = await restPatch<QueueRow[]>(`crm_message_queue?id=eq.${id}&status=eq.pending&select=${COLS}`, {
        scheduled_for: at.toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!rows?.length) fail(`No pending scheduled reply ${id} (already sent, cancelled or not found)`);
      output(rows[0], { json: opts.json });
    });
}
