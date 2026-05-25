import type { Command } from 'commander';
import { invokeFn, restGet, restPost, restDelete } from '../api.js';
import { output, fail } from '../output.js';
import { parseList } from '../util.js';

export function registerLists(program: Command): void {
  const lists = program.command('lists').description('Manage lead lists');

  lists
    .command('ls')
    .description('List lead lists for the current organization')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { limit: string; json?: boolean }) => {
      const rows = await restGet(
        `lead_lists?select=id,name,description,member_count,created_at&order=created_at.desc&limit=${opts.limit}`,
      );
      output(rows, { json: opts.json });
    });

  lists
    .command('create')
    .description('Create a new lead list')
    .requiredOption('-n, --name <name>', 'List name')
    .option('-d, --description <desc>', 'Description')
    .option('--json', 'Emit JSON')
    .action(async (opts: { name: string; description?: string; json?: boolean }) => {
      const row: Record<string, unknown> = { name: opts.name };
      if (opts.description) row.description = opts.description;
      const result = await restPost<unknown[]>('lead_lists', row);
      output(Array.isArray(result) ? result[0] : result, { json: opts.json });
    });

  lists
    .command('add')
    .description('Add contacts to a list (bulk, server-side)')
    .requiredOption('-l, --list <listId>', 'Lead list ID')
    .requiredOption('--contacts <ids>', 'Comma-separated contact IDs')
    .option('--json', 'Emit JSON')
    .action(async (opts: { list: string; contacts: string; json?: boolean }) => {
      const contactIds = parseList(opts.contacts);
      if (contactIds.length === 0) fail('No contact IDs provided');
      const result = await invokeFn('bulk-add-to-list', { listId: opts.list, contactIds });
      output(result, { json: opts.json });
    });

  lists
    .command('members')
    .description('List members of a lead list')
    .requiredOption('-l, --list <listId>', 'Lead list ID')
    .option('--limit <n>', 'Max rows', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { list: string; limit: string; json?: boolean }) => {
      const rows = await restGet(
        `lead_list_members?list_id=eq.${opts.list}&select=contact_id,added_at,crm_contacts(id,display_name,primary_email,primary_linkedin_url,company)&order=added_at.desc&limit=${opts.limit}`,
      );
      output(rows, { json: opts.json });
    });

  lists
    .command('remove')
    .description('Remove contacts from a list')
    .requiredOption('-l, --list <listId>', 'Lead list ID')
    .requiredOption('--contacts <ids>', 'Comma-separated contact IDs')
    .option('--json', 'Emit JSON')
    .action(async (opts: { list: string; contacts: string; json?: boolean }) => {
      const ids = parseList(opts.contacts);
      if (ids.length === 0) fail('No contact IDs provided');
      const quoted = ids.map((s) => `"${s}"`).join(',');
      await restDelete(`lead_list_members?list_id=eq.${opts.list}&contact_id=in.(${quoted})`);
      output({ removed: ids.length }, { json: opts.json });
    });
}
