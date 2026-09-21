import { sql, type Kysely } from 'kysely'

// OTTER-642: a re-delivered ingest webhook overwrote one S3 object while inserting a second row
// describing it, so every row in a slot points at the SAME object and collapsing them loses nothing.
const ARTIFACT_SLOT = sql`study_job_id, path, file_type`

// Code files are keyed by filename rather than by artifact slot, so OTTER-642 scopes them out.
const ARTIFACT_TYPES = sql`file_type NOT IN ('MAIN-CODE', 'SUPPLEMENTAL-CODE')`

// Newest row wins to match storeJobFile, which updates the newest existing row in place.
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

// Counted before the delete because the redundant-row count cannot be recomputed afterwards.
async function inventory(db: Kysely<unknown>): Promise<SlotInventory> {
    // Single-word aliases on purpose: CamelCasePlugin would rewrite a `redundant_rows` alias to
    // `redundantRows`, and a snake_case read would then silently report zero.
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

// Exported only for study_job_file_artifact_slot.test.ts; the migration is the sole caller.
export async function collapseArtifactSlots(db: Kysely<unknown>): Promise<void> {
    // Under READ COMMITTED the copy and delete below are separate snapshots, so an approval
    // committing a recipient key against a loser in between would be cascaded away un-copied.
    await sql`LOCK TABLE study_job_file, study_job_file_recipient_key IN SHARE ROW EXCLUSIVE MODE`.execute(db)

    // Keys must move before the delete: study_job_file_recipient_key cascades on study_job_file_id,
    // and those keys are a researcher's only way into an already-released file.
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

    // source_id is a self-reference with no ON DELETE clause, so a loser still referenced by an
    // APPROVED-* row would raise a foreign key violation on the delete below.
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

    console.warn(
        `OTTER-642: collapsing ${redundantRows} redundant study_job_file row(s) across ${slotsAffected} artifact slot(s); ` +
            `${crossTypeSlots} same-path slot(s) with differing file types left in place`,
    )

    await collapseArtifactSlots(db)

    // Partial so the submission path stays unconstrained, and keyed on file_type so legacy
    // same-path-different-type rows remain legal.
    await sql`
        CREATE UNIQUE INDEX study_job_file_artifact_slot_unique
            ON study_job_file (study_job_id, path, file_type)
         WHERE ${ARTIFACT_TYPES}
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    // The collapsed rows are not restored: they described an S3 object that only ever held one copy.
    await sql`DROP INDEX IF EXISTS study_job_file_artifact_slot_unique`.execute(db)
}
