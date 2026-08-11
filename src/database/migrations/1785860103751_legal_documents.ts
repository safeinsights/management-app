import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema.createType('legal_document_type').asEnum(['tos', 'pn', 'ropa', 'dopa', 'sla']).execute()

    await db.schema
        .createTable('legal_document')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('type', sql`legal_document_type`, (col) => col.notNull())
        // An sla stores only study_id: its orgs already live on study (org_id = Data Partner,
        // submitted_by_org_id = Research Lab), so copies here could drift.
        .addColumn('org_id', 'uuid', (col) => col.references('org.id'))
        .addColumn('study_id', 'uuid', (col) => col.references('study.id'))
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addCheckConstraint(
            'legal_document_scope_matches_type',
            sql`(type IN ('tos','pn') AND org_id IS NULL AND study_id IS NULL)
             OR (type IN ('ropa','dopa') AND org_id IS NOT NULL AND study_id IS NULL)
             OR (type = 'sla' AND study_id IS NOT NULL AND org_id IS NULL)`,
        )
        .execute()

    // NULLS NOT DISTINCT (PG 15+) is required: by default Postgres treats NULLs as distinct, so a
    // plain UNIQUE would allow duplicate ('tos', NULL, NULL) rows.
    await sql`
        ALTER TABLE legal_document
        ADD CONSTRAINT legal_document_scope_unique
        UNIQUE NULLS NOT DISTINCT (type, org_id, study_id)
    `.execute(db)

    await db.schema
        .createTable('legal_document_version')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('legal_document_id', 'uuid', (col) => col.notNull().references('legal_document.id'))
        .addColumn('version_number', 'integer')
        // The key is the version's uuid, so the admin's original filename has nowhere else to live
        // and is kept here for display.
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('file_name', 'text', (col) => col.notNull())
        .addColumn('format', 'text', (col) => col.notNull())
        // Null published_at means draft. Published rows are immutable so an acknowledgement always
        // points at the exact bytes the user agreed to; corrections ship as a new version.
        .addColumn('published_at', 'timestamptz')
        .addColumn('published_by', 'uuid', (col) => col.references('user.id'))
        // Admin-entered day of an out-of-app signature. `date` not timestamptz so it can't render a
        // day early west of the stored zone; dialect.ts parses OID 1082 as the raw string.
        .addColumn('signed_at', 'date')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('legal_document_version_number_unique', ['legal_document_id', 'version_number'])
        // All three are set together on publish, so no read path has to handle a half-published row.
        .addCheckConstraint(
            'legal_document_version_draft_or_published',
            sql`(published_at IS NULL AND published_by IS NULL AND version_number IS NULL)
             OR (published_at IS NOT NULL AND published_by IS NOT NULL AND version_number IS NOT NULL)`,
        )
        .execute()

    // One outstanding draft per document, so a second upload replaces it rather than racing it.
    await sql`
        CREATE UNIQUE INDEX legal_document_single_draft
        ON legal_document_version (legal_document_id)
        WHERE published_at IS NULL
    `.execute(db)

    // Ordered by version_number, not published_at: every current-version read is a distinctOn
    // keyed on the document ordering by version_number DESC.
    await sql`
        CREATE INDEX legal_document_version_current
        ON legal_document_version (legal_document_id, version_number DESC)
    `.execute(db)

    // These rows are the compliance evidence. Who is *required* to acknowledge is derived from
    // membership rather than stored, since a stored audience would drift.
    await db.schema
        .createTable('legal_document_acknowledgement')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('legal_document_version_id', 'uuid', (col) => col.notNull().references('legal_document_version.id'))
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('acked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('legal_document_acknowledgement_unique', ['legal_document_version_id', 'user_id'])
        .execute()

    await db.schema
        .createIndex('legal_document_acknowledgement_user')
        .on('legal_document_acknowledgement')
        .column('user_id')
        .execute()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('legal_document_acknowledgement').execute()
    await db.schema.dropTable('legal_document_version').execute()
    await db.schema.dropTable('legal_document').execute()
    await db.schema.dropType('legal_document_type').execute()
}
