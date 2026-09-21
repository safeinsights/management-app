import { type Kysely, sql } from 'kysely'

// OTTER-675: per-file activity for the reviewer's "Last activity" column. Keyed on
// (study_job_file_id, file_path) because a study_job_file row is the whole encrypted archive.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('study_job_file_action').asEnum(['VIEWED', 'DOWNLOADED']).execute()

    await db.schema
        .createTable('study_job_file_activity')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_job_file_id', 'uuid', (col) =>
            col.notNull().references('study_job_file.id').onDelete('cascade'),
        )
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
        .addColumn('action', sql`study_job_file_action`, (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('study_job_file_activity_file_created_idx')
        .on('study_job_file_activity')
        .columns(['study_job_file_id', 'file_path', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job_file_activity').ifExists().execute()
    await db.schema.dropType('study_job_file_action').ifExists().execute()
}
