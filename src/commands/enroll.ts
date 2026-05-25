import type { Command } from 'commander';
import { invokeFn } from '../api.js';
import { readConfig } from '../config.js';
import { output, fail } from '../output.js';
import { parseList } from '../util.js';

interface EnrollOptions {
  campaign: string;
  list?: string;
  contacts?: string;
  organization?: string;
  json?: boolean;
}

export function registerEnroll(program: Command): void {
  program
    .command('enroll')
    .description('Enroll leads into a campaign sequence')
    .requiredOption('-c, --campaign <sequenceId>', 'Campaign / sequence ID')
    .option('-l, --list <listId>', 'Enroll an entire lead list')
    .option('--contacts <ids>', 'Comma-separated contact IDs')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--json', 'Emit JSON')
    .action(async (opts: EnrollOptions) => {
      const orgId = opts.organization || readConfig().active_org_id;
      if (!orgId) {
        fail('No active organization. Run `aca org switch <id>` or pass --organization.');
      }

      const body: Record<string, unknown> = {
        sequenceId: opts.campaign,
        organizationId: orgId,
      };
      if (opts.list) body.listId = opts.list;
      else if (opts.contacts) body.contactIds = parseList(opts.contacts);
      else fail('Provide either --list <id> or --contacts <id1,id2,...>');

      const result = await invokeFn('enroll-leads', body);
      output(result, { json: opts.json });
    });
}
