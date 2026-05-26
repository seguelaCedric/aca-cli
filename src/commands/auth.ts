import type { Command } from 'commander';
import {
  loginWithToken,
  loginWithPassword,
  clearSession,
  readSession,
} from '../session.js';
import { output, fail } from '../output.js';
import { silentPrompt, visiblePrompt } from '../prompt.js';

interface LoginOptions {
  token?: string;
  email?: string;
  password?: string;
}

export function registerAuth(program: Command): void {
  program
    .command('login')
    .description('Authenticate the CLI. Use --token (recommended) or email/password.')
    .option(
      '-t, --token <token>',
      'API token from app.aca.io → Settings → CLI Tokens (or $ACA_TOKEN). Works for all auth methods including Google sign-in.',
    )
    .option(
      '-e, --email <email>',
      'Email (legacy password login; falls back to $ACA_EMAIL or prompt)',
    )
    .option(
      '-p, --password <password>',
      'Password (legacy; falls back to $ACA_PASSWORD or prompt)',
    )
    .action(async (opts: LoginOptions) => {
      const tokenInput = opts.token || process.env.ACA_TOKEN;

      // Prefer token auth when available.
      if (tokenInput) {
        const session = loginWithToken(tokenInput.trim());
        output({
          method: 'api_token',
          token_prefix: session.access_token.slice(0, 12) + '…',
          hint: 'Run `aca whoami` to verify, or `aca --help` to see commands.',
        });
        return;
      }

      // Fall back to email/password.
      const email = opts.email || process.env.ACA_EMAIL || (await visiblePrompt('Email: '));
      const password = opts.password || process.env.ACA_PASSWORD || (await silentPrompt('Password: '));
      if (!email || !password) fail('email and password required (or use --token)');
      const session = await loginWithPassword(email, password);
      output({
        method: 'jwt',
        logged_in_as: session.email,
        expires_at: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        hint:
          'Heads-up: token-based login (`aca login --token <value>`) is recommended. ' +
          'Generate one at app.aca.io → Settings → CLI Tokens.',
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
    .description('Show how the CLI is authenticated')
    .action(() => {
      const s = readSession();
      if (!s?.access_token) fail('Not logged in. Run `aca login --token <value>`.');
      if (s.auth_method === 'api_token') {
        output({
          method: 'api_token',
          token_prefix: s.access_token.slice(0, 12) + '…',
        });
      } else {
        output({
          method: 'jwt',
          email: s.email,
          user_id: s.user_id,
          expires_at: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : null,
        });
      }
    });
}
