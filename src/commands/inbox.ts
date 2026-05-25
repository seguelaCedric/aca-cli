import type { Command } from 'commander';
import { restGet } from '../api.js';
import { output } from '../output.js';

export function registerInbox(program: Command): void {
  const inbox = program.command('inbox').description('Inspect CRM inbox conversations');

  inbox
    .command('unread')
    .description('List conversations with unread messages')
    .option('--channel <c>', 'linkedin | email | instagram | whatsapp | telegram | messenger | twitter')
    .option('--status <s>', 'open | snoozed | closed | archived', 'open')
    .option('--limit <n>', 'Max rows', '20')
    .option('--json', 'Emit JSON')
    .action(async (opts: { channel?: string; status: string; limit: string; json?: boolean }) => {
      const params = new URLSearchParams();
      params.append(
        'select',
        'id,channel,status,unread_count,last_message_at,last_message_preview,last_message_direction,priority_score,lead_intent,contact_id,crm_contacts(display_name,company,primary_email)',
      );
      params.append('unread_count', 'gt.0');
      params.append('status', `eq.${opts.status}`);
      if (opts.channel) params.append('channel', `eq.${opts.channel}`);
      params.append('order', 'priority_score.desc,last_message_at.desc');
      params.append('limit', String(opts.limit));

      const rows = await restGet(`crm_conversations?${params.toString()}`);
      output(rows, { json: opts.json });
    });

  inbox
    .command('show')
    .description('Show a conversation with its recent messages')
    .argument('<conversationId>')
    .option('--limit <n>', 'Max messages', '20')
    .option('--json', 'Emit JSON')
    .action(async (conversationId: string, opts: { limit: string; json?: boolean }) => {
      const conv = await restGet<unknown[]>(
        `crm_conversations?id=eq.${conversationId}&select=*,crm_contacts(display_name,company,primary_email,primary_linkedin_url)`,
      );
      const messages = await restGet<{ sent_at?: string; received_at?: string }[]>(
        `crm_messages?conversation_id=eq.${conversationId}&select=id,direction,content,sent_at,received_at,sender_external_id,read_at&order=sent_at.desc,received_at.desc&limit=${opts.limit}`,
      );
      output({ conversation: conv[0] ?? null, messages: messages.reverse() }, { json: opts.json });
    });

  inbox
    .command('list')
    .description('List conversations (any status)')
    .option('--channel <c>', 'Filter by channel')
    .option('--status <s>', 'Filter by status')
    .option('--intent <i>', 'Filter by lead_intent (e.g. interested)')
    .option('--limit <n>', 'Max rows', '20')
    .option('--json', 'Emit JSON')
    .action(
      async (opts: {
        channel?: string;
        status?: string;
        intent?: string;
        limit: string;
        json?: boolean;
      }) => {
        const params = new URLSearchParams();
        params.append(
          'select',
          'id,channel,status,unread_count,last_message_at,last_message_preview,lead_intent,priority_score,crm_contacts(display_name,company)',
        );
        params.append('order', 'last_message_at.desc');
        params.append('limit', String(opts.limit));
        if (opts.status) params.append('status', `eq.${opts.status}`);
        if (opts.channel) params.append('channel', `eq.${opts.channel}`);
        if (opts.intent) params.append('lead_intent', `eq.${opts.intent}`);
        const rows = await restGet(`crm_conversations?${params.toString()}`);
        output(rows, { json: opts.json });
      },
    );
}
