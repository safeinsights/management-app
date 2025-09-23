import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema.createType('org_type').asEnum(['enclave', 'lab']).execute()

    // Add the type column with default 'enclave'
    await db.schema
        .alterTable('org')
        .addColumn('type', sql`org_type`, (col) => col.defaultTo('enclave').notNull())
        .execute()

    // Add the settings JSONB column
    await db.schema
        .alterTable('org')
        .addColumn('settings', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`).notNull())
        .execute()

    // Migrate existing publicKey values into settings for enclave orgs
    await sql`
    UPDATE org
    SET settings = jsonb_build_object('publicKey', public_key)
    ,type = 'enclave'
    `.execute(db)

    // Now we can drop the public_key column since it's moved to settings
    await db.schema.alterTable('org').dropColumn('public_key').execute()

    // For each existing org (which are all enclaves now), create a corresponding lab org
    const existingOrgs = await db.selectFrom('org').selectAll('org').execute()

    for (const org of existingOrgs) {
        const labSlug = `${org.slug}-lab`
        const labName = `${org.name} Lab`

        // Create the lab org
        const labOrg = await db
            .insertInto('org')
            .values({
                slug: labSlug,
                name: labName,
                email: org.email,
                type: 'lab' as const,
                settings: {},
                description: org.description,
            })
            .returning('id')
            .executeTakeFirst()

        if (!labOrg) {
            throw new Error(`Failed to create lab org for ${org.slug}`)
        }

        // Get all users for this org
        const orgUsers = await db.selectFrom('orgUser').selectAll('orgUser').where('orgId', '=', org.id).execute()

        for (const orgUser of orgUsers) {
            if (!orgUser.isAdmin && !orgUser.isReviewer) {
                db.deleteFrom('orgUser').where('id', '=', orgUser.id).execute()
            }

            if (orgUser.isResearcher) {
                await db
                    .insertInto('orgUser')
                    .values({
                        userId: orgUser.userId,
                        orgId: labOrg.id,
                        isAdmin: orgUser.isAdmin,
                    })
                    .execute()
            }
        }
    }

    // Now remove isResearcher and isReviewer columns from orgUser table
    await db.schema.alterTable('pendingUser').dropColumn('is_reviewer').execute()
    await db.schema.alterTable('pendingUser').dropColumn('is_researcher').execute()

    await db.schema.alterTable('orgUser').dropColumn('is_researcher').execute()
    await db.schema.alterTable('orgUser').dropColumn('is_reviewer').execute()
}

export async function down(_: Kysely<unknown>): Promise<void> {
    throw new Error('irreverisible migration, change is too complex to attempt')
}
