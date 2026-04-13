import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readTestSupportFile(file: string): string {
    return fs.readFileSync(path.join(__dirname, '../../../tests/support', file), 'utf8')
}

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
    { role: 'admin', id: '00000000-0000-4000-8000-000000000001' },
    { role: 'researcher', id: '00000000-0000-4000-8000-000000000002' },
    { role: 'reviewer', id: '00000000-0000-4000-8000-000000000003' },
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

    const pubKeyStr = readTestSupportFile('public_key.pem')
    const fingerprint = readTestSupportFile('public_key.sig').trim()
    const pubKeyBuffer = Buffer.from(pemToArrayBuffer(pubKeyStr))

    // Upsert orgs
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

        const settings = isEnclave ? { publicKey: pubKeyStr } : {}

        await db
            .insertInto('org')
            .values({ id: org.id, slug: org.slug, name, email, type: org.type, settings, description })
            .onConflict((oc) =>
                oc.column('slug').doUpdateSet((eb) => ({
                    slug: eb.ref('excluded.slug'),
                    name: eb.ref('excluded.name'),
                })),
            )
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    // Code environments for openstax
    const openstaxId = ORGS.find((o) => o.slug === 'openstax')!.id
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
    const singleLangId = ORGS.find((o) => o.slug === 'single-lang-r-enclave')!.id
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

    // Upsert test users
    for (const user of TEST_USERS) {
        const firstName = `Test ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`

        await db
            .insertInto('user')
            .values({
                id: user.id,
                clerkId: `test-clerk-${user.role}`,
                firstName,
                lastName: 'User',
                email: `test-${user.role}@safeinsights.org`,
            })
            .onConflict((oc) =>
                oc.column('id').doUpdateSet((eb) => ({
                    firstName: eb.ref('excluded.firstName'),
                    lastName: eb.ref('excluded.lastName'),
                    email: eb.ref('excluded.email'),
                })),
            )
            .execute()
    }

    // Public keys for admin and reviewer
    for (const user of TEST_USERS.filter((u) => u.role === 'admin' || u.role === 'reviewer')) {
        const existing = await db.selectFrom('userPublicKey').where('userId', '=', user.id).executeTakeFirst()

        if (!existing) {
            await db
                .insertInto('userPublicKey')
                .values({ fingerprint, userId: user.id, publicKey: pubKeyBuffer })
                .execute()
        }
    }

    // Org memberships
    for (const membership of ORG_MEMBERSHIPS) {
        const userId = TEST_USERS.find((u) => u.role === membership.role)!.id
        const orgId = ORGS.find((o) => o.slug === membership.slug)!.id

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
