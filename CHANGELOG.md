# Changelog

All notable changes to `aca-cli` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.5.0] - 2026-08-07

### Added
- **`aca sequence duplicate <id>`**: copy an email sequence — steps, settings, mailbox pool, tracking domain and enrollment filter — optionally with its audience. `--with-lists` attaches the same lead lists (and their auto-enroll setup); `--with-leads` re-enrols the leads currently in the source. `--name` overrides the default `"<source> (copy)"`.
  - The copy is always created as a **draft**, so duplicating never starts sending.
  - `--with-leads` runs the full enrollment path, so unsubscribed/bounced leads and leads already active in another sequence are skipped — the command reports each bucket. It pages the source (1000 leads per request) and prints progress; ~15s per page, so a 13k-lead sequence takes a few minutes. Every page is durable, so interrupting it leaves correct data behind.
- Backed by a new `duplicate-email-sequence` edge function and a `sourceSequenceId` mode on `enroll-leads`, both shared with the app UI and the `duplicate_email_sequence` MCP tool.

### Note
There is intentionally no `aca sequence ls` — listing goes through PostgREST, which only accepts JWTs, not the `aca_` API tokens this CLI recommends.

## [0.4.0] - 2026-07-18

### Added
- **`aca contact bulk-create`**: create many CRM contacts from a CSV/JSON file (`--file`) or piped stdin. Splits large inputs into batched requests (`--batch-size`, max 1000), dedups on email by default (`--no-dedupe` to override), supports `--source`, `--no-activity`, and `--dry-run`. CSV tags go in one cell separated by `;`.
- Backed by a new `bulk-create-contacts` edge function (also usable directly as a REST API) and a matching `bulk_create_contacts` MCP tool — all three share one core so behavior is identical across surfaces.

### Changed
- Reconciled the version number: the built binary reported `0.3.0` while `package.json` was `0.2.0`. Both are now `0.4.0`.

## [0.2.0] - 2026-05-26

### Added
- **API token authentication**: `aca login --token <value>` (or `$ACA_TOKEN`). Works for any user, including Google sign-in. Generate a token at app.aca.io → Settings → CLI Tokens.
- `aca whoami` now reports the active auth method (`api_token` vs legacy `jwt`).

### Changed
- Backend: 4 critical edge functions (`enroll-leads`, `bulk-add-to-list`, `crm-send-message`, `inbox-autopilot-trigger`) now accept both Supabase JWTs and CLI tokens via a unified `_shared/cli-auth.ts` helper.
- `enroll-leads` previously trusted the caller's `organizationId` from the request body. It now requires authentication and rejects cross-org enrollment.
- Sessions for v0.1.x users are auto-detected as `jwt`; legacy email/password login still works for backwards compatibility.

### Security
- Closed an authentication gap in `enroll-leads`: the function previously accepted unauthenticated calls and any `organizationId` from the request body.

## [0.1.0] - 2026-05-25

Initial release.

### Added
- `aca login` / `logout` / `whoami` — email + password authentication, cached at `~/.aca/session.json` with auto-refresh
- `aca org ls` / `org switch` / `org current` — multi-organization support
- `aca enroll` — bulk enroll contacts or an entire list into a campaign sequence
- `aca lists` — create, list, add, remove, list members
- `aca leads search` / `leads get` — search across name, email, company; filter by tag, status, presence of email/LinkedIn
- `aca inbox unread` / `inbox show` / `inbox list` — triage CRM conversations across all channels
- `aca reply` — send a reply to an existing conversation (email, LinkedIn, Instagram, WhatsApp, etc.)
- `aca campaign ls` / `campaign status` / `campaign leads` — campaign monitoring, including stuck-lead detection
- `aca contact get` / `contact tag` / `contact set-status` — single-contact ops
- `aca autopilot ls` / `trigger` / `pause` / `resume` — AI autopilot controls
- `aca config show` / `set` / `unset` — local CLI configuration
- `aca completion <shell>` — bash, zsh, and fish completion scripts
- Daily background update check (disable with `aca config set update_check_enabled false`)
- `--json` flag on all commands for pipeable output
