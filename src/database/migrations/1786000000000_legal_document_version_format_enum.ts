import { type Kysely, sql } from 'kysely'

// format was created as plain text in 1785860103751, while its sibling column `type` in the same
// table got a native enum (legal_document_type). The value is an enum in the app — every write is
// legalDocumentFormats[type], only ever 'markdown' or 'pdf' — so the text column let an invalid
// format reach the row and forced a cast on every read. Promote it to a real enum so the constraint
// lives in the database and the generated types carry LegalDocumentFormat through to callers.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('legal_document_format').asEnum(['markdown', 'pdf']).execute()

    // Existing rows only ever hold 'markdown'/'pdf', so the cast succeeds for all of them.
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
