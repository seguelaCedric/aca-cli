import type { Command } from 'commander';
import { restGet } from '../api.js';
import { output } from '../output.js';

interface SearchOptions {
  query?: string;
  tag?: string;
  status?: string;
  company?: string;
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  limit: string;
  json?: boolean;
}

export function registerLeads(program: Command): void {
  const leads = program.command('leads').description('Search and inspect leads / contacts');

  leads
    .command('search')
    .description('Search crm_contacts with filters')
    .option('-q, --query <text>', 'Free-text search across name + email + company')
    .option('--tag <tag>', 'Filter by tag (exact match in tags array)')
    .option('--status <status>', 'active | archived | bounced | unsubscribed | do_not_contact')
    .option('--company <name>', 'Filter by company (ilike)')
    .option('--has-email', 'Only contacts with a primary_email')
    .option('--has-linkedin', 'Only contacts with a primary_linkedin_url')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: SearchOptions) => {
      const params = new URLSearchParams();
      params.append(
        'select',
        'id,display_name,company,job_title,primary_email,primary_linkedin_url,status,tags,lead_score,last_activity_at',
      );
      params.append('order', 'last_activity_at.desc');
      params.append('limit', String(opts.limit));

      if (opts.status) params.append('status', `eq.${opts.status}`);
      if (opts.company) params.append('company', `ilike.*${opts.company}*`);
      if (opts.hasEmail) params.append('primary_email', 'not.is.null');
      if (opts.hasLinkedin) params.append('primary_linkedin_url', 'not.is.null');
      if (opts.tag) params.append('tags', `cs.{${opts.tag}}`);
      if (opts.query) {
        const q = opts.query.replace(/[,()]/g, '');
        params.append(
          'or',
          `(display_name.ilike.*${q}*,primary_email.ilike.*${q}*,company.ilike.*${q}*)`,
        );
      }

      const rows = await restGet(`crm_contacts?${params.toString()}`);
      output(rows, { json: opts.json });
    });

  leads
    .command('get')
    .description('Fetch a single contact by ID')
    .argument('<contactId>')
    .option('--json', 'Emit JSON')
    .action(async (contactId: string, opts: { json?: boolean }) => {
      const rows = await restGet<unknown[]>(`crm_contacts?id=eq.${contactId}&select=*`);
      output(rows[0] ?? null, { json: opts.json });
    });
}
