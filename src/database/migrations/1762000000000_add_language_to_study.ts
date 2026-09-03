import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Every existing study is 'R', so the backfill does not need to consult study_job.
    await db.schema
        .alterTable('study')
        .addColumn('language', sql`language`, (col) => col.defaultTo('R'))
        .execute()

    await sql`UPDATE study SET language = 'R'`.execute(db)

    await db.schema
        .alterTable('study')
        .alterColumn('language', (col) => col.setNotNull())
        .execute()

    await db.schema.alterTable('study_job').dropColumn('language').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_job')
        .addColumn('language', sql`language`)
        .execute()

    await sql`
        UPDATE study_job
        SET language = study.language
        FROM study
        WHERE study_job.study_id = study.id
    `.execute(db)

    await db.schema
        .alterTable('study_job')
        .alterColumn('language', (col) => col.setNotNull())
        .execute()

    await db.schema.alterTable('study').dropColumn('language').execute()
}
