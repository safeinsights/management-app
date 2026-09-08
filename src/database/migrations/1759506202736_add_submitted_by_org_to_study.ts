import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('submitted_by_org_id', 'uuid', (col) => col.references('org.id'))
        .execute()

    // Before this change users could only submit to their own org, so the enclave's paired lab is
    // always the submitter.
    await sql`
        UPDATE study AS s
        SET submitted_by_org_id = lab.id
        FROM org AS enclave
        JOIN org AS lab ON  lab.slug = enclave.slug || '-lab'
        WHERE enclave.id = s.org_id
        AND s.submitted_by_org_id IS NULL;
        `.execute(db)

    await sql`
	    UPDATE study
	    SET submitted_by_org_id = org_id
	    WHERE submitted_by_org_id IS NULL;
	`.execute(db)

    await sql`ALTER TABLE study ALTER COLUMN submitted_by_org_id SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('submitted_by_org_id').execute()
}
