import { type Kysely, sql } from 'kysely'

// OTTER-636: immutable per-version snapshot of a submitted proposal. Reviewer proposal views read the
// latest snapshot for a study rather than the mutable `study` row / live Yjs docs, so a researcher
// revising a change-requested proposal (which now literally re-enters DRAFT) can never leak in-progress
// draft content to a reviewer. One row is written on each submission (fresh submit = v1, each resubmit
// = next version). `snapshot` holds every reviewer-visible proposal field as one validated JSON object
// (see the shared Zod schema/serializer in src/lib/proposal-snapshot.ts).
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study_proposal_submission')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('version', 'integer', (col) => col.notNull())
        .addColumn('submitted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('submitted_by_user_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('schema_version', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('snapshot', 'jsonb', (col) => col.notNull())
        .addUniqueConstraint('uq_study_proposal_submission_study_version', ['study_id', 'version'])
        .execute()

    await db.schema
        .createIndex('idx_study_proposal_submission_study_version')
        .on('study_proposal_submission')
        .columns(['study_id', 'version desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_proposal_submission').execute()
}
