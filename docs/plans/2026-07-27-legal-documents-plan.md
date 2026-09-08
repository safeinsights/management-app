# Legal Documents — Status

**Epic:** [SHRMP-273](https://openstax.atlassian.net/browse/SHRMP-273)
**Design:** `docs/plans/2026-07-27-legal-documents-design.md` — the model, the decisions and the
gotchas live there. This doc is only status and what is left.
**Branch:** `SHRMP-274/instantiate-legal-page` — the whole epic merges from it as one unit.

---

## Cards

| Card                                                         | Scope                                                            | State                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| [SHRMP-274](https://openstax.atlassian.net/browse/SHRMP-274) | ToS/PN Goal 2 — SI Admin Legal page, upload + publish, ack audit | Schema and actions done; ToS/PN tab UI is KC's, in progress |
| [SHRMP-275](https://openstax.atlassian.net/browse/SHRMP-275) | ToS/PN Goal 4 — login enforcement modal                          | Built; e2e not yet run                                      |
| [SHRMP-276](https://openstax.atlassian.net/browse/SHRMP-276) | ROPA/DOPA Goal 1 — participation agreement tabs                  | Built                                                       |
| [SHRMP-277](https://openstax.atlassian.net/browse/SHRMP-277) | SLA tab                                                          | Built                                                       |

Goals are numbered per workstream in the v1 hand-off doc, and the numbering has gaps — **ToS/PN
Goal 3** (real documents rendered at signup, acknowledgement recorded there) never got a card. It
was folded into 275 and is built. Goal 5 (user-facing Legal page in the profile menu) is not carded
either; product will bring tickets and design for that and the user-facing ROPA/DOPA views later,
outside this epic.

**The cards are the source of truth.** The hand-off doc is historical context.

---

## Approval gates (CLAUDE.md)

- [x] Migration approved by Chris
- [x] `src/lib/permission-types.ts` — `LegalDocument` subject added to the `Abilities` union
- [x] `src/lib/permissions.ts` — `permit('acknowledge', 'LegalDocument')`, unconditioned, approved
      for 275. SI admins reach everything else via their `('manage','all')` wildcard.
- [x] Working directly on KC's branch

---

## What is left

**Needs a product answer**

- Does the **SLA supersede the DUA section** of the study agreements page? Both are study-level and
  the DUA/IRB/SOW page is still a placeholder.
- The hand-off doc asks engineering to **propose a compliance-verification process** an SI admin
  could actually follow. Not designed.

**Engineering**

- **Run the e2e suite.** `tests/legal-acknowledgement.spec.ts` and the signup assertion added to
  `tests/org-admin.spec.ts` have never been executed, and `seedLegalDocuments()` in
  `tests/global.setup.ts` uploads to S3 on first run.
- **`.md` restriction on the ToS/PN dropzone** in `draft-form.tsx` — the viewer assumes markdown but
  the dropzone accepts anything. Left alone because KC is working in that file.
- **Orphaned S3 objects** from superseded drafts are never deleted. Harmless — unreachable and never
  published — but real litter if someone re-uploads repeatedly.
- **`format` has no CHECK constraint**; it is plain `text` holding `markdown`/`pdf`. Cheap to
  tighten.
- **The vitest setup file eagerly imports the server graph**, which silently breaks mocks two levels
  deep. Tracked separately; the workaround is noted in the design doc's gotchas.
