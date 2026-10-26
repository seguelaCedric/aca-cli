#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerOrg } from './commands/org.js';
import { registerEnroll } from './commands/enroll.js';
import { registerLists } from './commands/lists.js';
import { registerLeads } from './commands/leads.js';
import { registerInbox } from './commands/inbox.js';
import { registerReply } from './commands/reply.js';
import { registerCampaign } from './commands/campaign.js';
import { registerSequence } from './commands/sequence.js';
import { registerContact } from './commands/contact.js';
import { registerSignals } from './commands/signals.js';
import { registerAutopilot } from './commands/autopilot.js';
import { registerMessaging } from './commands/messaging.js';
import { registerConfig } from './commands/config.js';
import { registerCompletion } from './commands/completion.js';
import { maybeCheckForUpdate } from './update-check.js';

// Read from package.json rather than hardcoding — a hardcoded copy has
// drifted from the real version at least once before (see CHANGELOG 0.4.0).
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
const VERSION = pkg.version;

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
registerSequence(program);
registerContact(program);
registerSignals(program);
registerAutopilot(program);
registerMessaging(program);
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
