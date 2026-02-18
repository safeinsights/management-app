import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('research_questions', 'jsonb')
        .addColumn('project_summary', 'jsonb')
        .addColumn('impact', 'jsonb')
        .addColumn('additional_notes', 'jsonb')
        .addColumn('datasets', sql`text[]`)
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .dropColumn('research_questions')
        .dropColumn('project_summary')
        .dropColumn('impact')
        .dropColumn('additional_notes')
        .dropColumn('datasets')
        .execute()
}
