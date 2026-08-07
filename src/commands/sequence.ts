import type { Command } from 'commander';
import { invokeFn } from '../api.js';
import { output } from '../output.js';

interface DuplicateResult {
  sequence: { id: string; name: string; status: string };
}

interface EnrollResult {
  enrolled?: number;
  suppressed?: number;
  alreadyInAnotherSequence?: number;
  noEmail?: number;
  leadsWithoutContact?: number;
  sourceCursor?: { offset: number; done: boolean };
}

export function registerSequence(program: Command): void {
  // Deliberately no `sequence ls`: listing would go through PostgREST, which
  // rejects the `aca_` API tokens the CLI recommends (JWT only). Duplication
  // runs through edge functions, so it works for both auth methods.
  const sequence = program.command('sequence').description('Duplicate email sequences');

  sequence
    .command('duplicate')
    .description('Copy a sequence — steps and settings, optionally its audience')
    .argument('<sequenceId>')
    .option('-n, --name <name>', 'Name for the copy (default: "<source> (copy)")')
    .option('--with-lists', 'Attach the same lead lists (carries auto-enroll + enrollment filter)')
    .option('--with-leads', 'Enroll the leads currently in the source sequence')
    .option('--json', 'Emit JSON')
    .action(
      async (
        sequenceId: string,
        opts: { name?: string; withLists?: boolean; withLeads?: boolean; json?: boolean },
      ) => {
        const dup = await invokeFn<DuplicateResult>('duplicate-email-sequence', {
          sequenceId,
          name: opts.name,
          copyLeadLists: opts.withLists === true,
        });

        // The audience is a second call by design, and a paged one:
        // enroll-leads works a bounded slice per request (the platform kills a
        // request at 150s), so loop until the source is exhausted. Every page
        // is durable on its own, so a Ctrl-C leaves correct data behind.
        interface EnrollTotals {
          enrolled: number;
          suppressed: number;
          alreadyInAnotherSequence: number;
          noEmail: number;
          leadsWithoutContact: number;
        }
        let totals: EnrollTotals | null = null;
        if (opts.withLeads) {
          const running: EnrollTotals = {
            enrolled: 0,
            suppressed: 0,
            alreadyInAnotherSequence: 0,
            noEmail: 0,
            leadsWithoutContact: 0,
          };
          totals = running;
          let offset = 0;
          for (;;) {
            const page = await invokeFn<EnrollResult>('enroll-leads', {
              sequenceId: dup.sequence.id,
              sourceSequenceId: sequenceId,
              sourceOffset: offset,
            });
            running.enrolled += page.enrolled ?? 0;
            running.suppressed += page.suppressed ?? 0;
            running.alreadyInAnotherSequence += page.alreadyInAnotherSequence ?? 0;
            running.noEmail += page.noEmail ?? 0;
            running.leadsWithoutContact += page.leadsWithoutContact ?? 0;

            if (!page.sourceCursor || page.sourceCursor.done) break;
            offset = page.sourceCursor.offset;
            if (!opts.json) {
              process.stderr.write(`  …${offset} leads scanned, ${running.enrolled} enrolled\n`);
            }
          }
        }

        const result = {
          id: dup.sequence.id,
          name: dup.sequence.name,
          status: dup.sequence.status,
          ...(totals
            ? {
                enrolled: totals.enrolled,
                skipped_suppressed: totals.suppressed,
                skipped_active_elsewhere: totals.alreadyInAnotherSequence,
                skipped_no_email: totals.noEmail,
                skipped_no_crm_contact: totals.leadsWithoutContact,
              }
            : {}),
        };

        output(result, { json: opts.json });
      },
    );
}
