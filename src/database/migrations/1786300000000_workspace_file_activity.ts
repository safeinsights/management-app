import { type Kysely, sql } from 'kysely'

/**
 * OTTER-693: per-file activity for the "Last activity" column on the Submit code page.
 *
 * A sibling of study_job_file_activity (OTTER-675), not an extension: that table logs who read a
 * submitted archive, this one who changed a workspace file, and the vocabularies do not overlap.
 * Workspace files also have no study_job_file row to hang off — they are paths on disk.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('workspace_file_action').asEnum(['UPLOADED', 'EDITED_IN_IDE']).execute()

    await db.schema
        .createTable('workspace_file_activity')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('file_name', 'text', (col) => col.notNull())
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
        .addColumn('action', sql`workspace_file_action`, (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    // Serves the latest-activity-per-file read: the two filtered columns lead, leaving created_at
    // to resolve which row wins.
    await db.schema
        .createIndex('workspace_file_activity_file_created_idx')
        .on('workspace_file_activity')
        .columns(['study_id', 'file_name', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('workspace_file_activity').ifExists().execute()
    await db.schema.dropType('workspace_file_action').ifExists().execute()
}
