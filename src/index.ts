#!/usr/bin/env node
import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerOrg } from './commands/org.js';
import { registerEnroll } from './commands/enroll.js';
import { registerLists } from './commands/lists.js';
import { registerLeads } from './commands/leads.js';
import { registerInbox } from './commands/inbox.js';
import { registerReply } from './commands/reply.js';
import { registerCampaign } from './commands/campaign.js';
import { registerContact } from './commands/contact.js';
import { registerAutopilot } from './commands/autopilot.js';
import { registerConfig } from './commands/config.js';
import { registerCompletion } from './commands/completion.js';
import { maybeCheckForUpdate } from './update-check.js';

const VERSION = '0.2.0';

const program = new Command();
program
  .name('aca')
  .description('Command-line interface for ACA — outreach, inbox, campaigns from your terminal.')
  .version(VERSION);

registerAuth(program);
registerOrg(program);
registerEnroll(program);
registerLists(program);
registerLeads(program);
registerInbox(program);
registerReply(program);
registerCampaign(program);
registerContact(program);
registerAutopilot(program);
registerConfig(program);
registerCompletion(program);

async function main(): Promise<void> {
  // Fire-and-forget update check (best-effort, ≤1.5s timeout).
  void maybeCheckForUpdate(VERSION);

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const e = err as { message?: string; stack?: string } | undefined;
    process.stderr.write(`error: ${e?.message ?? String(err)}\n`);
    process.exit(1);
  }
}

void main();
