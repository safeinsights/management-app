import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`alter type audit_record_type add value 'USER'`.execute(db)
    await sql`alter type audit_event_type add value 'LOGIN'`.execute(db)
    await sql`alter type audit_event_type add value 'INVITED'`.execute(db)
    await sql`alter type audit_event_type add value 'ACCEPT_INVITE'`.execute(db)
    await sql`alter type audit_event_type add value 'RESET_PASSWORD'`.execute(db)

    await sql`alter type audit_event_type add value 'CREATED'`.execute(db)
}

export async function down(): Promise<void> {
    throw new Error('irreverisible migration, enum values cannot be removed')
}
