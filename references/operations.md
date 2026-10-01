# Operate and recover

## Controls

Run these from the generated client worker directory:

| Command | Result |
|---|---|
| `python3 control.py login` | Open dedicated Chrome for the user's authentication; no cleanup |
| `python3 control.py pilot --pairs 5 --object companies` | Authorized, limited live pilot; inspect before validating |
| `python3 control.py pilot --pairs 5 --object contacts` | Validate the contact adapter separately |
| `python3 control.py start` | Start/resume an already validated nonterminal run |
| `python3 control.py status` | Report checkpoint plus loaded/running process state and heartbeat |
| `python3 control.py pause` | Stop worker, keep Chrome available for inspection |
| `python3 control.py stop` | Stop worker and its dedicated browser; retain data |
| `python3 control.py resume` | New pass from companies; retain counts/journal, recheck exceptions/new pairs |

Resume does not erase unconfirmed writes. Reconcile those against HubSpot before removing their quarantine flag. Sequence/campaign blocks are reread during a new pass; do not clear them by unenrolling contacts.

## Architecture

```text
Current macOS login session
  launchd browser service -> Playwright persistent Chrome profile
  launchd worker service -> caffeinate -> supervisor -> worker
                                             |          |
                                        heartbeat    loopback CDP
                                                        |
                                              HubSpot review dialog
                                                        |
                                             intent + result journal
```

One worker mutates a client at a time. The browser profile, checkpoints, and service labels are client-specific. `launchd` starts processes; the supervisor detects a stalled child. Neither grants HubSpot access nor supplies MFA. Loaded service ≠ running process ≠ productive worker.

## Processing loop

1. Confirm authentication, portal/account, selected object and configured queue scope. Read both live counts.
2. Open one comparison. Read two stable ID-bound cards and aligned properties; a permanently disabled merge button can still be a fully loaded pair.
3. Move the pointer off the previous button before hovering again. Read only visible current tooltip/alert text. If no explicit reason appears, defer as unavailable.
4. Decide identity and primary. Verify the same IDs/order and selected retained values. Record intent atomically before clicking.
5. Use the appropriate **…and review next** or **Review next** action. Observe advancement and, for resolving actions, a reduced queue. Save the result before the next action.
6. Preserve visited IDs and page coverage across recovery. Use pagination after a dialog cycle; do not interpret one repeated pair as proof the entire queue was processed.
7. After a productive pass, continue from page one. After two matching, fully covered nonproductive passes, export the remaining pairs and end with exceptions. Three incomplete passes produce a review-needed state.
8. Process contacts after companies are exhausted of actionable work. If the client requires literally zero companies first, set `contactsAfterCompanyExceptions` false. Recheck companies after contacts for changed counts.

With one blocked pair remaining, Review next may show the same pair. Record the completed review without inventing an advancement or a successful merge.

## Recovery ladder

| Condition | Autonomous response | Limit |
|---|---|---|
| Transient read/timeout | Save error; delay 5, 15, 45 seconds and reload | Initial attempt + three retries |
| Pair remains unreadable with IDs visible | Defer with UI reason; advance other pairs | Never reject on parser failure |
| Browser stuck/disconnected | Restart only its client service and reconnect | Three recovery cycles, then needs UI review |
| Worker stops heartbeating | SIGTERM then SIGKILL after eight seconds | Watchdog threshold three minutes |
| Rapid process crashes | Restart after 10/30 seconds; repeated failures use five-minute cooldown | Nine rapid failures end with diagnostics |
| Authentication expired | Wait and resume once user authentication returns | No password/MFA automation |
| Portal/scope mismatch | End with configuration error | No mutation or automatic scope substitution |
| Unknown click outcome | Quarantine exact IDs; continue other pairs | No blind replay, no success count |
| Sequence/campaign constraint | Review next and record visible reason | Never force merge, reject as a workaround, or unenroll |

An unattended worker should recover transient failures. It should not keep clicking indefinitely against a permanent constraint. The terminal report distinguishes a business block, UI failure, and actual completion.

## State and evidence

All files below stay in the generated client's protected, gitignored `runtime/`:

- `checkpoint.json`: object, counts, current pass, pending intent, exceptions and verification results.
- `decisions.jsonl`: append-only intents and observed outcomes. Count verified actions separately from attempts.
- `worker-heartbeat.json`, browser/worker logs: health and recovery evidence.
- `review-results.md`: concise readable result/status.
- `remaining-pairs.csv`: current verified remainder with IDs, names, links, reason and timestamp; spreadsheet formula prefixes are escaped.
- `TERMINAL.json`: why this run ended. `DONE` is written only for verified zero on both configured queues.

Terminal states:

| State | Meaning |
|---|---|
| `complete_zero` | Both configured queues refreshed and verified zero with loaded empty-state evidence |
| `reviewed_with_exceptions` | Remaining queue fully covered; actionable work exhausted for this pass |
| `needs_ui_review` | Coverage/read/recovery failed; do not claim all remaining pairs are blocked |
| `needs_configuration` | Portal/scope/configuration problem; no permission bypass |
| `waiting_for_authentication` | Still waiting, not completed |
| `pilot_ready_for_inspection` | Pilot stopped; operator must inspect actual results before validation |

For exceptions, distinguish confirmed sequence/campaign blocks, unexplained disabled buttons, property-selection failures, unreadable comparisons, and unconfirmed outcomes. Historic checkpoint exceptions are not a count of currently visible pairs. Repeated skips of one pair are not multiple contacts processed.

## Final verification and reporting

- Check live counts and active object tabs after refresh. Count-read errors and placeholder zeros are not empty queues.
- Require no Review rows, a matching affirmative empty-state message and four stable samples. Empty-state text is client/UI-specific and must be observed during setup.
- For nonzero queues, require complete coverage and stable unique IDs/reasons in two nonmutating passes. The first repeated pair, last table page, or a cumulative skip counter is insufficient.
- Recheck the other object. Report timestamps and configured rule/filter scope. If a scan adds pairs, continue or report the new remaining count; do not invent an explanation for a count increase.
- Stop productive work once the terminal state is reached. Leave the browser available; no repeated scheduled job is needed to revisit unchanged blocked contacts.
- Report verified pair-action totals, current remaining counts, current exceptions and unconfirmed outcomes separately. Link the CSV. State test scope and whether any requested object remains unvalidated.

After cleanup, rebuild dependent lists/reports and enrichment exclusions using the actual surviving/merged IDs when that downstream work is authorized. Do not automatically spend enrichment credits or change workflows as part of this skill.
