import { type Kysely, sql } from 'kysely'

// SHRMP-271: a Data Partner editing or replacing a code env changed it for studies already made.
// The study now keeps its own copy of the code env chosen for its language.

// Existing studies get the code env they run today, so after the deploy they are frozen exactly like
// a study created then (docs/retroactive-changes.md). A study whose language has no code env stays
// null and keeps reading it live, as a new study would.
//
// Pinned here rather than built from selectCodeEnvSnapshot: this records what ran against production.
// study_code_env_snapshot.test.ts compares the result with the runtime query, so a field added to the
// snapshot later has to decide whether old studies get it.
//
// `studyId` narrows the backfill to one study for the unit test; the migration passes nothing.
export async function backfillCodeEnvSnapshot(db: Kysely<unknown>, studyId?: string): Promise<void> {
    const scope = studyId ? sql`WHERE study.id = ${studyId}::uuid` : sql``
    await sql`
        UPDATE study
        SET code_env_snapshot = (
            SELECT jsonb_build_object(
                'id', env.id,
                'identifier', env.identifier,
                'language', env.language,
                'dataSourceType', env.data_source_type,
                'url', env.url,
                'settings', env.settings,
                'commandLines', env.command_lines,
                'starterCodeFileNames', to_jsonb(env.starter_code_file_names),
                'sampleDataPath', env.sample_data_path
            )
            FROM org_code_env env
            WHERE env.org_id = study.org_id AND env.language = study.language AND NOT env.is_testing
            ORDER BY env.created_at DESC
            LIMIT 1
        )
        ${scope}
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('code_env_snapshot', 'jsonb').execute()
    await backfillCodeEnvSnapshot(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('code_env_snapshot').execute()
}
