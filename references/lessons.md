# What the original deployment taught us

This skill was distilled from a long company-then-contact cleanup completed in September 2026. Client records, credentials, profiles and IDs are intentionally excluded. The original run resolved the company queue and exhausted actionable contacts; an independent final review found 26 remaining pairs explicitly blocked by sequence enrollment. The worker was then paused. That result was not zero contacts.

## What made unattended work possible

The effective setup was a dedicated persistent Chrome profile, Playwright attached through local CDP, a separate worker process, durable checkpoints, and two macOS `launchd` services. A supervisor watched the worker's heartbeat, and sleep prevention ran with it. This survived chat turns ending; asking the chat to “continue forever” or setting a goal alone did not provide process supervision.

The decision loop was deterministic. It did not need a large or small language-model call for each duplicate pair. Most speed improvement came from keeping the review dialog open and letting HubSpot advance it automatically.

## Failures to avoid

| Observed failure | Cause | Reusable correction |
|---|---|---|
| Repeated requests to continue | Work depended on a live assistant turn | Run a local supervised process and verify it remains productive after dispatch |
| Contacts appeared stuck near the original count | Reader waited for Merge to become enabled | A loaded sequence-blocked pair stays disabled; inspect tooltip and skip |
| No sequence error was detected | Code only inspected alerts after attempting a click | Read disabled-button tooltip before the action; refresh hover between pairs |
| A transient zero was called complete | Refresh placeholder or wrong active tab | Verify selected object, loaded empty state, no rows and stable counts |
| Contact URL displayed company content | Routing had not settled the active tab | Verify the actual selected tab, not only the URL |
| Old exceptions were retried endlessly | Repeated defer overwrote blocker metadata | Preserve metadata, stable pair keys and pending intent across restarts |
| Thousands of skips sounded like progress | Same blocked pairs were revisited | Count unique current pairs; keep repeated attempts separate |
| “All blocked” inferred too early | First pair repeated without proving page coverage | Complete pass coverage, stable remaining count and matching second pass |
| Final blocked contacts kept cycling | Original finish logic retried while count >0 | End with documented exceptions; do not require forced zero |
| Authentication worked in one browser only | Normal Chrome, in-app browser and worker had separate sessions | Open and authenticate the worker's own dedicated profile |
| Service reported active but no work happened | Loaded job confused with running/productive process | Read process PID/state, heartbeat and new journal outcomes |
| Wrong completion claim after interruption | Click may have succeeded before timeout/crash | Log intent first; unknown outcomes stay unconfirmed, not blindly replayed |

## Deliberate improvements in this template

- Client settings replace hardcoded portal IDs, account names, absolute dependency paths, service names and ports.
- Two matching passes replace the original endless blocked-only loop. Incomplete coverage fails honestly.
- Unknown mutations are quarantined; the template does not automatically retry a potentially applied write.
- Placeholder emails and wrong-type LinkedIn pages are excluded from identity evidence; exposed active-enrollment fields can also defer a pair.
- Missing names are treated as unreadable, not grounds for rejection. Required fields, primary selection and nonempty secondary values are verified.
- Bootstrap is unarmed; login, authorized pilot, and validated production launch are separate operations. Start does not manufacture an approval reference.
- Completion files distinguish true zero from exceptions and errors. Current exception CSVs are separate from historical journal entries.

These are reusable engineering changes, not a claim that this exact generalized version already ran against another client's live CRM. The original implementation supplied live UI experience; the generalized template has synthetic policy, parser, browser-tooltip, coverage, configuration and journal tests. Every new portal still needs a representative live pilot, because UI markup, fields, language, account entitlement and integration behavior vary.

Validation recorded on 2026-09-24: skill structure and relative links passed; 46 automated tests passed, including a complete isolated Chrome/CDP run that merged matching pairs, rejected separate records, stopped with two verified sequence exceptions, and resumed to independently verified zero after the fixture changed. Final policy checks also confirmed enrollment exclusions apply to contacts. Bootstrap was tested for a different client: authorization stayed off, dependencies stayed pinned, and existing directories were not overwritten. All test CRM traffic was locally fulfilled synthetic data. No new live client deployment or new macOS service installation was performed during skill creation.

## What not to carry forward

- Do not copy a previous client's Chrome profile, OAuth tokens, private-app credentials, record export or runtime journal.
- Do not use a bulk “newest updated/created/engaged” criterion as a substitute for pair-level identity and continuity decisions.
- Do not advertise rejection as reversible cleanup or a blocked contact as merged. Do not promise all records/IDs/workflows survive identically.
- Do not reset retry/visited state on every refresh, or clear confirmed exceptions solely to make progress look better.
- Do not claim the Mac will work while off, logged out, or needing MFA. Current-session jobs require starting again after reboot/login.
- Do not change the business matching policy without an explicit client choice merely because the queue is large.
