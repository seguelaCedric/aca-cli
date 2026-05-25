import type { Command } from 'commander';
import { invokeFn, restGet } from '../api.js';
import { output, fail } from '../output.js';
import { readStdinIfPiped } from '../util.js';

interface ConversationRow {
  id: string;
  contact_id: string;
  channel: string;
  channel_account_id: string | null;
  external_conversation_id: string | null;
  external_participant_id: string | null;
  last_message_subject: string | null;
  mailbox_id: string | null;
}

export function registerReply(program: Command): void {
  program
    .command('reply')
    .description('Reply to an existing CRM conversation')
    .argument('<conversationId>')
    .option('-m, --message <text>', 'Reply body (or pipe via stdin)')
    .option('--subject <text>', 'Email subject (email channels only)')
    .option('--cc <emails>', 'Comma-separated CC list (email only)')
    .option('--bcc <emails>', 'Comma-separated BCC list (email only)')
    .option('--json', 'Emit JSON')
    .action(
      async (
        conversationId: string,
        opts: {
          message?: string;
          subject?: string;
          cc?: string;
          bcc?: string;
          json?: boolean;
        },
      ) => {
        const piped = await readStdinIfPiped();
        const content = opts.message ?? piped;
        if (!content) fail('Provide --message "..." or pipe text via stdin');

        const rows = await restGet<ConversationRow[]>(
          `crm_conversations?id=eq.${conversationId}&select=id,contact_id,channel,channel_account_id,external_conversation_id,external_participant_id,last_message_subject,mailbox_id`,
        );
        const conv = rows[0];
        if (!conv) fail(`Conversation ${conversationId} not found`);
        if (!conv.external_participant_id) {
          fail('Conversation is missing external_participant_id — cannot determine recipient.');
        }

        const body: Record<string, unknown> = {
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          channel: conv.channel,
          recipient_external_id: conv.external_participant_id,
          content,
        };
        if (conv.channel_account_id) body.channel_account_id = conv.channel_account_id;
        if (conv.external_conversation_id) body.external_conversation_id = conv.external_conversation_id;
        if (conv.channel === 'email' || conv.mailbox_id) {
          body.email_subject = opts.subject ?? conv.last_message_subject ?? undefined;
          if (opts.cc) body.email_cc = opts.cc.split(',').map((s) => s.trim());
          if (opts.bcc) body.email_bcc = opts.bcc.split(',').map((s) => s.trim());
        }

        const result = await invokeFn('crm-send-message', body);
        output(result, { json: opts.json });
      },
    );
}
