import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('study_job_status')
        .asEnum([
            'INITIATED',
            'CODE-SUBMITTED',
            'CODE-REJECTED',
            'CODE-APPROVED',
            'PACKAGING',
            'PROVISIONING',
            'READY',
            'RUNNING',
            'ERRORED',
            'RUN-COMPLETE',
            'RESULTS-APPROVED',
            'RESULTS-REJECTED',
        ])
        .execute()

    await db.schema.createType('result_format').asEnum(['SI_V1_ENCRYPT']).execute()

    await db.schema
        .createTable('study_job')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('results_path', 'text')
        .addColumn('result_format', sql`result_format`)
        .execute()

    db.schema.createIndex('study_job_study_indx').on('study_job').column('study_id').execute()

    await db.schema
        .createTable('job_status_change')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_job_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('status', sql`study_job_status`, (col) => col.notNull().defaultTo('INITIATED'))
        .addColumn('message', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('job_status_change_jb_indx').on('job_status_change').column('study_job_id').execute()
    db.schema.createIndex('job_status_change_st_indx').on('job_status_change').column('status').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job').execute()
}
