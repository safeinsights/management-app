import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('study_review_comment_kind').asEnum(['PROPOSAL', 'CODE']).execute()
    await db.schema.createType('study_review_comment_entry_type').asEnum(['DECISION', 'NOTE']).execute()

    await db.schema
        .createTable('study_review_comment')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('study_job_id', 'uuid', (col) => col.references('study_job.id').onDelete('cascade'))
        .addColumn('author_id', 'uuid', (col) => col.notNull().references('user.id').onDelete('restrict'))
        .addColumn('review_kind', sql`study_review_comment_kind`, (col) => col.notNull())
        .addColumn('entry_type', sql`study_review_comment_entry_type`, (col) => col.notNull())
        .addColumn('decision', sql`review_decision`)
        .addColumn('body', 'jsonb', (col) => col.notNull())
        .addColumn('criteria', 'jsonb')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        // A composite unique rather than a partial index: the latter would reference a
        // freshly added enum value in the same transaction, which Postgres rejects.
        .addUniqueConstraint('study_review_comment_one_code_review_per_job', ['study_job_id', 'review_kind'])
        .execute()

    await db.schema
        .createIndex('study_review_comment_study_kind_created_idx')
        .on('study_review_comment')
        .columns(['study_id', 'review_kind', 'created_at'])
        .execute()

    await sql`
        ALTER TABLE study_review_comment
            ADD CONSTRAINT study_review_comment_code_requires_job
            CHECK (review_kind <> 'CODE' OR study_job_id IS NOT NULL)
    `.execute(db)

    await sql`
        ALTER TABLE study_review_comment
            ADD CONSTRAINT study_review_comment_decision_requires_value
            CHECK (entry_type <> 'DECISION' OR decision IS NOT NULL)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_review_comment').ifExists().execute()
    await db.schema.dropType('study_review_comment_entry_type').ifExists().execute()
    await db.schema.dropType('study_review_comment_kind').ifExists().execute()
}
