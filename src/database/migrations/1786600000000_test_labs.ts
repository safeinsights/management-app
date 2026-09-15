import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    // The pair, not the lab: the same research lab can be a test lab for one data partner and owe
    // agreements to another.
    await db.schema
        .createTable('org_test_lab')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('data_partner_id', 'uuid', (col) => col.notNull().references('org.id'))
        .addColumn('research_lab_id', 'uuid', (col) => col.notNull().references('org.id'))
        // Null where a seed wrote the designation rather than a signed-in admin.
        .addColumn('created_by_user_id', 'uuid', (col) => col.references('user.id'))
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('org_test_lab_pair_unique', ['data_partner_id', 'research_lab_id'])
        .addCheckConstraint('org_test_lab_distinct_orgs', sql`data_partner_id <> research_lab_id`)
        .execute()

    // Stamped when the study is created, never derived from the pair: designating a lab must not
    // retroactively exempt a study that already carries a signed agreement.
    await db.schema
        .alterTable('study')
        .addColumn('is_test_study', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('is_test_study').execute()
    await db.schema.dropTable('org_test_lab').execute()
}
