import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Add the new column
    await db.schema
        .alterTable('study')
        .addColumn('submitted_by_org_id', 'uuid', (col) => col.references('org.id'))
        .execute()

    // Correlate existing studies with the lab associated with the enclave org_id (users could not submit to other orgs before this change)
    await sql`
        UPDATE study AS s
        SET submitted_by_org_id = lab.id
        FROM org AS enclave
        JOIN org AS lab ON  lab.slug = enclave.slug || '-lab'
        WHERE enclave.id = s.org_id
        AND s.submitted_by_org_id IS NULL;
        `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('submitted_by_org_id').execute()
}
