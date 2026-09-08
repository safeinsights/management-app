import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema.createType('org_type').asEnum(['enclave', 'lab']).execute()

    await db.schema
        .alterTable('org')
        .addColumn('type', sql`org_type`, (col) => col.defaultTo('enclave').notNull())
        .execute()

    await db.schema
        .alterTable('org')
        .addColumn('settings', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`).notNull())
        .execute()

    await sql`
    UPDATE org
    SET settings = jsonb_build_object('publicKey', public_key)
    ,type = 'enclave'
    `.execute(db)

    await db.schema.alterTable('org').dropColumn('public_key').execute()

    const existingOrgs = await db.selectFrom('org').selectAll('org').execute()

    await db.schema
        .alterTable('orgUser')
        .alterColumn('is_reviewer', (col) => col.dropNotNull())
        .execute()
    await db.schema
        .alterTable('orgUser')
        .alterColumn('is_researcher', (col) => col.dropNotNull())
        .execute()

    for (const org of existingOrgs) {
        const labSlug = `${org.slug}-lab`
        const labName = `${org.name} Lab`

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

        const orgUsers = await db.selectFrom('orgUser').selectAll('orgUser').where('orgId', '=', org.id).execute()

        for (const orgUser of orgUsers) {
            if (!orgUser.isAdmin && !orgUser.isReviewer) {
                await db.deleteFrom('orgUser').where('id', '=', orgUser.id).execute()
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

    await db.schema.alterTable('pendingUser').dropColumn('is_reviewer').execute()
    await db.schema.alterTable('pendingUser').dropColumn('is_researcher').execute()

    await db.schema.alterTable('orgUser').dropColumn('is_researcher').execute()
    await db.schema.alterTable('orgUser').dropColumn('is_reviewer').execute()
}

export async function down(_: Kysely<unknown>): Promise<void> {
    throw new Error('irreverisible migration, change is too complex to attempt')
}
