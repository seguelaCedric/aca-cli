import type { Command } from 'commander';
import { restGet, restPatch } from '../api.js';
import { output, fail } from '../output.js';
import { parseList } from '../util.js';

const ALLOWED_STATUSES = ['active', 'archived', 'bounced', 'unsubscribed', 'do_not_contact'] as const;

export function registerContact(program: Command): void {
  const contact = program.command('contact').description('Inspect and mutate a single contact');

  contact
    .command('get')
    .description('Fetch a single contact by ID')
    .argument('<contactId>')
    .option('--json', 'Emit JSON')
    .action(async (contactId: string, opts: { json?: boolean }) => {
      const rows = await restGet<unknown[]>(`crm_contacts?id=eq.${contactId}&select=*`);
      output(rows[0] ?? null, { json: opts.json });
    });

  contact
    .command('tag')
    .description('Add or remove tags on a contact (mutates tags[] column)')
    .argument('<contactId>')
    .option('--add <tags>', 'Comma-separated tags to add')
    .option('--remove <tags>', 'Comma-separated tags to remove')
    .option('--json', 'Emit JSON')
    .action(
      async (
        contactId: string,
        opts: { add?: string; remove?: string; json?: boolean },
      ) => {
        const add = parseList(opts.add);
        const remove = parseList(opts.remove);
        if (add.length === 0 && remove.length === 0) fail('Provide --add and/or --remove');

        const rows = await restGet<{ id: string; tags: string[] | null }[]>(
          `crm_contacts?id=eq.${contactId}&select=id,tags`,
        );
        const contactRow = rows[0];
        if (!contactRow) fail(`Contact ${contactId} not found`);

        const current = new Set(contactRow.tags ?? []);
        for (const t of add) current.add(t);
        for (const t of remove) current.delete(t);
        const nextTags = Array.from(current);

        const updated = await restPatch<unknown[]>(`crm_contacts?id=eq.${contactId}`, {
          tags: nextTags,
        });
        output(Array.isArray(updated) ? updated[0] : updated, { json: opts.json });
      },
    );

  contact
    .command('set-status')
    .description('Update contact status')
    .argument('<contactId>')
    .requiredOption(
      '-s, --status <status>',
      `New status: ${ALLOWED_STATUSES.join(' | ')}`,
    )
    .option('--json', 'Emit JSON')
    .action(async (contactId: string, opts: { status: string; json?: boolean }) => {
      if (!ALLOWED_STATUSES.includes(opts.status as (typeof ALLOWED_STATUSES)[number])) {
        fail(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
      }
      const updated = await restPatch<unknown[]>(`crm_contacts?id=eq.${contactId}`, {
        status: opts.status,
      });
      output(Array.isArray(updated) ? updated[0] : updated, { json: opts.json });
    });
}
