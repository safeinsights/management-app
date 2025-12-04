import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        UPDATE org_base_image
        SET env_vars = jsonb_build_object('environment', env_vars)
        WHERE env_vars IS NOT NULL
    `.execute(db)

    await db.schema.alterTable('org_base_image').renameColumn('env_vars', 'settings').execute()

    await db.schema
        .alterTable('org_base_image')
        .alterColumn('settings', (col) => col.setDefault(sql`'{"environment": []}'::jsonb`))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').renameColumn('settings', 'env_vars').execute()

    await sql`
        UPDATE org_base_image
        SET env_vars = env_vars->'environment'
        WHERE env_vars IS NOT NULL
    `.execute(db)

    await db.schema
        .alterTable('org_base_image')
        .alterColumn('env_vars', (col) => col.setDefault(sql`'[]'::jsonb`))
        .execute()
}
