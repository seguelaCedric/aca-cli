# aca-cli

Command-line interface for [ACA](https://app.aca.io) (Automated Client Acquisition) — push leads into campaigns, triage replies, manage contacts, and run autopilot, all from your terminal.

## Install

```bash
npm install -g @seguelac/aca-cli
```

Requires Node.js 18 or later.

## Quick start

```bash
# 1. Generate a token at app.aca.io → Settings → CLI Tokens
#    (Required for Google sign-in users; recommended for everyone.)
aca login --token aca_<paste-token-here>

# 2. Use it
aca leads search --tag warm --has-email
aca enroll -c <campaignId> --contacts <id1,id2>
aca inbox unread --channel linkedin
```

**Legacy email/password login** is still supported for accounts that have a password set:

```bash
aca login              # prompts for email + password
aca login -e you@example.com -p <password>
```

If your account uses Google sign-in, email/password login won't work — generate a token instead.

Pass `--json` to any command for pipe-friendly output:

```bash
aca campaign leads <campaignId> --stuck --json | jq '.[] | .contact_id'
```

## Commands

### Auth
| Command | What it does |
|---|---|
| `aca login --token <value>` | **Recommended.** Save an API token from app.aca.io. Works for any account (Google, SSO, password). Token is long-lived; revoke at any time in the app. |
| `aca login` | Email + password login (legacy). Auto-refreshing JWT. Doesn't work for Google sign-in users. |
| `aca logout` | Clears the cached session. |
| `aca whoami` | Shows the active auth method (token vs JWT). |

### Organization
| Command | What it does |
|---|---|
| `aca org ls` | Lists all organizations you belong to. |
| `aca org switch <id>` | Sets the active org for subsequent commands. |
| `aca org current` | Shows the active org. |

### Leads → campaign
| Command | What it does |
|---|---|
| `aca leads search [filters]` | Search contacts. Filters: `--query`, `--tag`, `--status`, `--company`, `--has-email`, `--has-linkedin`. |
| `aca leads get <contactId>` | Full contact record. |
| `aca lists ls` | List your lead lists. |
| `aca lists create -n "Name"` | Create a new list. |
| `aca lists add -l <listId> --contacts <ids>` | Bulk-add contacts to a list. |
| `aca lists members -l <listId>` | List members of a list. |
| `aca lists remove -l <listId> --contacts <ids>` | Remove contacts from a list. |
| `aca enroll -c <campaignId> -l <listId>` | Enroll an entire list into a campaign. |
| `aca enroll -c <campaignId> --contacts <ids>` | Enroll specific contacts. |

### Inbox & replies
| Command | What it does |
|---|---|
| `aca inbox unread` | List unread conversations across all channels. `--channel linkedin\|email\|...` to filter. |
| `aca inbox show <id>` | Show a conversation and its recent messages. |
| `aca inbox list` | List all conversations. Filters: `--channel`, `--status`, `--intent`. |
| `aca reply <id> -m "..."` | Reply to a conversation. Also accepts piped stdin. |

### Campaigns
| Command | What it does |
|---|---|
| `aca campaign ls` | List sequences. |
| `aca campaign status <id>` | Aggregate progress counts (pending, replied, failed, etc.). |
| `aca campaign leads <id> --stuck` | List stuck leads (status: failed or sender_disconnected). |

### Contacts
| Command | What it does |
|---|---|
| `aca contact get <id>` | Full record. |
| `aca contact tag <id> --add tag1,tag2 --remove tag3` | Add/remove tags. |
| `aca contact set-status <id> -s do_not_contact` | Update status. |

### Autopilot
| Command | What it does |
|---|---|
| `aca autopilot ls` | List autopilot configurations. |
| `aca autopilot trigger <conversationId>` | Queue an AI draft. |
| `aca autopilot pause <conversationId> --hours 48` | Pause AI on a conversation. |
| `aca autopilot resume <conversationId>` | Re-enable AI. |

### Config & completion
| Command | What it does |
|---|---|
| `aca config show` | Display current config. |
| `aca config set <key> <value>` | Set a value. Keys: `active_org_id`, `update_check_enabled`. |
| `aca config unset <key>` | Remove a value. |
| `aca completion zsh \| bash \| fish` | Print shell completion script. |

To install completions in zsh:

```bash
aca completion zsh > "${fpath[1]}/_aca"
```

In bash:

```bash
aca completion bash > /usr/local/etc/bash_completion.d/aca
```

In fish:

```bash
aca completion fish > ~/.config/fish/completions/aca.fish
```

## Configuration

The CLI stores files under `~/.aca/`:

- `session.json` — cached auth token (0600 permissions)
- `config.json` — local preferences (active org, update-check setting)
- `update-check.json` — timestamp + cached latest version

To disable the daily update check:

```bash
aca config set update_check_enabled false
```

## Environment variables

| Variable | Purpose |
|---|---|
| `ACA_TOKEN` | Skip `--token` flag. CLI uses this for auth on every command. Useful for CI. |
| `ACA_EMAIL` | Skip the email prompt during legacy `aca login` |
| `ACA_PASSWORD` | Skip the password prompt during legacy `aca login` (use with care in shared shells) |

## Development

```bash
git clone https://github.com/seguelaCedric/aca-cli
cd aca-cli
npm install
npm run dev    # tsc --watch
npm test       # vitest
npm run build  # tsc once
```

Local dev binary:

```bash
node dist/index.js <command>
```

## Release

Bump version in `package.json` + `CHANGELOG.md`, commit, tag, push:

```bash
npm version patch  # or minor / major
git push --follow-tags
```

The `Release` GitHub Actions workflow runs tests and publishes to npm on tags matching `v*.*.*`. Requires `NPM_TOKEN` secret in the repo settings.

## License

MIT — see [LICENSE](LICENSE).
