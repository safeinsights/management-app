import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('claude_context').renameTo('agent_context').execute()
    await sql`ALTER TABLE agent_context RENAME CONSTRAINT claude_context_name_org_id_unique TO agent_context_name_org_id_unique`.execute(
        db,
    )
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE agent_context RENAME CONSTRAINT agent_context_name_org_id_unique TO claude_context_name_org_id_unique`.execute(
        db,
    )
    await db.schema.alterTable('agent_context').renameTo('claude_context').execute()
}
