import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study_code_summary')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('study_job_id', 'uuid', (col) => col.notNull().references('study_job.id').onDelete('cascade'))
        .addColumn('generated_at', 'timestamptz', (col) => col.notNull())
        .addColumn('summary', 'jsonb', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_code_summary').execute()
}
