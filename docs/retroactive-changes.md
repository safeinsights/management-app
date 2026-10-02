# Retroactive changes to existing studies

**Rule:** after a deploy, a study created before the change must be indistinguishable from one created
after it. (OTTER-794)

Screens, pills, nav and labels are derived on every request from stored rows
(`src/lib/study-screen/`, `docs/study-screens-logic.md`), so logic and UI changes reach old studies for
free. What does **not** is a change to the data shape: a new column, a new status or enum value, a
new study-keyed table, or a changed meaning of an existing column. Those reach old studies only if the
migration brings them along.

## Checklist for a PR that changes what the app reads from study data

1. **Backfill in the migration, not in the app.** A one-time `UPDATE`/`INSERT` in `up()` puts old rows
   on the same code path as new ones. A `?? default` in a query or component makes old rows a second
   code path forever. Exemplars: `1774000000000_add_pi_user_id_to_study.ts`,
   `1780300000000_backfill_code_phase_study_status.ts`, `1786900000000_study_review_round.ts`.
2. **If no backfill is needed, say why** with a `// no backfill: <reason>` comment in the migration.
   Valid reasons: a draft/scratch column that only matters going forward; an enum value that records
   an event that could not have happened before; a table whose rows only a new flow creates. "Old rows
   are null and the code handles null" is not a reason — see 1.
3. **Test the migration against a pre-change row** in `src/database/<name>.test.ts`: insert the old
   shape, run `up`, assert the new shape (`backfill_code_phase_study_status.test.ts`,
   `study_review_round.test.ts`). Pin any status list the backfill keys on against the runtime list.
4. **Irreversible backfill → say so in `down()`** instead of pretending to undo it.
5. **Say it in the PR description**: "Existing studies: backfilled X" or "unaffected because Y", so QA
   knows whether to check studies that predate the deploy.

`src/database/migrations.test.ts` fails any migration numbered ≥ 1787300000000 that widens a
study-family table or enum without a backfill or the `no backfill:` marker.

## Pre-rule gaps

- `RESULTS-VIEWED` (OTTER-698) was not backfilled: a research lab that opened released outputs before
  the status existed still sees "Outputs need review" until they open the page again.
- `main_code_file_name` and `ide_owner_id` are filled on first IDE use; old studies converge on first
  open, which is acceptable.
