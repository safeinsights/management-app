import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createType('study_run_status')
        .asEnum(['created', 'pending', 'running', 'rejected', 'complete'])
        .execute()

    await db.schema
        .createTable('study_run')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('status', sql`study_run_status`, (col) => col.notNull().defaultTo('created'))
        .addColumn('started_at', 'timestamp')
        .addColumn('completed_at', 'timestamp')
        .addColumn('code_review_path', 'text')
        .addColumn('results_path', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('study_run_study_indx').on('study_run').column('study_id').execute()
    db.schema.createIndex('study_run_status_indx').on('study_run').column('status').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('study_run').execute()
}
