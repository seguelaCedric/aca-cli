# Changelog

All notable changes to `aca-cli` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
