# Changelog

All notable changes to `aca-cli` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.7.0] - 2026-10-19

### Changed
- **`aca enroll -l` runs as a server-side background job.** Sending a whole list in one request died past ~50k members (the platform kills a request at 150s). The CLI now starts an enrollment job and follows it, printing progress (a 193k list takes about 4 minutes). Ctrl-C stops watching, not the job. The final output adds a breakdown of skips: already enrolled, active in another sequence, suppressed, no email.
- `--contacts` with more than 2,500 ids uses the same background job. Smaller batches still enroll synchronously and return counts straight away.

### Added
- `-l` takes several comma-separated lists (enrolls their union).
- `--no-wait` starts the job and prints its id without following it.
- Contact ids can be piped on stdin (comma- or whitespace-separated) when neither `-l` nor `--contacts` is given.

## [0.6.2] - 2026-09-09

### Added
- `linkedin_bio` and `home_page_text` are now standard contact fields (promoted from an org-scoped custom field / newly added, respectively — same underlying `crm_contacts` columns the app and MCP use). `aca contact bulk-create` accepts both; `aca contact get` already returns them since it reads the full `/v1/contacts/{id}` shape.

## [0.6.1] - 2026-09-02

### Fixed
- `aca --version` reported `0.5.0` on the 0.6.0 build — a `VERSION` constant hardcoded in `index.ts` had drifted from `package.json` (the same class of bug called out in 0.4.0's changelog). Now read from `package.json` at runtime so the two can't diverge again.

## [0.6.0] - 2026-09-02

### Fixed
- **API token auth was broken for every command that reads via PostgREST** (`org ls/switch/current`, `inbox`, `contact get`, `campaign`, `autopilot`, `leads`, `lists`, `signals`, `reply` lookups): `aca login --token` sent the raw `aca_` token straight to `/rest/v1/*`, which PostgREST rejects outright (`Expected 3 parts in JWT; got 1`) since it isn't a signed JWT — this affected every Google sign-in user, i.e. the CLI's own recommended login path.
  - `getAccessToken()` now exchanges the `aca_` token for a short-lived real Supabase session via a new `cli-token-exchange` edge function, and caches it until it's near expiry. Everything downstream (PostgREST and edge-function calls alike) now gets a token it actually accepts.
  - The 0.5.0 note that `aca sequence ls` couldn't exist because "listing goes through PostgREST, which only accepts JWTs" no longer applies — that limitation is what this fixes.

## [0.5.0] - 2026-08-07

### Added
- **`aca sequence duplicate <id>`**: copy an email sequence — steps, settings, mailbox pool, tracking domain and enrollment filter — optionally with its audience. `--with-lists` attaches the same lead lists (and their auto-enroll setup); `--with-leads` re-enrols the leads currently in the source. `--name` overrides the default `"<source> (copy)"`.
  - The copy is always created as a **draft**, so duplicating never starts sending.
  - `--with-leads` runs the full enrollment path, so unsubscribed/bounced leads and leads already active in another sequence are skipped — the command reports each bucket. It pages the source (1000 leads per request) and prints progress; ~15s per page, so a 13k-lead sequence takes a few minutes. Every page is durable, so interrupting it leaves correct data behind.
- Backed by a new `duplicate-email-sequence` edge function and a `sourceSequenceId` mode on `enroll-leads`, both shared with the app UI and the `duplicate_email_sequence` MCP tool.

### Note
There was intentionally no `aca sequence ls` — listing went through PostgREST, which only accepted JWTs, not the `aca_` API tokens this CLI recommends. Fixed in 0.6.0.

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
