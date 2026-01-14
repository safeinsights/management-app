import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'

const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())

const ORG_SLUGS = ['safe-insights', 'openstax']

export async function seed(db: Kysely<DB>): Promise<void> {
    // DO NOT RUN THIS IN PRODUCTION where NO_TESTING_DATA is set
    if (process.env.NO_TESTING_DATA) return

    for (const orgSlug of ORG_SLUGS) {
        // Create the enclave org
        await db
            .insertInto('org')
            .values({
                slug: orgSlug,
                name: titleize(orgSlug),
                email: 'contact@safeinsights.org',
                type: 'enclave' as const,
                settings: { publicKey: 'BAD KEY, UPDATE ME' },
            })
            .onConflict((oc) =>
                oc.column('slug').doUpdateSet((eb) => ({
                    slug: eb.ref('excluded.slug'),
                    name: eb.ref('excluded.name'),
                })),
            )
            .returningAll()
            .executeTakeFirstOrThrow()

        // Create the lab org
        await db
            .insertInto('org')
            .values({
                slug: `${orgSlug}-lab`,
                name: `${titleize(orgSlug)} Lab`,
                email: 'contact@safeinsights.org',
                type: 'lab' as const,
                settings: {},
            })
            .onConflict((oc) =>
                oc.column('slug').doUpdateSet((eb) => ({
                    slug: eb.ref('excluded.slug'),
                    name: eb.ref('excluded.name'),
                })),
            )
            .returningAll()
            .executeTakeFirstOrThrow()
    }
}
