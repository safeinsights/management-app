import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_job_file').addColumn('iv', 'text').execute()
    // Display-only pre-encryption size. `integer` caps at ~2.15 GB; if result files ever
    // exceed that, widen to `bigint` (note: pg returns int8 as a string, so add an int8 type
    // parser or coerce at the read sites — `bytes` is currently typed `number`).
    await db.schema.alterTable('study_job_file').addColumn('bytes', 'integer').execute()

    // Records the durable fact that a reviewer approved (and shared) this file. The
    // per-recipient `study_job_file_key` rows are the *access* mechanism; approval is a
    // historical event and must not be re-derived from current org membership (which can
    // change). A file is approved iff approved_at is set.
    await db.schema.alterTable('study_job_file').addColumn('approved_at', 'timestamptz').execute()
    await db.schema
        .alterTable('study_job_file')
        .addColumn('approved_by_user_id', 'uuid', (col) => col.references('user.id').onDelete('set null'))
        .execute()

    await db.schema
        .createTable('study_job_file_key')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_job_file_id', 'uuid', (col) =>
            col.notNull().references('study_job_file.id').onDelete('cascade'),
        )
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('crypt', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
        .addUniqueConstraint('study_job_file_key_file_fingerprint_unique', ['study_job_file_id', 'fingerprint'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job_file_key').execute()
    await db.schema.alterTable('study_job_file').dropColumn('approved_by_user_id').execute()
    await db.schema.alterTable('study_job_file').dropColumn('approved_at').execute()
    await db.schema.alterTable('study_job_file').dropColumn('bytes').execute()
    await db.schema.alterTable('study_job_file').dropColumn('iv').execute()
}
