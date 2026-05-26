# Changelog

All notable changes to `aca-cli` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
