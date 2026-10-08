import { type Kysely } from 'kysely'

// SHRMP-271: a Data Partner editing or replacing a code env changed it for studies already made.
// The study now keeps its own copy of the code env chosen for its language; null means the study
// predates this and still reads the code env live.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('code_env_snapshot', 'jsonb').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('code_env_snapshot').execute()
}
