import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Per-recipient wrapped AES keys, so access can be granted after run time without re-encrypting
    // the immutable results archive (the zip manifest only covers recipients present at run time).
    await db.schema
        .createTable('study_job_file_recipient_key')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_job_file_id', 'uuid', (col) =>
            col.notNull().references('study_job_file.id').onDelete('cascade'),
        )
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('crypt', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
        .addUniqueConstraint('study_job_file_recipient_key_file_path_fingerprint_unique', [
            'study_job_file_id',
            'file_path',
            'fingerprint',
        ])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job_file_recipient_key').execute()
}
