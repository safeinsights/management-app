import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'

const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())

// Fixed UUIDs so that concurrent CI runs sharing the same Clerk instance
// always produce identical publicMetadata and don't stomp on each other.
const ORGS: { slug: string; type: 'enclave' | 'lab'; id: string }[] = [
    { slug: 'safe-insights', type: 'enclave', id: '00000000-0000-0000-0000-000000000101' },
    { slug: 'safe-insights-lab', type: 'lab', id: '00000000-0000-0000-0000-000000000102' },
    { slug: 'openstax', type: 'enclave', id: '00000000-0000-0000-0000-000000000103' },
    { slug: 'openstax-lab', type: 'lab', id: '00000000-0000-0000-0000-000000000104' },
]

export async function seed(db: Kysely<DB>): Promise<void> {
    // DO NOT RUN THIS IN PRODUCTION where NO_TESTING_DATA is set
    if (process.env.NO_TESTING_DATA) return

    for (const org of ORGS) {
        const name = org.type === 'lab' ? `${titleize(org.slug.replace(/-lab$/, ''))} Lab` : titleize(org.slug)
        await db
            .insertInto('org')
            .values({
                id: org.id,
                slug: org.slug,
                name,
                email: 'contact@safeinsights.org',
                type: org.type,
                settings: org.type === 'enclave' ? { publicKey: 'BAD KEY, UPDATE ME' } : {},
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
