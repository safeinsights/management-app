import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Add the language column to study with default 'R'
    // We do not derive language from study_job; all studies use 'R'
    await db.schema
        .alterTable('study')
        .addColumn('language', sql`language`, (col) => col.defaultTo('R'))
        .execute()

    // Initialize all existing studies to language 'R'
    await sql`UPDATE study SET language = 'R'`.execute(db)

    // Make study.language NOT NULL after copying data
    await db.schema
        .alterTable('study')
        .alterColumn('language', (col) => col.setNotNull())
        .execute()

    // Drop the language column from study_job
    await db.schema.alterTable('study_job').dropColumn('language').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    // Re-add language column to study_job
    await db.schema
        .alterTable('study_job')
        .addColumn('language', sql`language`)
        .execute()

    // Copy language back from study to study_job
    await sql`
        UPDATE study_job
        SET language = study.language
        FROM study
        WHERE study_job.study_id = study.id
    `.execute(db)

    // Make study_job.language NOT NULL
    await db.schema
        .alterTable('study_job')
        .alterColumn('language', (col) => col.setNotNull())
        .execute()

    // Drop language from study
    await db.schema.alterTable('study').dropColumn('language').execute()
}
