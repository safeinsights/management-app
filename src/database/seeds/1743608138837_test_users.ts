import type { Kysely, Selectable } from 'kysely'
import type { DB, OrgUser, User } from '@/database/types'

// implement directly because this file is compiled and shouldn't import
const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key]
        }
    }
    return result
}

type AccountInfo = {
    clerkId: string
    firstName: string
    lastName: string
    email: string
    isAdmin?: boolean
    orgType?: 'enclave' | 'lab' | 'both'
}

const adminUser: AccountInfo = {
    clerkId: 'user_2x8iPxAfMZg5EJoZcrALjqXXEFD',
    firstName: 'Admin',
    lastName: 'Adminson',
    email: 'si-adm-tester-dbfyq3@mailinator.com',
    isAdmin: true,
}

const ACCOUNTS: Record<string, AccountInfo[]> = {
    'safe-insights': [adminUser],
    openstax: [
        adminUser,
        {
            clerkId: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
            firstName: 'Researchy',
            lastName: 'McPerson',
            email: 'si-research-tester-dbfyq3@mailinator.com',
            orgType: 'lab',
        },
        {
            clerkId: 'user_2xxt9CAEXzHV9rrMEDQ7UOQgK6Z',
            firstName: 'Mr Org',
            lastName: 'McOrgson',
            email: 'si-member-tester-dbfyq3@mailinator.com',
            orgType: 'enclave',
        },
    ],
}

export async function seed(db: Kysely<DB>): Promise<void> {
    // DO NOT RUN THIS IN PRODUCTION where NO_TESTING_DATA is set
    if (process.env.NO_TESTING_DATA) return

    for (const orgSlug of Object.keys(ACCOUNTS)) {
        // Create the enclave org
        const enclaveOrg = await db
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
        const labOrg = await db
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

        for (const userInfo of ACCOUNTS[orgSlug]) {
            const user = await findOrCreateUser(db, {
                ...pick(userInfo, ['clerkId', 'email', 'firstName', 'lastName']),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            // Add user to appropriate org based on their orgType
            if (userInfo.orgType === 'lab' || userInfo.orgType === 'both') {
                await findOrCreateOrgUser(db, {
                    isAdmin: userInfo.isAdmin || false,
                    orgId: labOrg.id,
                    userId: user.id,
                    joinedAt: new Date(),
                })
            }

            if (userInfo.orgType === 'enclave' || userInfo.orgType === 'both' || userInfo.isAdmin) {
                await findOrCreateOrgUser(db, {
                    isAdmin: userInfo.isAdmin || false,
                    orgId: enclaveOrg.id,
                    userId: user.id,
                    joinedAt: new Date(),
                })
            }
        }
    }
}

const findOrCreateUser = async (db: Kysely<DB>, values: Omit<Selectable<User>, 'id' | 'fullName'>) => {
    const user = await db.selectFrom('user').select(['id']).where('clerkId', '=', values.clerkId).executeTakeFirst()

    if (!user) {
        return await db.insertInto('user').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return user
}

const findOrCreateOrgUser = async (db: Kysely<DB>, values: Omit<Selectable<OrgUser>, 'id'>) => {
    const orgUser = await db
        .selectFrom('orgUser')
        .selectAll('orgUser')
        .where('orgId', '=', values.orgId)
        .where('userId', '=', values.userId)
        .executeTakeFirst()

    if (!orgUser) {
        return await db.insertInto('orgUser').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return orgUser
}
