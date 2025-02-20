import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('study_job_status')
        .asEnum([
            'INITIATED',        // initial state when a study draft is created
            'CODE-SUBMITTED',   // code is present and awaiting review and approval by Member
            'CODE-REJECTED',    // Member has rejected the initial code
            'CODE-APPROVED',    // Code has been approved by Member,
            'JOB-PACKAGING',    // BMA is packageing code for the Setup App to pick up.
            'JOB-READY',        // Code is ready and waiting to be picked up by the Setup App
            'JOB-PROVISIONING', // Setup App has picked up the packaged code and is preparing to run it against the enclave data
            'JOB-RUNNING',      // Code is running inside the enclave.
            'JOB-ERRORED',      // code had an error while running inside enclave
            'RUN-COMPLETE',     // run is complete, results are available for review
            'RESULTS-APPROVED', // results are approved, can be downloaded by researcher
            'RESULTS-REJECTED', // results were rejected, cannot be shared with researcher
        ])
        .execute()

    await db.schema.createType('result_format').asEnum(['SI_V1_ENCRYPT']).execute()

    await db.schema
        .createTable('study_job')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id'))
        .addColumn('results_path', 'text')
        .addColumn('result_format', sql`result_format`)
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('study_job_study_indx').on('study_job').column('study_id').execute()

    await db.schema
        .createTable('job_status_change')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('study_job_id', 'uuid', (col) => col.notNull().references('study_job.id'))
        .addColumn('status', sql`study_job_status`, (col) => col.notNull().defaultTo('INITIATED'))
        .addColumn('user_id', 'uuid', (col) => col.references('user.id'))
        .addColumn('message', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('job_status_change_jb_indx').on('job_status_change').column('study_job_id').execute()
    db.schema.createIndex('job_status_change_st_indx').on('job_status_change').column('status').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job').execute()
}
