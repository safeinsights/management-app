import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema.createType('legal_document_type').asEnum(['tos', 'pn', 'ropa', 'dopa', 'sla']).execute()

    await db.schema
        .createTable('legal_document')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('type', sql`legal_document_type`, (col) => col.notNull())
        // Scope columns: tos/pn are global, ropa/dopa are org-wide, sla is per-study.
        // An SLA stores only study_id because both of its orgs already live on the study —
        // study.submitted_by_org_id is the Research Lab and study.org_id is the Data Partner —
        // so storing copies here would only give them a chance to drift.
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

    // NULLS NOT DISTINCT is load-bearing, not decoration: Postgres treats NULLs as distinct by
    // default, so a plain UNIQUE would allow unlimited ('tos', NULL, NULL) rows — exactly what
    // this constraint exists to prevent. Requires PG >= 15; we run 16.
    await sql`
        ALTER TABLE legal_document
        ADD CONSTRAINT legal_document_scope_unique
        UNIQUE NULLS NOT DISTINCT (type, org_id, study_id)
    `.execute(db)

    await db.schema
        .createTable('legal_document_version')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('legal_document_id', 'uuid', (col) => col.notNull().references('legal_document.id'))
        // Assigned as max+1 when the version is published, so it stays null while a draft.
        .addColumn('version_number', 'integer')
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('format', 'text', (col) => col.notNull())
        // A null published_at means draft. Once published the row is immutable: corrections ship
        // as a new version so an acknowledgement always points at the exact bytes the user agreed
        // to, and the SI admin's "this cannot be undone" promise holds.
        .addColumn('published_at', 'timestamptz')
        .addColumn('published_by', 'uuid', (col) => col.references('user.id'))
        // The calendar day a signatory signed outside the app (Zoho), typed in by an SI admin.
        // Distinct from published_at, which is when it went live here, and can predate it by days.
        // Deliberately `date` rather than timestamptz: a signing day carries no time-of-day or
        // zone, and storing it as an instant would render as the previous day for viewers west of
        // the stored zone. Unused by tos/pn, which have no signatory.
        //
        // NOTE for whoever first surfaces this in the UI (SHRMP-276/277): this is the repo's only
        // `date` column and there are no custom pg type parsers, so node-postgres parses it into a
        // JS Date at the server's local midnight — calling toISOString() on that reintroduces the
        // off-by-one-day bug this column type was chosen to avoid. Register a parser for OID 1082
        // that returns the raw 'YYYY-MM-DD' string, or format it without going through Date.
        .addColumn('signed_at', 'date')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('legal_document_version_number_unique', ['legal_document_id', 'version_number'])
        // Publishing sets published_at, published_by and version_number together, so a row is
        // either wholly a draft or wholly published. Encoding that here rules out half-published
        // rows (a version_number with no published_at, say) that every read path would then have
        // to defend against.
        .addCheckConstraint(
            'legal_document_version_draft_or_published',
            sql`(published_at IS NULL AND published_by IS NULL AND version_number IS NULL)
             OR (published_at IS NOT NULL AND published_by IS NOT NULL AND version_number IS NOT NULL)`,
        )
        .execute()

    // At most one unpublished draft per document, so "upload → review → publish" is unambiguous
    // and a second upload replaces the pending draft rather than racing it.
    await sql`
        CREATE UNIQUE INDEX legal_document_single_draft
        ON legal_document_version (legal_document_id)
        WHERE published_at IS NULL
    `.execute(db)

    // Serves the hot "what is the current version of this document" lookup.
    await sql`
        CREATE INDEX legal_document_version_current
        ON legal_document_version (legal_document_id, published_at DESC)
    `.execute(db)

    // The existence of a row here is the compliance evidence that a user agreed to a specific
    // version. Who is *required* to acknowledge is deliberately not stored — it is derived from
    // org/study membership, which would otherwise drift as people join and leave.
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
