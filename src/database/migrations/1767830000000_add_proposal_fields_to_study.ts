import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('research_questions', 'text')
        .addColumn('project_summary', 'text')
        .addColumn('impact', 'text')
        .addColumn('additional_notes', 'text')
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .dropColumn('research_questions')
        .dropColumn('project_summary')
        .dropColumn('impact')
        .dropColumn('additional_notes')
        .execute()
}
