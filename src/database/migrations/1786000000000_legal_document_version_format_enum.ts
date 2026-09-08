import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('legal_document_format').asEnum(['markdown', 'pdf']).execute()

    await sql`
        ALTER TABLE legal_document_version
            ALTER COLUMN format TYPE legal_document_format
            USING format::legal_document_format
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE legal_document_version ALTER COLUMN format TYPE text`.execute(db)
    await db.schema.dropType('legal_document_format').execute()
}
