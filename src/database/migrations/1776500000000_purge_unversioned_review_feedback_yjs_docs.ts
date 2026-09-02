import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        DELETE FROM yjs_document
        WHERE name ~* '^review-feedback-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `.execute(db)
}

export async function down(): Promise<void> {
    // Irreversible: the deleted Yjs scratchpad rows belong to a code path no live writer emits.
}
