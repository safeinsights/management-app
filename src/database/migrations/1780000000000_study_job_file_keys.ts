import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Per-recipient wrapped AES key granting a lab researcher access to one inner file of an
    // approved results archive. The artifact stays a single whole-zip `study_job_file` row (prod
    // format, unchanged); these rows ADD researcher recipients without re-encrypting.
    // `study_job_file_id` points at the whole-zip row, `file_path` is the inner file. Approval
    // itself is the job-level FILES-APPROVED status; these rows are the access mechanism.
    await db.schema
        .createTable('study_job_file_key')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_job_file_id', 'uuid', (col) =>
            col.notNull().references('study_job_file.id').onDelete('cascade'),
        )
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('crypt', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
        .addUniqueConstraint('study_job_file_key_file_path_fingerprint_unique', [
            'study_job_file_id',
            'file_path',
            'fingerprint',
        ])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job_file_key').execute()
}
