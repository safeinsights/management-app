import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    // The pair, not the lab: the same research lab can be a test lab for one data partner and owe
    // agreements to another.
    await db.schema
        .createTable('org_test_lab')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        // Cascade: a designation has no meaning once either org is gone.
        .addColumn('data_partner_id', 'uuid', (col) => col.notNull().references('org.id').onDelete('cascade'))
        .addColumn('research_lab_id', 'uuid', (col) => col.notNull().references('org.id').onDelete('cascade'))
        // The designation is the data partner's, not this admin's, so it outlives their account.
        .addColumn('created_by_user_id', 'uuid', (col) => col.references('user.id').onDelete('set null'))
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('org_test_lab_pair_unique', ['data_partner_id', 'research_lab_id'])
        .addCheckConstraint('org_test_lab_distinct_orgs', sql`data_partner_id <> research_lab_id`)
        .execute()

    // Stamped at creation, never derived: a designation applies to future studies only, so the
    // answer depends on when the study was made rather than on the pair as it stands today.
    await db.schema
        .alterTable('study')
        .addColumn('is_test_study', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute()

    // The personal legal page looks up a member's test studies across both party columns, which
    // rules out either single-column index. Partial because test studies stay a small minority.
    await sql`
        CREATE INDEX study_test_study_parties_indx
        ON study (org_id, submitted_by_org_id)
        WHERE is_test_study AND deleted_at IS NULL
    `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX study_test_study_parties_indx`.execute(db)
    await db.schema.alterTable('study').dropColumn('is_test_study').execute()
    await db.schema.dropTable('org_test_lab').execute()
}
