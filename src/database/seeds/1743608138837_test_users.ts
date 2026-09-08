import type { DB } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { createHash } from 'node:crypto'

// Copy of tests/support/public_key.pem, embedded because the migrator Lambda runs this seed
// without a repo checkout. A unit test asserts it stays in sync.
export const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAnkxeGkXRU55i44S5KNoo
1XHRm97qKdKXKt2xK6+SZQgjpUZFOcObWP0jrQxunj63gxOsb+isaYm2C/rl4zAq
smh4BwG3VxgO2jQfwLWHaIMeJUSvaM1fOGLkaSyGWVPA0r4PwAkBZH+QrtW8Az/W
BupPZ9++TdpFy7eitH9dzdViZdZluVDaYcZ6OguF+Ed3IiFudBN1J4yDTAqzXHkr
Ad0lSG5d/k8ONBpHLs6gmaLuPHa/XQIQPxZ/Y6nFS1Dq+KJW8y6bCPPeJfdFVaxF
s7auem3FCKGvzuJeFKa3n+lMAnf3YeazF6nS3hcaTrxrLvsm282LdTFaRXrU60Ur
xXDT0GlBWiCnJwqIXZsWk6ta7zPl70pRNM/zymgJlJsA5w5laapFqGVljClkGrzt
k3HLd54Z5M4CJG+10sVC6mmXJHaqmGU4cdqTC235vmjOZGz8xzitXi3caAnQNKhw
R+A2jpGE+oUAethwMhlo2+6PjXOcKk4ALLbgKZnBLMo8USr168+o3Qvb7MsI+E4f
p8qFdnFg4jKe8JyAafRMUOENG9+LxskQsXVi8jDGIhKf6Ix+ubjr+J4E6CBJcTDG
9RIOYiaKBhLQ4Z3EFynKBYjMA48N9LLREiBb25BX8XKRGoFT5ezP2gQgCzrlAQh6
UdB9nPRag5tVlOVm412S8aUCAwEAAQ==
-----END PUBLIC KEY-----`

const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())

// Fixed UUIDs so concurrent CI runs sharing a Clerk instance don't stomp on each other.
const ORGS: { slug: string; type: 'enclave' | 'lab'; id: string }[] = [
    { slug: 'safe-insights', type: 'enclave', id: '00000000-0000-4000-8000-000000000101' },
    { slug: 'safe-insights-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000102' },
    { slug: 'openstax', type: 'enclave', id: '00000000-0000-4000-8000-000000000103' },
    { slug: 'openstax-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000104' },
    { slug: 'single-lang-r-enclave', type: 'enclave', id: '00000000-0000-4000-8000-000000000105' },
    { slug: 'reviewer-is-org-admin', type: 'enclave', id: '00000000-0000-4000-8000-000000000106' },
]

type TestUserRole = 'admin' | 'researcher' | 'reviewer'

// Keyed by `key` rather than role so multiple users can share a role.
type TestUser = { key: string; role: TestUserRole; id: string; email: string }

const TEST_USERS: TestUser[] = [
    { key: 'admin', role: 'admin', id: '00000000-0000-4000-8000-000000000001', email: 'si-adm-tester-dbfyq3@mailinator.com' }, // prettier-ignore
    { key: 'researcher', role: 'researcher', id: '00000000-0000-4000-8000-000000000002', email: 'si-research-tester-dbfyq3@mailinator.com' }, // prettier-ignore
    { key: 'reviewer', role: 'reviewer', id: '00000000-0000-4000-8000-000000000003', email: 'si-member-tester-dbfyq3@mailinator.com' }, // prettier-ignore

    // Owned by the legal-acknowledgement e2e spec: ToS/PN are globally scoped, so this user exists
    // to be left un-acknowledged without blocking any other spec's role.
    { key: 'legal', role: 'researcher', id: '00000000-0000-4000-8000-000000000004', email: 'si-legal-tester-dbfyq3@mailinator.com' }, // prettier-ignore

    // Persistent QA accounts that already exist in Clerk, so the clerkId here is a placeholder:
    // user-sync reconciles the real one by email on first login.
    { key: 'qa-admin', role: 'admin', id: '00000000-0000-4000-8000-000000000011', email: 'qa-review+admin@safeinsights.org' }, // prettier-ignore
    { key: 'qa-dp', role: 'reviewer', id: '00000000-0000-4000-8000-000000000012', email: 'qa-review+dp@safeinsights.org' }, // prettier-ignore
    { key: 'qa-researcher', role: 'researcher', id: '00000000-0000-4000-8000-000000000013', email: 'qa-review+researcher@safeinsights.org' }, // prettier-ignore
]

const ORG_MEMBERSHIPS_BY_ROLE: Record<TestUserRole, { slug: string; isAdmin: boolean }[]> = {
    admin: [
        { slug: 'safe-insights', isAdmin: true },
        { slug: 'openstax', isAdmin: true },
        { slug: 'openstax-lab', isAdmin: true },
    ],
    researcher: [{ slug: 'openstax-lab', isAdmin: false }],
    reviewer: [
        { slug: 'openstax', isAdmin: false },
        { slug: 'reviewer-is-org-admin', isAdmin: true },
    ],
}

export async function seed(db: Kysely<DB>): Promise<void> {
    // READ BEFORE EDITING. This seed writes publicly-known credentials and admin memberships on
    // real org slugs, and it once ran against production behind a guard nothing ever set. Both
    // opt-IN checks below must keep failing closed, and must stay inline process.env reads: a CJS
    // dependency crashes the esbuild ESM bundle the migrator Lambda runs seeds from, which is why
    // bin/lib/testing-data-gate.ts is duplicated rather than imported. No migration or seed may
    // create the safe-insights org in production; bootstrap it by logging in a Clerk admin.
    if (process.env.ALLOW_TESTING_DATA !== 'TRUE') {
        console.warn('Skipping test data seed: ALLOW_TESTING_DATA=TRUE is not set.')
        return
    }

    // NODE_ENV is deliberately not consulted: it is 'production' in every Next production build,
    // including non-production deployed environments.
    const envName = (process.env.ENVIRONMENT_ID || '').toLowerCase()
    if (envName === 'production' || envName === 'prod') {
        console.warn('Refusing to seed test data into a production environment.')
        return
    }

    // Existing deployments may hold these slugs under different, random ids, and onConflict cannot
    // change a primary key, so child rows must use whatever id the DB returns.
    const orgIdBySlug = new Map<string, string>()

    for (const org of ORGS) {
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

        // Empty rather than a placeholder public key, which would leave a real enclave unable to
        // receive encrypted results.
        const settings = {}

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

    // Matched by id OR lower(email) because deployments may hold these emails under pre-fixed-UUID
    // ids, and inserting would hit the unique `user_email_lower_unique` index.
    const userIdByKey = new Map<string, string>()

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
            userIdByKey.set(user.key, existing.id)
        } else {
            await db
                .insertInto('user')
                .values({
                    id: user.id,
                    clerkId: `test-clerk-${user.key}`,
                    firstName,
                    lastName: 'User',
                    email: user.email,
                })
                .execute()
            userIdByKey.set(user.key, user.id)
        }
    }

    for (const user of TEST_USERS) {
        const userId = userIdByKey.get(user.key)!

        for (const membership of ORG_MEMBERSHIPS_BY_ROLE[user.role]) {
            const orgId = orgIdBySlug.get(membership.slug)!

            const existing = await db
                .selectFrom('orgUser')
                .select('id')
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

    // Inlined from si-encryption's pemToArrayBuffer/fingerprintKeyData: importing that package
    // pulls in `debug`, whose CJS require('tty') crashes the migrator Lambda's esbuild ESM bundle.
    // The format (hex SHA-256 over SPKI DER) must stay in sync with si-encryption.
    const publicKeyDer = Buffer.from(TEST_PUBLIC_KEY_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
    const fingerprint = createHash('sha256').update(publicKeyDer).digest('hex')

    for (const user of TEST_USERS) {
        const userId = userIdByKey.get(user.key)!

        const existing = await db
            .selectFrom('userPublicKey')
            .select('id')
            .where('userId', '=', userId)
            .executeTakeFirst()
        if (existing) continue

        await db
            .insertInto('userPublicKey')
            .values({
                userId,
                publicKey: publicKeyDer,
                fingerprint,
            })
            .execute()
    }
}
