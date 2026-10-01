# Client setup

## What the user provides

| Item | User action | Agent action |
|---|---|---|
| Client | Supply duplicate-manager URL/account | Verify portal ID, exact app origin and account label |
| Authorization | Authorize company/contact merge and reject under agreed rules | Record once; no repeat approval for retries |
| Access | Admin supplies missing permissions | Verify both queues and merge controls |
| Authentication | Log in directly in dedicated Chrome, including MFA/passkey | Wait; never request passwords or copy cookies |
| Host | Keep Mac logged in, powered, lid open, and online | Configure local supervision/checkpoints/sleep prevention |
| Business exceptions | Mention any departure from the location/identity rules | Otherwise apply established rules and map relevant fields |

Playwright is a browser automation library, not a HubSpot role or paid seat. A partner login can work if it has the necessary permissions in the client portal; verify access before proposing a seat purchase.

## HubSpot access

Official documentation checked 2026-09-24; verify again per deployment. The duplicate manager requires a qualifying Professional/Enterprise subscription. Individual review does not require the separate bulk entitlement. Grant **Data quality tools access**, **Edit: All contacts**, **Edit: All companies**, and verify **Merge records** permission. Super Admin can satisfy permissions but is not required when scoped permissions work.

Open CRM → Contacts/Companies → Actions → Manage duplicates, or the client's supplied URL. Select **HubSpot model (default)**. The supplied adapter handles its two-record dialog, not custom grouped-rule screens.

Sources: [duplicate manager requirements](https://knowledge.hubspot.com/records/manage-duplicate-records), [merge permission](https://knowledge.hubspot.com/records/merge-records).

## Explain merge effects once

Merges cannot be unmerged. Primary values generally win and secondary values fill blanks. Activities and associations combine, with exceptions for labels, segments, and integrations. Record-ID preservation and workflow enrollment can depend on portal beta settings. Inspect the resulting record during the pilot; never promise all IDs/enrollments survive unchanged. The worker does not change those settings.

Reject dismisses a suggestion while keeping both records. Use it for identity decisions, not campaign blocks or temporary uncertainty in the UI.

Sources: [merge effects](https://knowledge.hubspot.com/records/merge-records), [review/reject behavior](https://knowledge.hubspot.com/records/manage-duplicate-records).

## Comparison properties

Respect the user's existing choices. Include missing decision-critical properties without changing CRM schema. Map custom labels in `fieldAliases`; confirm columns are aligned to the correct records.

| Object | Identity/location | Commercial continuity |
|---|---|---|
| Companies | Card name; Company Domain Name; LinkedIn Company Page; Country; City; Street Address. Include State/Region, Postal Code, Street Address 2 when available/populated. | Number of Associated Contacts; open/associated deals; Lifecycle Stage; Company owner; Last Activity Date |
| Contacts | Card full name; Email; personal LinkedIn URL; Phone Number; Mobile Phone Number when used | Open/associated deals; Lifecycle Stage; Contact owner; Last Activity Date; associated companies |

Add active-enrollment properties when exposed; map them in `activeEnrollmentFields`. The tooltip catches HubSpot's explicit restrictions. If the client requires exclusion of every campaign member, and campaign membership is neither exposed nor blocked by HubSpot, resolve that missing visibility before running; don't claim complete exclusion.

Set `requiredFields` to the approved labels and keep all critical fields represented. Do not remove requirements just to silence a parser failure. A displayed `--` is blank; a missing property is unavailable. Completeness only measures inspected fields.

## Bootstrap

Use Node.js 22+, Python 3 and installed Google Chrome. Reuse compatible runtimes when available. The agent handles commands; the user supplies access and login.

```bash
python3 /absolute/path/to/hubspot-autonomous-deduplication/scripts/bootstrap.py \
  --destination '/absolute/client/workspace/hubspot-deduplication' \
  --client example-client --portal 123456 --account-label 'Example Client' \
  --origin https://app.hubspot.com --port 9447
```

Replace example values with observed client details. Each simultaneous client needs an unused port. Use the actual regional origin when present. This creates files only, with no authorization and no running job.

Inside the generated directory:

```bash
npm ci
npm test
python3 control.py login
```

Chrome uses a dedicated profile under `runtime/chrome-profile`; CDP binds to loopback. One process owns that profile. Never reuse the user's normal Chrome profile, expose the debugging port, or upload session files. Install Chrome through the normal device process if missing.

Sources: [persistent profiles](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp).

## Login, pilot, start

1. User logs into the opened Chrome window. Normal Chrome and the in-app browser are different sessions.
2. Verify portal/account, default rule, clear search/owner/date/similarity filters, and document `queueScope`. Set `scopeVerified: true` after inspection. Match `emptyStatePattern` to the actual empty-state message; do not broaden it to match any page text.
3. Map fields and provider-specific placeholder-email patterns. Record the existing approval in `authorization.reference`; set `merge` and `reject` true only if authorized. Keep `validated: false`.
4. Run `python3 control.py pilot --pairs 5 --object companies`. Inspect identities, primary choices, retained values, associations, confirmed results and advancement. Repeat with `--object contacts` when available. Synthetic tests cover branches absent from the pilot.
5. After both applicable adapters pass, set `validated: true` and run `python3 control.py start`. Production starts with companies. Confirm fresh heartbeat, running process and subsequent progress using `status`.

The pilot needs no additional human approval if already authorized. An exit code or five attempted clicks is insufficient evidence of success. If one object cannot be validated, keep its writes gated until it can.

## Independent operation

The browser service owns persistent Chrome. A separate supervised worker attaches through CDP and applies deterministic rules; there is no LLM/enrichment charge per pair. Ending the chat does not terminate these services.

The bundled `launchd` jobs are loaded for the current macOS login session, not installed as permanent login items. After reboot/logout, run start/resume again. Only add login startup if requested. Authentication expiration still requires the user; never automate passwords/MFA bypass.

`caffeinate` prevents sleep where macOS permits. It cannot run through shutdown, closed-lid sleep, logout, or network loss. For a different always-on host, port and test supervision there; this package does not pretend to configure PM2, systemd, or Windows.
