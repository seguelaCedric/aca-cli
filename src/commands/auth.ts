import type { Command } from 'commander';
import { login, clearSession, readSession } from '../session.js';
import { output, fail } from '../output.js';
import { silentPrompt, visiblePrompt } from '../prompt.js';

interface LoginOptions {
  email?: string;
  password?: string;
}

export function registerAuth(program: Command): void {
  program
    .command('login')
    .description('Authenticate and cache a session at ~/.aca/session.json')
    .option('-e, --email <email>', 'Email (defaults to $ACA_EMAIL or prompt)')
    .option('-p, --password <password>', 'Password (defaults to $ACA_PASSWORD or prompt)')
    .action(async (opts: LoginOptions) => {
      const email = opts.email || process.env.ACA_EMAIL || (await visiblePrompt('Email: '));
      const password = opts.password || process.env.ACA_PASSWORD || (await silentPrompt('Password: '));
      if (!email || !password) fail('email and password required');
      const session = await login(email, password);
      output({
        logged_in_as: session.email,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
      });
    });

  program
    .command('logout')
    .description('Clear the cached session')
    .action(() => {
      clearSession();
      output({ logged_out: true });
    });

  program
    .command('whoami')
    .description('Show the cached session user')
    .action(() => {
      const s = readSession();
      if (!s?.email) fail('Not logged in. Run `aca login`.');
      output({
        email: s.email,
        user_id: s.user_id,
        expires_at: new Date(s.expires_at * 1000).toISOString(),
      });
    });
}
