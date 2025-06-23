import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('file_type')
        .asEnum([
            'MAIN-CODE',
            'SUPPLEMENTAL-CODE',
            'ENCRYPTED-RESULT',
            'APPROVED-RESULT',
            'ENCRYPTED-LOG',
            'APPROVED-LOG',
        ])
        .execute()

    await db.schema
        .alterTable('study_job')
        .addColumn('language', sql`language`)
        .execute()
    db.schema.alterTable('study_job').dropColumn('results_path').execute()
    db.schema.alterTable('study_job').dropColumn('result_format').execute()

    await sql`update study_job set language = 'R'::language where language is null`.execute(db)
    await db.schema
        .alterTable('study_job')
        .alterColumn('language', (col) => col.setNotNull())
        .execute()

    await db.schema
        .createTable('study_job_file')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('path', 'text', (col) => col.notNull())
        .addColumn('study_job_id', 'uuid', (col) => col.notNull().references('study_job.id'))
        .addColumn('file_type', sql`file_type`, (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_job_file').execute()
    await db.schema.dropType('file_type').execute()

    await db.schema.alterTable('study_job').dropColumn('language').execute()

    await db.schema.alterTable('study_job').addColumn('results_path', 'text').execute()
    await db.schema.alterTable('study_job').addColumn('result_format', 'text').execute()
}
