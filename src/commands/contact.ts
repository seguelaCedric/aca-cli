import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { Command } from 'commander';
import { invokeFn, restGet, restPatch } from '../api.js';
import { output, fail } from '../output.js';
import { parseCsv, parseList, readStdinIfPiped } from '../util.js';

const ALLOWED_STATUSES = ['active', 'archived', 'bounced', 'unsubscribed', 'do_not_contact'] as const;

const CONTACT_FIELDS = [
  'display_name',
  'first_name',
  'last_name',
  'company',
  'job_title',
  'primary_email',
  'primary_phone',
  'primary_linkedin_url',
  'linkedin_bio',
  'home_page_text',
  'company_website',
  'city',
  'state',
  'country',
  'pipeline_id',
  'stage_id',
  'tags',
  'source',
  'custom_fields',
  'owner_user_id',
] as const;

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 1000;

/** Keep only known contact fields; coerce `tags` and `custom_fields`, drop blanks. */
function normalizeContact(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of CONTACT_FIELDS) {
    const val = raw[field];
    if (val === undefined || val === null || val === '') continue;

    if (field === 'tags') {
      const tags = Array.isArray(val) ? val.map(String) : parseListSemicolon(String(val));
      if (tags.length > 0) out.tags = tags;
      continue;
    }
    if (field === 'custom_fields') {
      if (typeof val === 'object') {
        out.custom_fields = val;
      } else if (typeof val === 'string') {
        try {
          out.custom_fields = JSON.parse(val);
        } catch {
          fail(`custom_fields is not valid JSON: ${val}`);
        }
      }
      continue;
    }
    out[field] = typeof val === 'string' ? val.trim() : val;
  }
  return out;
}

/** Tags in a single CSV cell are separated by ';' (commas delimit CSV columns). */
function parseListSemicolon(value: string): string[] {
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseContactsInput(text: string, format: 'csv' | 'json'): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (format === 'json') {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr as Record<string, unknown>[];
  }
  return parseCsv(trimmed);
}

function inferFormat(explicit: string | undefined, filePath: string | undefined, text: string): 'csv' | 'json' {
  if (explicit === 'csv' || explicit === 'json') return explicit;
  if (explicit) fail(`--format must be 'csv' or 'json'`);
  if (filePath) {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.json') return 'json';
    if (ext === '.csv' || ext === '.tsv') return 'csv';
  }
  const t = text.trim();
  return t.startsWith('[') || t.startsWith('{') ? 'json' : 'csv';
}

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

  contact
    .command('bulk-create')
    .description('Create many contacts from a CSV/JSON file or piped stdin')
    .option('-f, --file <path>', 'Path to a .csv or .json file of contacts')
    .option('--format <fmt>', "Force input format: 'csv' or 'json' (else inferred)")
    .option('--source <source>', 'Default source for contacts that omit one')
    .option('--no-dedupe', 'Insert even if a contact with the same email exists')
    .option('--no-activity', "Skip the per-contact 'contact_created' activity log")
    .option('--batch-size <n>', `Contacts per request (max ${MAX_BATCH_SIZE})`, String(DEFAULT_BATCH_SIZE))
    .option('--dry-run', 'Parse and validate only — do not create anything')
    .option('--json', 'Emit JSON')
    .action(
      async (opts: {
        file?: string;
        format?: string;
        source?: string;
        dedupe?: boolean; // commander sets false when --no-dedupe is passed
        activity?: boolean;
        batchSize?: string;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        // 1. Read input from --file or piped stdin.
        let text: string | null = null;
        if (opts.file) {
          try {
            text = readFileSync(opts.file, 'utf8');
          } catch (err) {
            fail(`Could not read file ${opts.file}: ${(err as Error).message}`);
          }
        } else {
          text = await readStdinIfPiped();
        }
        if (!text || !text.trim()) {
          fail('No input. Pass --file <path> or pipe CSV/JSON via stdin.');
        }

        // 2. Parse + normalize.
        const format = inferFormat(opts.format, opts.file, text);
        let rawRecords: Record<string, unknown>[];
        try {
          rawRecords = parseContactsInput(text, format);
        } catch (err) {
          fail(`Failed to parse ${format.toUpperCase()} input: ${(err as Error).message}`);
        }
        const contacts = rawRecords.map(normalizeContact).filter((c) => Object.keys(c).length > 0);
        if (contacts.length === 0) {
          fail('No contacts found in input.');
        }

        const batchSize = Math.min(
          Math.max(1, parseInt(opts.batchSize ?? String(DEFAULT_BATCH_SIZE), 10) || DEFAULT_BATCH_SIZE),
          MAX_BATCH_SIZE,
        );

        if (opts.dryRun) {
          output(
            { parsed: contacts.length, format, batch_size: batchSize, sample: contacts[0] },
            { json: opts.json },
          );
          return;
        }

        // 3. Send in batches, aggregating results.
        const totals = { created: 0, skipped: 0, total_submitted: 0 };
        const contactIds: string[] = [];
        const batches = Math.ceil(contacts.length / batchSize);
        for (let i = 0; i < contacts.length; i += batchSize) {
          const chunk = contacts.slice(i, i + batchSize);
          const batchNo = Math.floor(i / batchSize) + 1;
          if (!opts.json && batches > 1) {
            process.stderr.write(`Batch ${batchNo}/${batches} (${chunk.length} contacts)...\n`);
          }
          const res = await invokeFn<{
            created: number;
            skipped: number;
            total_submitted: number;
            contact_ids?: string[];
          }>('bulk-create-contacts', {
            contacts: chunk,
            dedupe_on_email: opts.dedupe !== false,
            log_activity: opts.activity !== false,
            source: opts.source,
          });
          totals.created += res.created ?? 0;
          totals.skipped += res.skipped ?? 0;
          totals.total_submitted += res.total_submitted ?? chunk.length;
          if (Array.isArray(res.contact_ids)) contactIds.push(...res.contact_ids);
        }

        output(
          opts.json ? { ...totals, contact_ids: contactIds } : totals,
          { json: opts.json },
        );
      },
    );
}
