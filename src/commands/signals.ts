import type { Command } from 'commander';
import { invokeFn, restPost } from '../api.js';
import { output, fail } from '../output.js';

const SIGNAL_TYPES = [
  'funding', 'acquisition', 'hiring', 'hiring_demand', 'job_change',
  'executive_hire', 'customer_win', 'award', 'growth',
];

interface PersonInput {
  full_name: string;
  linkedin_url: string;
  title?: string;
  photo_url?: string;
}

// --person "Full Name | Title | https://linkedin.com/in/x | https://photo"
// full_name and linkedin_url are required; title/photo optional. Pipe-delimited
// so titles can contain commas.
function parsePerson(raw: string): PersonInput {
  const parts = raw.split('|').map((p) => p.trim());
  const [full_name, title, linkedin_url, photo_url] = parts;
  if (!full_name) fail(`--person needs a name: "${raw}"`);
  if (!linkedin_url) fail(`--person needs a linkedin url (3rd field): "${raw}"`);
  return { full_name, linkedin_url, title: title || undefined, photo_url: photo_url || undefined };
}

export function registerSignals(program: Command): void {
  const signals = program
    .command('signals')
    .description('Push and curate the public /signals buying-signals feed');

  signals
    .command('push')
    .description('Push a buying signal (with optional people) onto the public feed')
    .requiredOption('--company <name>', 'Company name')
    .requiredOption('--type <type>', `Signal type (${SIGNAL_TYPES.join(', ')})`)
    .requiredOption('--source-url <url>', 'Evidence/source URL')
    .option('--domain <domain>', 'Company domain (used for logo)')
    .option('--country <country>')
    .option('--location <location>', 'Display location, e.g. "Berlin, DE"')
    .option('--title <title>', 'Short headline for the signal')
    .option('--summary <summary>', 'One-to-two sentence summary')
    .option('--why <why>', 'Why it matters for outreach')
    .option('--amount <label>', 'Human amount, e.g. "$12M"')
    .option('--amount-usd <number>', 'Numeric amount in USD', (v) => Number(v))
    .option('--date <YYYY-MM-DD>', 'Signal date (defaults to today, UTC)')
    .option('--source-key <key>', "Machine source key, e.g. 'google_news_rss'")
    .option('--source-label <label>', "Human source label, e.g. 'Google News'")
    .option('--verified', 'Mark the signal verified')
    .option('--quality <number>', '0..1 quality/relevance score', (v) => Number(v))
    .option('--unpublished', 'Stage the row without publishing it')
    .option('--company-linkedin <url>')
    .option('--logo <url>', 'Explicit logo URL')
    .option('--dedup-key <key>', 'Override the idempotency key')
    .option(
      '--person <spec>',
      'Decision-maker "Name | Title | linkedin_url | photo_url" (repeatable)',
      (val: string, acc: PersonInput[]) => { acc.push(parsePerson(val)); return acc; },
      [] as PersonInput[],
    )
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
      const type = String(opts.type);
      if (!SIGNAL_TYPES.includes(type)) {
        fail(`--type must be one of: ${SIGNAL_TYPES.join(', ')}`);
      }
      const body = {
        company_name: opts.company,
        signal_type: type,
        source_url: opts.sourceUrl,
        domain: opts.domain,
        country: opts.country,
        location: opts.location,
        title: opts.title,
        summary: opts.summary,
        why_it_matters: opts.why,
        amount_label: opts.amount,
        amount_usd: opts.amountUsd,
        signal_date: opts.date,
        source_key: opts.sourceKey,
        source_label: opts.sourceLabel,
        verified: Boolean(opts.verified),
        quality_score: opts.quality,
        published: opts.unpublished ? false : true,
        company_linkedin_url: opts.companyLinkedin,
        logo_url: opts.logo,
        dedup_key: opts.dedupKey,
        people: (opts.person as PersonInput[]) ?? [],
      };
      const res = await invokeFn('push-public-signal', body);
      output(res, { json: Boolean(opts.json) });
    });

  signals
    .command('ls')
    .description('List public signals (includes unpublished)')
    .option('--search <text>', 'Filter by company/domain/summary')
    .option('--limit <n>', 'Max rows (default 50)', (v) => Number(v), 50)
    .option('--offset <n>', 'Offset', (v) => Number(v), 0)
    .option('--published-only', 'Hide staged/unpublished rows')
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
      const res = await restPost<{ ok: boolean; error?: string; signals?: unknown[]; total_count?: number }>(
        'rpc/admin_list_public_signals',
        {
          p_limit: opts.limit,
          p_offset: opts.offset,
          p_search: opts.search ?? null,
          p_include_unpublished: !opts.publishedOnly,
        },
      );
      if (!res.ok) fail(res.error === 'forbidden'
        ? 'Forbidden — your account is not a member of the public-signals org.'
        : `Failed: ${res.error}`);
      output(opts.json ? res : (res.signals ?? []), { json: Boolean(opts.json) });
    });

  const setPublished = (publish: boolean) => async (id: string, opts: { json?: boolean }) => {
    const res = await restPost<{ ok: boolean; error?: string }>(
      'rpc/admin_set_public_signal_published',
      { p_id: id, p_published: publish },
    );
    if (!res.ok) fail(res.error === 'not_found' ? 'Signal not found.'
      : res.error === 'forbidden' ? 'Forbidden — not a public-signals org member.'
      : `Failed: ${res.error}`);
    output(res, { json: Boolean(opts.json) });
  };

  signals
    .command('hide')
    .description('Unpublish a signal (hide it from the public feed)')
    .argument('<signalId>')
    .option('--json', 'Emit JSON')
    .action(setPublished(false));

  signals
    .command('publish')
    .description('Publish a previously-hidden signal')
    .argument('<signalId>')
    .option('--json', 'Emit JSON')
    .action(setPublished(true));
}
