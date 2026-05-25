import type { Command } from 'commander';
import { restGet } from '../api.js';
import { output } from '../output.js';

const STUCK_STATUSES = ['failed', 'sender_disconnected'] as const;

export function registerCampaign(program: Command): void {
  const campaign = program.command('campaign').description('Inspect campaigns / sequences');

  campaign
    .command('ls')
    .description('List sequences for the current org')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { limit: string; json?: boolean }) => {
      const rows = await restGet(
        `crm_sequences?select=id,name,status,channel,created_at,updated_at&order=updated_at.desc&limit=${opts.limit}`,
      );
      output(rows, { json: opts.json });
    });

  campaign
    .command('status')
    .description('Aggregate progress counts for a campaign')
    .argument('<campaignId>')
    .option('--json', 'Emit JSON')
    .action(async (campaignId: string, opts: { json?: boolean }) => {
      const rows = await restGet<{ status: string }[]>(
        `campaign_lead_progress?campaign_id=eq.${campaignId}&select=status&limit=10000`,
      );
      const counts = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {});
      const stuck = STUCK_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);
      output(
        {
          campaign_id: campaignId,
          total_leads: rows.length,
          counts_by_status: counts,
          stuck_leads: stuck,
        },
        { json: opts.json },
      );
    });

  campaign
    .command('leads')
    .description('List leads on a campaign (filter by --stuck or --status)')
    .argument('<campaignId>')
    .option('--stuck', 'Only stuck leads (status in failed, sender_disconnected)')
    .option('--status <status>', 'Filter by specific status')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(
      async (
        campaignId: string,
        opts: { stuck?: boolean; status?: string; limit: string; json?: boolean },
      ) => {
        const params = new URLSearchParams();
        params.append(
          'select',
          'id,contact_id,status,current_node_id,next_action_at,error_message,retry_count,crm_contacts(display_name,company,primary_email)',
        );
        params.append('campaign_id', `eq.${campaignId}`);
        params.append('order', 'next_action_at.desc.nullslast');
        params.append('limit', String(opts.limit));
        if (opts.stuck) {
          params.append('status', `in.(${STUCK_STATUSES.join(',')})`);
        } else if (opts.status) {
          params.append('status', `eq.${opts.status}`);
        }
        const rows = await restGet(`campaign_lead_progress?${params.toString()}`);
        output(rows, { json: opts.json });
      },
    );
}
