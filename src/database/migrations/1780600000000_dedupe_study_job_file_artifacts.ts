import { sql, type Kysely } from 'kysely'

// One artifact slot is one (study_job_id, path, file_type). The path is derived from the job and the
// artifact type, so a re-delivered ingest webhook overwrote the same S3 object while inserting a
// second row describing it, and reviewers and researchers saw the log or result listed twice
// (OTTER-642). Every row in a slot therefore points at the SAME object, and collapsing them hides no
// content that the survivor does not already carry.
const ARTIFACT_SLOT = sql`study_job_id, path, file_type`

// Code files are excluded throughout. Their paths are keyed by filename rather than by artifact slot,
// two uploads can sanitize to one path (sanitizeFileName strips non-ASCII and '..'), and a submit that
// hit the constraint would 500 rather than duplicating a row. OTTER-642 scopes them out.
const ARTIFACT_TYPES = sql`file_type NOT IN ('MAIN-CODE', 'SUPPLEMENTAL-CODE')`

// Newest row per slot wins, matching storeJobFile: it updates the newest existing row in place, so
// keeping the newest here means one rule describes both the backfill and every write after it. The id
// tiebreak keeps the choice deterministic when two rows share a created_at.
const RANKED_SLOT_ROWS = sql`
    SELECT id,
           study_job_id,
           path,
           file_type,
           row_number() OVER (PARTITION BY ${ARTIFACT_SLOT} ORDER BY created_at DESC, id DESC) AS rn
      FROM study_job_file
     WHERE ${ARTIFACT_TYPES}
`

type SlotInventory = {
    redundantRows: number
    slotsAffected: number
    crossTypeSlots: number
}

// Read before writing, so the deploy log records what this migration is about to destroy. The
// redundant-row count is the part that cannot be recomputed afterwards, because those rows are gone.
//
// The cross-type count is reported alongside it for a different reason: those rows are LEFT IN PLACE
// (their file_type differs, so the index below permits them) and they are the only reason a job can
// still display one S3 object twice. Pre-e10c2cd7 (2025-06-26) runs wrote logs and results both to
// results/encrypted-results.zip, and approved logs and results both to results/approved/{name}. That
// number stays queryable after this runs, which is why logging it is enough and why a non-zero count
// is not a reason to fail the migration: nothing is being destroyed on its account.
async function inventory(db: Kysely<unknown>): Promise<SlotInventory> {
    // Single-word aliases on purpose: CamelCasePlugin rewrites result column names, so a
    // `redundant_rows` alias would arrive as `redundantRows` and a snake_case read would silently
    // report zero. Words with no underscore pass through either way.
    const { rows } = await sql<{
        redundant: string | number | bigint
        slots: string | number | bigint
        crosstype: string | number | bigint
    }>`
        WITH ranked AS (${RANKED_SLOT_ROWS}),
        slot_counts AS (
            SELECT study_job_id, path, file_type, count(*) AS row_count
              FROM ranked
             GROUP BY study_job_id, path, file_type
        ),
        cross_type AS (
            SELECT study_job_id, path
              FROM study_job_file
             WHERE ${ARTIFACT_TYPES}
             GROUP BY study_job_id, path
            HAVING count(DISTINCT file_type) > 1
        )
        SELECT coalesce(sum(row_count - 1), 0) AS redundant,
               count(*) FILTER (WHERE row_count > 1) AS slots,
               (SELECT count(*) FROM cross_type) AS crosstype
          FROM slot_counts
    `.execute(db)

    const row = rows[0]
    return {
        redundantRows: Number(row?.redundant ?? 0),
        slotsAffected: Number(row?.slots ?? 0),
        crossTypeSlots: Number(row?.crosstype ?? 0),
    }
}

/**
 * Collapse every artifact slot to its newest row, carrying recipient keys forward first.
 *
 * Exported for the test in study_job_file_artifact_slot.test.ts, which drops the unique index, seeds
 * duplicates with keys on the row that is about to be deleted, and asserts none of them are lost.
 * The migration itself is the only production caller.
 */
export async function collapseArtifactSlots(db: Kysely<unknown>): Promise<void> {
    // Held until the transaction commits, so it also covers the index creation that follows.
    //
    // Without it the copy below and the delete further down are separate snapshots under READ
    // COMMITTED: an approval committing a recipient key against a loser in between would be visible
    // to the delete but not to the copy, so the cascade would take a key that was never carried
    // forward and a researcher would lose a released file. SHARE ROW EXCLUSIVE blocks writers while
    // still allowing plain reads, and both tables are named because the key insert is the write that
    // has to be shut out. The table is small and this runs once, so the wait is momentary.
    await sql`LOCK TABLE study_job_file, study_job_file_recipient_key IN SHARE ROW EXCLUSIVE MODE`.execute(db)

    // Keys move before the delete, not after: study_job_file_recipient_key cascades on
    // study_job_file_id, so deleting a row takes its per-recipient wrapped AES keys with it. Those
    // keys are a researcher's only way into an already-released file and exist nowhere else, so a
    // delete that ran first would silently revoke access to a file they had already been given.
    //
    // Copying every loser's keys forward, rather than picking a survivor that already holds some, is
    // what handles keys spread across more than one duplicate. DO NOTHING covers the same inner file
    // already granted to the same recipient. Where two rows hold DIFFERENT crypt values for one
    // (file_path, fingerprint) it keeps whichever lands first and drops the other, which is safe only
    // because every duplicate describes the same S3 object: the AES key being wrapped is the same, so
    // either wrapping opens it. That assumption is the reason a plain DO NOTHING is enough here.
    await sql`
        WITH ranked AS (${RANKED_SLOT_ROWS}),
        survivors AS (SELECT * FROM ranked WHERE rn = 1),
        losers AS (SELECT * FROM ranked WHERE rn > 1)
        INSERT INTO study_job_file_recipient_key (study_job_file_id, file_path, fingerprint, crypt)
        SELECT s.id, k.file_path, k.fingerprint, k.crypt
          FROM losers l
          JOIN survivors s
            ON s.study_job_id = l.study_job_id AND s.path = l.path AND s.file_type = l.file_type
          JOIN study_job_file_recipient_key k ON k.study_job_file_id = l.id
        ON CONFLICT (study_job_file_id, file_path, fingerprint) DO NOTHING
    `.execute(db)

    // study_job_file.source_id is a self-reference with no ON DELETE clause, so it defaults to NO
    // ACTION and a referenced row cannot be deleted. Approval records the encrypted row an
    // APPROVED-* row came from, and on a job that already held duplicates that reference can point at
    // any of them, including one this backfill is about to drop. Repoint it at the survivor first, or
    // the delete raises a foreign key violation and takes the whole migration down with it. Both rows
    // described the same S3 object, so the provenance the reference records is unchanged.
    await sql`
        WITH ranked AS (${RANKED_SLOT_ROWS}),
        survivors AS (SELECT * FROM ranked WHERE rn = 1),
        losers AS (SELECT * FROM ranked WHERE rn > 1)
        UPDATE study_job_file f
           SET source_id = s.id
          FROM losers l
          JOIN survivors s
            ON s.study_job_id = l.study_job_id AND s.path = l.path AND s.file_type = l.file_type
         WHERE f.source_id = l.id
    `.execute(db)

    await sql`
        WITH ranked AS (${RANKED_SLOT_ROWS})
        DELETE FROM study_job_file
         WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    const { redundantRows, slotsAffected, crossTypeSlots } = await inventory(db)

    // console.warn because it is the channel eslint allows and because an irreversible delete is
    // worth a warning rather than a debug line.
    console.warn(
        `OTTER-642: collapsing ${redundantRows} redundant study_job_file row(s) across ${slotsAffected} artifact slot(s); ` +
            `${crossTypeSlots} same-path slot(s) with differing file types left in place`,
    )

    await collapseArtifactSlots(db)

    // Partial rather than total so the submission path stays unconstrained, and keyed on file_type so
    // the legacy same-path-different-type rows above remain legal. What it forbids is exactly the
    // duplicate this card is about: a second row for an artifact slot the job already has.
    await sql`
        CREATE UNIQUE INDEX study_job_file_artifact_slot_unique
            ON study_job_file (study_job_id, path, file_type)
         WHERE ${ARTIFACT_TYPES}
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    // Dropping the index restores the old write behavior. The collapsed rows are NOT restored: they
    // were byte-identical descriptions of an S3 object that only ever held one copy, and their
    // recipient keys were merged onto the surviving row before the delete, so nothing reachable was
    // lost. There is nothing left to reconstruct them from.
    await sql`DROP INDEX IF EXISTS study_job_file_artifact_slot_unique`.execute(db)
}
