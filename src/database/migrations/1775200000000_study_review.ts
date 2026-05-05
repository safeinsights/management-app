import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study_review')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_job_id', 'uuid', (col) => col.notNull().references('study_job.id').onDelete('cascade'))
        .addColumn('report', 'jsonb', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('study_review_study_job_id_unique')
        .on('study_review')
        .column('study_job_id')
        .unique()
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_review').execute()
}
