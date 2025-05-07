import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('audit').addColumn('metadata', 'jsonb').execute()

    await sql`alter type audit_record_type add value 'USER'`.execute(db)

    await sql`alter type audit_event_type add value 'LOGGED_IN'`.execute(db)
    await sql`alter type audit_event_type add value 'INVITED'`.execute(db)
    await sql`alter type audit_event_type add value 'ACCEPTED_INVITE'`.execute(db)
    await sql`alter type audit_event_type add value 'RESET_PASSWORD'`.execute(db)
    await sql`alter type audit_event_type add value 'CREATED'`.execute(db)
    await sql`alter type audit_event_type add value 'UPDATED'`.execute(db)
    await sql`alter type audit_event_type add value 'DELETED'`.execute(db)
}

export async function down(): Promise<void> {
    throw new Error('irreverisible migration, enum values cannot be removed')
}
