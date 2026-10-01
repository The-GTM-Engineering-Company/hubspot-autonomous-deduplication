# Decision rules

## Precedence

Verify client, object, two stable IDs, loaded cards and aligned properties. Missing names/properties are UI failures. Visible active campaign/sequence indicators or explicit merge blocks take priority: **Review next**, with the reason retained. An unexplained disabled merge is **unavailable**. Neither case is a rejection.

Fully readable pairs lacking sufficient identity evidence are rejected under the agreed policy. Record **insufficient evidence**, not proof of distinct identities. Both records remain. A client may explicitly replace that ambiguity rule with defer before launch.

## Companies

| Evidence | Action |
|---|---|
| Same business, genuinely different populated physical locations | Reject and retain both |
| Street/St, punctuation, case differences | Normalize; not a location conflict |
| Different street/suite numbers, city or country | Preserve distinct locations |
| Address missing on one side | Not itself a reason to reject |
| Same normalized company name, no contradictory domain/LinkedIn | Merge, including sparse imports |
| Same company LinkedIn and compatible name; no location conflict | Merge; may explain a domain change |
| Exact nonshared domain and strongly matching name | Merge if no identity/location conflict |
| Contradictory LinkedIn pages, or domains without corroborating identity | Reject |
| Shared government/email-host domain, related brand, subsidiary or similar name alone | Insufficient evidence; reject |

Normalize case, accents, punctuation, common legal suffixes, URL scheme/www/trailing slash, and address abbreviations. Keep house/suite numbers. Do not invent postal equivalence or merge a parent with a subsidiary automatically.

The original deterministic thresholds are retained: name-token overlap ≥0.5 with shared company LinkedIn, ≥0.6 with shared domain. These are heuristics, not confidence probabilities; validate representative records during the pilot.

## Contacts

| Evidence | Action |
|---|---|
| Same personal LinkedIn and compatible name | Merge, including changed work email |
| Same personal email and compatible name | Merge |
| Same full name and same phone with ≥10 digits | Merge absent stronger contradiction |
| Different personal LinkedIn profiles | Reject under this policy |
| Name or employer alone | Insufficient evidence; reject |
| Shared generic inbox or enrichment placeholder | Require independent identity evidence |
| Different work domains | Context only; a job change is possible |
| Visible active enrollment or explicit merge block | Defer regardless of identity decision |

Compatible names are exact normalized names or token overlap ≥0.66. Do not infer nicknames. Generic inboxes include info, sales, support, admin, office, billing, team and marketing. Configure client/provider placeholder patterns; fabricated emails cannot establish identity.

Only `/in/…` LinkedIn URLs are personal-profile evidence; `/company/…` are company evidence. A shared homepage or wrong type is not a personal identifier.

## Primary selection

Prefer, in order: comparable open/associated deal evidence; customer/opportunity lifecycle; associated contacts for companies or associated companies for contacts; existing owner; more recent activity; more populated reviewed fields; stable first record on a tie.

Use available like-for-like fields. Do not compare an open-deal count with a total-deal count or claim to inspect relationships hidden from the form. Add continuity properties if needed.

Keep the primary's conflicting substantive values by default. Select nonempty secondary values for primary blanks. If required choices are disabled, defer rather than silently drop information. Reread IDs/order and chosen primary before submitting; save the selected values with the intent. This is not a complete CRM backup.

## Examples

- Example Foods LLC, `10 Main Street` vs Example Foods, `10 Main St.`: merge without contradictory identity; retain the commercially active primary.
- Same company/domain at Suite 1 vs Suite 2: keep separate under the location rule.
- Ana Rivera with the same personal LinkedIn and different work emails: merge unless enrollment blocks it.
- Two Ana Riveras with only different emails, no matching LinkedIn or phone: reject for insufficient evidence.
- Matching contact with sequence tooltip: Review next; export exact reason.
- Disabled button with no explanation: defer as unavailable, never invent a sequence.
