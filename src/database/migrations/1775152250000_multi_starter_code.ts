import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_code_env')
        .addColumn('command_lines', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('starter_code_file_names', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
        .execute()

    await sql`
        UPDATE org_code_env SET
            command_lines = jsonb_build_object(
                CASE WHEN language::text = 'R' THEN 'r' WHEN language::text = 'PYTHON' THEN 'py' END,
                cmd_line
            ),
            starter_code_file_names = ARRAY[regexp_replace(starter_code_path, '^.*/', '')]
    `.execute(db)

    await db.schema.alterTable('org_code_env').dropColumn('cmd_line').dropColumn('starter_code_path').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_code_env')
        .addColumn('cmd_line', 'text')
        .addColumn('starter_code_path', 'text')
        .execute()

    await sql`
        UPDATE org_code_env SET
            cmd_line = COALESCE(command_lines ->> (
                CASE WHEN language::text = 'R' THEN 'r' WHEN language::text = 'PYTHON' THEN 'py' END
            ), ''),
            starter_code_path = COALESCE(starter_code_file_names[1], '')
    `.execute(db)

    await sql`
        ALTER TABLE org_code_env
            ALTER COLUMN cmd_line SET NOT NULL,
            ALTER COLUMN starter_code_path SET NOT NULL
    `.execute(db)

    await db.schema
        .alterTable('org_code_env')
        .dropColumn('command_lines')
        .dropColumn('starter_code_file_names')
        .execute()
}
