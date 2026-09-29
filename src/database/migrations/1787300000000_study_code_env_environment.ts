import { type Kysely } from 'kysely'

// SHRMP-271: a Data Partner editing a code env's variables changed them for studies already made.
// The study now keeps its own copy; null means it predates this and still reads the code env live.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('code_env_environment', 'jsonb').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('code_env_environment').execute()
}
