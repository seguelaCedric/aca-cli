import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { fnRequest } from '../api.js';
import { output, fail } from '../output.js';
import { parseList, readStdinIfPiped } from '../util.js';

// The Social Scheduler, through the api-scheduler edge function (same operations as
// /v1/scheduler and the MCP tools).
const FN = 'api-scheduler';

interface Stats {
  status: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number | null;
}
interface Destination { id: string; account_id: string; platform: string; status: string; error: string | null }
interface Post {
  id: string;
  status: string;
  origin: string;
  caption: string;
  scheduled_for: string;
  published_at: string | null;
  destinations: Destination[];
  stats: Stats | null;
  error: string | null;
}

const collect = (value: string, previous: string[] = []) => [...previous, value];

/** A compact row for the table view. */
function row(p: Post): Record<string, unknown> {
  const s = p.stats;
  return {
    id: p.id,
    when: (p.published_at ?? p.scheduled_for).slice(0, 16).replace('T', ' '),
    status: p.status,
    platforms: [...new Set(p.destinations.map((d) => d.platform))].join(','),
    caption: p.caption.replace(/\s+/g, ' ').slice(0, 48),
    stats: s && (s.status === 'synced' || s.status === 'pending') && (s.likes + s.comments + s.reach + s.views) > 0
      ? `${s.likes} likes · ${s.comments} comments · ${s.reach || s.views} reach`
      : s?.status === 'no_access' ? 'no analytics on Zernio plan' : '',
    error: p.error ? p.error.slice(0, 60) : '',
  };
}

/** Caption from --caption, --caption-file, or piped stdin. */
async function readCaption(opts: { caption?: string; captionFile?: string }): Promise<string | undefined> {
  if (opts.caption !== undefined) return opts.caption;
  if (opts.captionFile) return readFileSync(opts.captionFile, 'utf8');
  const piped = await readStdinIfPiped();
  return piped ?? undefined;
}

/** --for linkedin="…" (repeatable) → { linkedin: "…" } */
function readCaptionsFor(values: string[] | undefined): Record<string, string> | undefined {
  if (!values?.length) return undefined;
  const out: Record<string, string> = {};
  for (const v of values) {
    const i = v.indexOf('=');
    if (i < 1) fail(`--for needs platform=text, got "${v}"`);
    out[v.slice(0, i).trim().toLowerCase()] = v.slice(i + 1);
  }
  return out;
}

interface PostOpts {
  accounts?: string;
  caption?: string;
  captionFile?: string;
  for?: string[];
  image?: string[];
  video?: string;
  firstComment?: string;
  story?: boolean;
  feed?: boolean;
  at?: string;
  now?: boolean;
  draft?: boolean;
  scheduled?: boolean;
  title?: string;
  json?: boolean;
}

async function postBody(opts: PostOpts, creating: boolean): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (opts.accounts !== undefined) body.accounts = parseList(opts.accounts);
  else if (creating) fail('--accounts is required (ids from `aca scheduler accounts`)');
  const caption = await readCaption(opts);
  if (caption !== undefined) body.caption = caption;
  const captions = readCaptionsFor(opts.for);
  if (captions) body.captions = captions;
  if (opts.image?.length) body.images = opts.image;
  if (opts.video) body.video = opts.video;
  if (opts.firstComment !== undefined) body.first_comment = opts.firstComment;
  if (opts.story) body.format = 'story';
  if (opts.feed) body.format = 'feed';
  if (opts.now) body.publish_now = true;
  else if (opts.at) {
    const at = new Date(opts.at);
    if (!Number.isFinite(at.getTime())) fail(`--at is not a date: ${opts.at}`);
    body.scheduled_for = at.toISOString();
  }
  if (opts.draft) body.status = 'draft';
  if (opts.scheduled) body.status = 'scheduled';
  if (opts.title) body.title = opts.title;
  return body;
}

function postOptions(cmd: Command): Command {
  return cmd
    .option('--accounts <ids>', 'Comma-separated account ids (from `aca scheduler accounts`)')
    .option('--caption <text>', 'Caption for every platform (or --caption-file, or pipe it in)')
    .option('--caption-file <path>', 'Read the caption from a file')
    .option('--for <platform=text>', 'Caption for one platform, e.g. --for twitter="short version" (repeatable)', collect)
    .option('--image <url>', 'Picture URL, https (repeatable, in order)', collect)
    .option('--video <url>', 'One video URL, https')
    .option('--first-comment <text>', 'Posted as the first comment (LinkedIn, Facebook, Instagram)')
    .option('--story', 'Post Instagram/Facebook as a Story')
    .option('--feed', 'Post to the feed (default)')
    .option('--at <datetime>', 'When, e.g. 2026-11-10T09:00+01:00')
    .option('--now', 'Publish at the next queue run (within 5 minutes)')
    .option('--draft', 'Save as a draft to review instead of scheduling')
    .option('--scheduled', 'Schedule a draft')
    .option('--title <text>', 'Internal label')
    .option('--json', 'Emit JSON');
}

function printPost(result: { post?: Post; notes?: string[]; issues?: Array<{ message: string }> } | Post, json?: boolean): void {
  if (json) return output(result, { json: true });
  const post = 'post' in result && result.post ? result.post : (result as Post);
  output(row(post));
  for (const d of post.destinations) console.log(`  → ${d.platform.padEnd(10)} ${d.status.padEnd(10)} ${d.account_id}${d.error ? `  (${d.error})` : ''}`);
  const extra = result as { notes?: string[]; issues?: Array<{ message: string }> };
  for (const n of extra.notes ?? []) console.log(`note: ${n}`);
  for (const i of extra.issues ?? []) console.log(`fix before scheduling: ${i.message}`);
}

export function registerScheduler(program: Command): void {
  const scheduler = program
    .command('scheduler')
    .alias('posts')
    .description('Social Scheduler: schedule, approve and track posts on every channel');

  scheduler
    .command('accounts')
    .description('Accounts you can post to (Zernio, native LinkedIn, GHL, X)')
    .option('--json', 'Emit JSON')
    .action(async (opts: { json?: boolean }) => {
      const data = await fnRequest<{ accounts: Array<Record<string, unknown>>; notes: string[] }>('GET', FN, { resource: 'accounts' });
      if (opts.json) return output(data, { json: true });
      // Full ids (the table view would cut them, and they are what create/edit take).
      const w = Math.max(2, ...data.accounts.map((a) => String(a.id).length));
      console.log(`${'id'.padEnd(w)}  ${'platform'.padEnd(10)}  ${'provider'.padEnd(15)}  name`);
      for (const a of data.accounts) {
        const handle = a.username ? ` (@${String(a.username).replace(/^@/, '')})` : '';
        console.log(`${String(a.id).padEnd(w)}  ${String(a.platform).padEnd(10)}  ${String(a.provider).padEnd(15)}  ${a.name}${handle}`);
      }
      for (const n of data.notes) console.log(`note: ${n}`);
    });

  scheduler
    .command('ls')
    .description('Posts on the calendar (default: last 7 days and next 30)')
    .option('--from <datetime>', 'Window start')
    .option('--to <datetime>', 'Window end (at most 120 days after --from)')
    .option('--status <list>', 'draft,scheduled,publishing,published,failed')
    .option('--platform <name>', 'instagram, linkedin, facebook, tiktok, twitter…')
    .option('--limit <n>', 'Max posts (max 200)', '50')
    .option('--json', 'Emit JSON')
    .action(async (opts: { from?: string; to?: string; status?: string; platform?: string; limit: string; json?: boolean }) => {
      const data = await fnRequest<{ posts: Post[]; total: number; truncated: boolean }>('GET', FN, {
        resource: 'posts',
        from: opts.from ? new Date(opts.from).toISOString() : undefined,
        to: opts.to ? new Date(opts.to).toISOString() : undefined,
        status: opts.status,
        platform: opts.platform,
        limit: opts.limit,
      });
      if (opts.json) return output(data, { json: true });
      output(data.posts.map(row));
      if (data.truncated) console.log(`(${data.posts.length} of ${data.total}; raise --limit or narrow the window)`);
    });

  scheduler
    .command('show')
    .description('One post: captions, media, destinations, errors, stats')
    .argument('<id>')
    .option('--history', 'Include the stats history')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { history?: boolean; json?: boolean }) => {
      const post = await fnRequest<Post>('GET', FN, { resource: 'posts', id, history: opts.history ? 'true' : undefined });
      if (opts.json) return output(post, { json: true });
      printPost(post);
      console.log('');
      console.log(post.caption);
    });

  postOptions(scheduler.command('create').description('Schedule a post (or --draft to review first)'))
    .action(async (opts: PostOpts) => {
      const result = await fnRequest<{ post: Post; notes: string[]; issues: Array<{ message: string }> }>('POST', FN, { resource: 'posts' }, await postBody(opts, true));
      printPost(result, opts.json);
    });

  postOptions(scheduler.command('edit').description('Edit or reschedule a post until it goes out').argument('<id>'))
    .action(async (id: string, opts: PostOpts) => {
      const body = await postBody(opts, false);
      if (!Object.keys(body).length) fail('Nothing to change: give --at, --caption, --image, --accounts…');
      const result = await fnRequest<{ post: Post; notes: string[] }>('PATCH', FN, { resource: 'posts', id }, body);
      printPost(result, opts.json);
    });

  scheduler
    .command('rm')
    .description('Remove a post that has not gone out')
    .argument('<id>')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      output(await fnRequest('DELETE', FN, { resource: 'posts', id }), { json: opts.json });
    });

  scheduler
    .command('approve')
    .description('Approve drafts and agent proposals so they go out')
    .argument('<ids...>')
    .option('--json', 'Emit JSON')
    .action(async (ids: string[], opts: { json?: boolean }) => {
      const data = await fnRequest<{ approved: string[]; blocked: Array<{ id: string; reason: string }> }>('POST', FN, { resource: 'posts', action: 'approve' }, { ids: ids.flatMap((i) => parseList(i)) });
      if (opts.json) return output(data, { json: true });
      console.log(`approved: ${data.approved.length}`);
      for (const b of data.blocked) console.log(`blocked ${b.id}: ${b.reason}`);
    });

  scheduler
    .command('publish')
    .description('Publish now (next queue run, within 5 minutes)')
    .argument('<id>')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      const data = await fnRequest<{ post: Post; note: string }>('POST', FN, { resource: 'posts', id, action: 'publish' });
      printPost(data, opts.json);
      if (!opts.json) console.log(data.note);
    });

  scheduler
    .command('retry')
    .description("Put a post's failed destinations back in the queue")
    .argument('<id>')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      printPost(await fnRequest<{ post: Post }>('POST', FN, { resource: 'posts', id, action: 'retry' }), opts.json);
    });

  scheduler
    .command('stats')
    .description('How a published post did: reach, likes, comments, engagement')
    .argument('<id>')
    .option('--refresh', 'Read the latest numbers from the platform first')
    .option('--json', 'Emit JSON')
    .action(async (id: string, opts: { refresh?: boolean; json?: boolean }) => {
      const data = await fnRequest<{ stats: Record<string, unknown> | null; destinations?: Array<Record<string, unknown>>; note?: string }>(
        'GET', FN, { resource: 'stats', id, refresh: opts.refresh ? 'true' : undefined },
      );
      if (opts.json) return output(data, { json: true });
      if (!data.stats) return console.log(data.note ?? 'No stats for this post.');
      output(data.stats);
    });

  scheduler
    .command('plan')
    .description('Let the scheduling agent draft posts into the best free slots')
    .argument('<instruction>', 'e.g. "5 LinkedIn posts next week about our new feature"')
    .option('--accounts <ids>', 'Comma-separated account ids (default: all)')
    .option('--from <datetime>', 'Planning window start (default now)')
    .option('--to <datetime>', 'Planning window end (default 7 days)')
    .option('--tz <zone>', 'Timezone for slots', Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option('--json', 'Emit JSON')
    .action(async (instruction: string, opts: { accounts?: string; from?: string; to?: string; tz: string; json?: boolean }) => {
      const data = await fnRequest<{ summary: string; proposals: Post[]; next_step: string }>('POST', FN, { resource: 'plan' }, {
        instruction,
        accounts: opts.accounts ? parseList(opts.accounts) : undefined,
        range_start: opts.from ? new Date(opts.from).toISOString() : undefined,
        range_end: opts.to ? new Date(opts.to).toISOString() : undefined,
        timezone: opts.tz,
      });
      if (opts.json) return output(data, { json: true });
      console.log(data.summary);
      output(data.proposals.map(row));
      console.log(`\n${data.next_step.replace('approve_scheduled_posts (POST /v1/scheduler/posts/approve)', '`aca scheduler approve <ids>`')}`);
    });

  scheduler
    .command('connect')
    .description('Get a sign-in link to connect a social account (through Zernio)')
    .argument('<platform>', 'instagram, facebook, tiktok, youtube, google, threads, pinterest, twitter, linkedin')
    .option('--json', 'Emit JSON')
    .action(async (platform: string, opts: { json?: boolean }) => {
      const data = await fnRequest<{ connect_url: string; note: string }>('POST', FN, { resource: 'accounts', action: 'connect' }, { platform });
      if (opts.json) return output(data, { json: true });
      console.log(data.connect_url);
      console.log(data.note);
    });
}
