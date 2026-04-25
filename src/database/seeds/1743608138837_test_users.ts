import type { DB } from '@/database/types'
import { sql, type Kysely } from 'kysely'

const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())

// Fixed UUIDs so that concurrent CI runs sharing the same Clerk instance
// always produce identical publicMetadata and don't stomp on each other.
const ORGS: { slug: string; type: 'enclave' | 'lab'; id: string }[] = [
    { slug: 'safe-insights', type: 'enclave', id: '00000000-0000-4000-8000-000000000101' },
    { slug: 'safe-insights-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000102' },
    { slug: 'openstax', type: 'enclave', id: '00000000-0000-4000-8000-000000000103' },
    { slug: 'openstax-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000104' },
    { slug: 'single-lang-r-enclave', type: 'enclave', id: '00000000-0000-4000-8000-000000000105' },
    { slug: 'reviewer-is-org-admin', type: 'enclave', id: '00000000-0000-4000-8000-000000000106' },
]

const TEST_USERS = [
    { role: 'admin', id: '00000000-0000-4000-8000-000000000001', email: 'si-adm-tester-dbfyq3@mailinator.com' },
    {
        role: 'researcher',
        id: '00000000-0000-4000-8000-000000000002',
        email: 'si-research-tester-dbfyq3@mailinator.com',
    },
    {
        role: 'reviewer',
        id: '00000000-0000-4000-8000-000000000003',
        email: 'si-member-tester-dbfyq3@mailinator.com',
    },
] as const

type TestUserRole = (typeof TEST_USERS)[number]['role']

const ORG_MEMBERSHIPS: { role: TestUserRole; slug: string; isAdmin: boolean }[] = [
    { role: 'admin', slug: 'openstax', isAdmin: true },
    { role: 'admin', slug: 'openstax-lab', isAdmin: true },
    { role: 'researcher', slug: 'openstax-lab', isAdmin: false },
    { role: 'reviewer', slug: 'openstax', isAdmin: false },
    { role: 'reviewer', slug: 'reviewer-is-org-admin', isAdmin: true },
]

export async function seed(db: Kysely<DB>): Promise<void> {
    if (process.env.NO_TESTING_DATA) return

    // Upsert orgs and capture the actual persisted id for each slug.
    // Existing deployments may already have rows for these slugs with
    // different (random) ids — the onConflict update cannot change the
    // primary key, so we must use whatever id the DB returns when
    // inserting child rows below.
    const orgIdBySlug = new Map<string, string>()

    for (const org of ORGS) {
        const isEnclave = org.type === 'enclave'
        const name =
            org.slug === 'single-lang-r-enclave'
                ? 'Single-Lang R Enclave'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'Reviewer Admin Enclave'
                  : org.type === 'lab'
                    ? `${titleize(org.slug.replace(/-lab$/, ''))} Lab`
                    : titleize(org.slug)

        const email =
            org.slug === 'single-lang-r-enclave'
                ? 'single-lang-r-enclave@example.com'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'reviewer-admin-enclave@example.com'
                  : 'contact@safeinsights.org'

        const description =
            org.slug === 'single-lang-r-enclave'
                ? 'Test-only enclave with R as the single supported language'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'Enclave where the reviewer is an admin'
                  : null

        const settings = isEnclave ? { publicKey: 'BAD KEY, UPDATE ME' } : {}

        const persisted = await db
            .insertInto('org')
            .values({ id: org.id, slug: org.slug, name, email, type: org.type, settings, description })
            .onConflict((oc) =>
                oc.column('slug').doUpdateSet((eb) => ({
                    slug: eb.ref('excluded.slug'),
                    name: eb.ref('excluded.name'),
                })),
            )
            .returning('id')
            .executeTakeFirstOrThrow()

        orgIdBySlug.set(org.slug, persisted.id)
    }

    // Code environments for openstax
    const openstaxId = orgIdBySlug.get('openstax')!
    const existingOpenstaxEnvs = await db.selectFrom('orgCodeEnv').where('orgId', '=', openstaxId).execute()

    if (existingOpenstaxEnvs.length === 0) {
        await db
            .insertInto('orgCodeEnv')
            .values([
                {
                    orgId: openstaxId,
                    name: 'R Code Environment',
                    identifier: 'r-base',
                    language: 'R',
                    url: 'public.ecr.aws/docker/library/r-base:latest',
                    commandLines: { r: 'Rscript main.r' },
                    starterCodeFileNames: ['main.r'],
                    isTesting: false,
                },
                {
                    orgId: openstaxId,
                    name: 'Python Code Environment',
                    identifier: 'python-base',
                    language: 'PYTHON',
                    url: 'public.ecr.aws/docker/library/python:latest',
                    commandLines: { py: 'python main.py' },
                    starterCodeFileNames: ['main.py'],
                    isTesting: false,
                },
            ])
            .execute()
    }

    // Data sources for openstax
    const existingDataSources = await db.selectFrom('orgDataSource').where('orgId', '=', openstaxId).execute()

    if (existingDataSources.length === 0) {
        const codeEnv = await db
            .selectFrom('orgCodeEnv')
            .select('id')
            .where('orgId', '=', openstaxId)
            .executeTakeFirstOrThrow()

        const dataSources = await db
            .insertInto('orgDataSource')
            .values([
                { orgId: openstaxId, name: 'Student Activity Logs' },
                { orgId: openstaxId, name: 'Course Enrollment Data' },
            ])
            .returning('id')
            .execute()

        await db
            .insertInto('orgDataSourceCodeEnv')
            .values(dataSources.map((ds) => ({ dataSourceId: ds.id, codeEnvId: codeEnv.id })))
            .execute()
    }

    // Code environment for single-lang-r-enclave
    const singleLangId = orgIdBySlug.get('single-lang-r-enclave')!
    const existingSingleLangEnvs = await db.selectFrom('orgCodeEnv').where('orgId', '=', singleLangId).execute()

    if (existingSingleLangEnvs.length === 0) {
        await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: singleLangId,
                name: 'R Code Environment (Single-Lang)',
                identifier: 'r-base',
                language: 'R',
                url: 'public.ecr.aws/docker/library/r-base:latest',
                commandLines: { r: 'Rscript main.r' },
                starterCodeFileNames: ['main.r'],
                isTesting: false,
            })
            .execute()
    }

    // Find-or-create test users. Existing deployments may have rows with
    // these emails but different (pre-fixed-UUID) ids — match by id OR by
    // lower(email) so we update in place instead of hitting the unique
    // `user_email_lower_unique` index.
    const userIdByRole = new Map<TestUserRole, string>()

    for (const user of TEST_USERS) {
        const firstName = `Test ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`

        const existing = await db
            .selectFrom('user')
            .select('id')
            .where((eb) => eb.or([eb('id', '=', user.id), eb(sql`lower(email)`, '=', user.email.toLowerCase())]))
            .executeTakeFirst()

        if (existing) {
            await db
                .updateTable('user')
                .set({ firstName, lastName: 'User', email: user.email })
                .where('id', '=', existing.id)
                .execute()
            userIdByRole.set(user.role, existing.id)
        } else {
            await db
                .insertInto('user')
                .values({
                    id: user.id,
                    clerkId: `test-clerk-${user.role}`,
                    firstName,
                    lastName: 'User',
                    email: user.email,
                })
                .execute()
            userIdByRole.set(user.role, user.id)
        }
    }

    // Org memberships
    for (const membership of ORG_MEMBERSHIPS) {
        const userId = userIdByRole.get(membership.role)!
        const orgId = orgIdBySlug.get(membership.slug)!

        const existing = await db
            .selectFrom('orgUser')
            .where('userId', '=', userId)
            .where('orgId', '=', orgId)
            .executeTakeFirst()

        if (existing) {
            await db
                .updateTable('orgUser')
                .set({ isAdmin: membership.isAdmin })
                .where('userId', '=', userId)
                .where('orgId', '=', orgId)
                .execute()
        } else {
            await db.insertInto('orgUser').values({ userId, orgId, isAdmin: membership.isAdmin }).execute()
        }
    }
}
