# HubSpot autonomous deduplication

A reusable agent skill and local worker from The GTM Engineering Company for reviewing duplicate companies and contacts in HubSpot. The worker uses the browser duplicate manager, applies documented identity and primary-record rules, and records verified outcomes and exceptions.

## Requirements

- macOS, Google Chrome, Node.js 22+, Python 3, and npm.
- Authorized access to the customer's HubSpot duplicate manager and merge permissions.
- English HubSpot interface using the two-record **HubSpot model (default)** dialog.
- A logged-in, powered, online Mac for unattended operation. Reboot/logout requires restarting the services.

Merges cannot be undone. Review the [decision rules](references/decision-rules.md) and complete a representative authorized pilot before enabling production. Each portal requires its own configuration, browser profile, and runtime directory.

## Get started

Clone this private repository using your own authorized GitHub account:

```bash
git clone https://github.com/The-GTM-Engineering-Company/hubspot-autonomous-deduplication.git
cd hubspot-autonomous-deduplication
```

For an agent-assisted setup, ask your agent to read [SKILL.md](SKILL.md) and follow it. Codex users can install this repository as the `hubspot-autonomous-deduplication` folder under their personal `~/.codex/skills/` directory; do not overwrite an existing installation without reviewing local changes.

Create a separate client worker outside this repository, replacing the example values with verified client details:

```bash
python3 scripts/bootstrap.py \
  --destination ../example-client-worker \
  --client example-client --portal 123456 \
  --account-label 'Example Client' \
  --origin https://app.hubspot.com --port 9447
cd ../example-client-worker
npm ci
npm test
python3 control.py login
```

Bootstrap creates an unarmed configuration; it does not authorize or start merges. Follow [setup](references/setup.md) to verify the portal, map comparison fields, record cleanup authorization, inspect company/contact pilots, and validate production. Authenticate directly in the dedicated browser; never share passwords or browser profiles.

## Operate

From the generated client worker directory:

| Command | Purpose |
| --- | --- |
| `python3 control.py status` | Inspect process state and checkpoint |
| `python3 control.py start` | Start a configured, authorized, validated run |
| `python3 control.py pause` | Pause the worker |
| `python3 control.py resume` | Recheck queues while retaining the journal |
| `python3 control.py stop` | Stop worker and dedicated browser |

See [operations](references/operations.md) for recovery and terminal states. Reports and exception CSVs live in the generated worker's private `runtime/` directory. A completed review with exceptions is distinct from verified zero duplicates.

## Repository contents

- [SKILL.md](SKILL.md): agent entry point.
- `assets/worker/`: reusable implementation and synthetic tests.
- `scripts/bootstrap.py`: creates isolated client installations.
- `references/`: setup, matching policy, operation, and lessons.
- [CONTRIBUTING.md](CONTRIBUTING.md): development and customer-data boundaries.
- [ACCESS.md](ACCESS.md): granting customer and contractor access.

## Validation and updates

```bash
cd assets/worker
npm ci
npm test
```

Tests use synthetic CRM fixtures, including browser tests; they do not validate a customer's live portal. HubSpot UI changes can require adapter updates and a new pilot. Pull repository updates separately from running client installations; bootstrap intentionally refuses to overwrite existing workers and their checkpoints.

This repository is privately distributed. No open-source license is granted; use and redistribution are governed by your agreement with The GTM Engineering Company.
