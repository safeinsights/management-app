import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createType('study_run_status')
        .asEnum([
            'initiated','code-review', 'code-rejected', 'in-queue', 'in-progress',
            'errored', 'results-review', 'results-rejected', 'results-available',
        ])
        .execute()

    await db.schema
        .createTable('study_run')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('status', sql`study_run_status`, (col) => col.notNull().defaultTo('initiated'))
        .addColumn('started_at', 'timestamp')
        .addColumn('completed_at', 'timestamp')
        .addColumn('uploaded_at', 'timestamp')
        .addColumn('created_at', 'timestamp')
        .addColumn('file_size', 'integer')
        .addColumn('file_count', 'integer')
        .addColumn('code_path', 'text')
        .addColumn('results_path', 'text')
        .execute()

    db.schema.createIndex('study_run_study_indx').on('study_run').column('study_id').execute()
    db.schema.createIndex('study_run_status_indx').on('study_run').column('status').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('study_run').execute()
}
