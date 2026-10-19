import type { Command } from 'commander';
import { invokeFn, restGet } from '../api.js';
import { readConfig } from '../config.js';
import { output, fail } from '../output.js';
import { parseList, readStdinIfPiped } from '../util.js';

interface EnrollOptions {
  campaign: string;
  list?: string;
  contacts?: string;
  organization?: string;
  wait: boolean;
  json?: boolean;
}

/**
 * Contacts above this count enroll as a server-side background job (same
 * threshold as the app). Lists always do: a whole list in one request dies
 * past ~50k members, and the job keeps going if the terminal closes.
 */
const BACKGROUND_THRESHOLD = 2500;
const POLL_MS = 3000;

interface BackgroundStart {
  background?: boolean;
  jobId?: string;
  status?: string;
  existing?: boolean;
}

interface EnrollmentJob {
  id: string;
  status: 'pending' | 'snapshotting' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  results: Record<string, number>;
  error_message: string | null;
  completed_at: string | null;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJob(jobId: string): Promise<EnrollmentJob> {
  const rows = await restGet<EnrollmentJob[]>(
    `email_enrollment_jobs?id=eq.${jobId}&select=id,status,total,processed,results,error_message,completed_at`,
  );
  if (!rows[0]) throw new Error(`Enrollment job ${jobId} not found`);
  return rows[0];
}

function summarize(job: EnrollmentJob) {
  const r = job.results ?? {};
  return {
    job_id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    enrolled: r.enrolled ?? 0,
    skipped_already_enrolled: Math.max(0, (r.skipped ?? 0) - (r.filteredOut ?? 0) - (r.awaitingPipeline ?? 0)),
    skipped_active_elsewhere: r.alreadyInAnotherSequence ?? 0,
    skipped_suppressed: r.suppressed ?? 0,
    skipped_no_email: r.noEmail ?? 0,
    skipped_filtered_out: r.filteredOut ?? 0,
    skipped_awaiting_pipeline: r.awaitingPipeline ?? 0,
    skipped_missing_content: r.missingContent ?? 0,
    ...(job.error_message ? { error: job.error_message } : {}),
  };
}

export function registerEnroll(program: Command): void {
  program
    .command('enroll')
    .description('Enroll leads into a campaign sequence')
    .requiredOption('-c, --campaign <sequenceId>', 'Campaign / sequence ID')
    .option('-l, --list <listIds>', 'Enroll one or more lead lists (comma-separated)')
    .option('--contacts <ids>', 'Comma-separated contact IDs (or pipe ids on stdin)')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--no-wait', 'Start a background enrollment and return its job id without waiting')
    .option('--json', 'Emit JSON')
    .action(async (opts: EnrollOptions) => {
      const orgId = opts.organization || readConfig().active_org_id;
      if (!orgId) {
        fail('No active organization. Run `aca org switch <id>` or pass --organization.');
      }

      const listIds = parseList(opts.list);
      let contactIds = parseList(opts.contacts);
      if (!listIds.length && !contactIds.length) {
        const piped = await readStdinIfPiped();
        if (piped) contactIds = piped.split(/[\s,]+/).filter(Boolean);
      }
      if (!listIds.length && !contactIds.length) {
        fail('Provide either --list <id> or --contacts <id1,id2,...> (or pipe contact ids on stdin)');
      }

      const body: Record<string, unknown> = {
        sequenceId: opts.campaign,
        organizationId: orgId,
        ...(listIds.length ? { listIds } : { contactIds }),
      };

      // Small hand-picked batches stay synchronous: the counts come straight back.
      if (!listIds.length && contactIds.length <= BACKGROUND_THRESHOLD) {
        output(await invokeFn('enroll-leads', body), { json: opts.json });
        return;
      }

      const started = await invokeFn<BackgroundStart>('enroll-leads', { ...body, background: true });
      // An older deployment ignores `background` and answers with the counts.
      if (!started.jobId) {
        output(started, { json: opts.json });
        return;
      }
      if (started.existing && !opts.json) {
        process.stderr.write(`An enrollment is already running for this sequence; following job ${started.jobId}\n`);
      }

      if (!opts.wait) {
        output(
          { job_id: started.jobId, status: started.status, already_running: started.existing === true },
          { json: opts.json },
        );
        return;
      }

      if (!opts.json) {
        process.stderr.write(`Enrolling in the background (job ${started.jobId}). Ctrl-C stops watching, not the job.\n`);
      }
      let lastLine = '';
      for (;;) {
        const job = await readJob(started.jobId);
        if (TERMINAL.has(job.status)) {
          output(summarize(job), { json: opts.json });
          if (job.status === 'failed') process.exitCode = 1;
          return;
        }
        if (!opts.json) {
          const line = job.status === 'running'
            ? `  …${job.processed}/${job.total} checked, ${job.results?.enrolled ?? 0} enrolled`
            : `  …preparing audience (${job.total} contacts so far)`;
          if (line !== lastLine) process.stderr.write(`${line}\n`);
          lastLine = line;
        }
        await sleep(POLL_MS);
      }
    });
}
