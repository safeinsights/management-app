import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_proposal_comment').addColumn('version', 'integer').execute()

    await sql`
        WITH versioned AS (
            SELECT id,
                   entry_type,
                   SUM(CASE WHEN entry_type = 'RESUBMISSION-NOTE' THEN 1 ELSE 0 END)
                       OVER (PARTITION BY study_id ORDER BY created_at, id
                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                   + 1 AS computed_version
            FROM study_proposal_comment
        )
        UPDATE study_proposal_comment
        SET version = versioned.computed_version
        FROM versioned
        WHERE study_proposal_comment.id = versioned.id
    `.execute(db)

    await db.schema
        .alterTable('study_proposal_comment')
        .alterColumn('version', (col) => col.setNotNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_proposal_comment').dropColumn('version').execute()
}
