import { type Kysely } from 'kysely'

// A Data Partner editing or replacing a code env changed it for studies already made. The study now
// keeps its own copy of the code env chosen for its language.

// no backfill study: an existing study keeps reading its code env live through
// fetchCodeEnvForStudyId, as it did before this change; only studies created from now on are frozen.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('code_env_snapshot', 'jsonb').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('code_env_snapshot').execute()
}
