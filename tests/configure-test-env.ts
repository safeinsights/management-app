import 'dotenv/config'
import { readTestSupportFile } from './e2e.helpers'
import { db } from '@/database'
import { PROD_ENV } from '@/server/config'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'
import { findOrCreateOrgMembership } from '@/server/mutations'

const CLERK_ADMIN_TEST_IDS: Set<string> = new Set(PROD_ENV ? [] : ['user_2x8iPxAfMZg5EJoZcrALjqXXEFD'])

const CLERK_REVIEWER_TEST_IDS: Set<string> = new Set(PROD_ENV ? [] : ['user_2xxt9CAEXzHV9rrMEDQ7UOQgK6Z'])

export const CLERK_RESEARCHER_TEST_IDS: Set<string> = new Set(PROD_ENV ? [] : ['user_2xxpiScCXELkKuYlrnxqLnQh0c2'])

const pubKeyStr = await readTestSupportFile('public_key.pem')

async function ensurePublicKey(userId: string) {
    const pubKey = Buffer.from(pemToArrayBuffer(pubKeyStr)) // db exp;ects nodejs buffer
    const fingerprint = await readTestSupportFile('public_key.sig')

    const pkey = await db.selectFrom('userPublicKey').where('userId', '=', userId).executeTakeFirst()

    if (!pkey) {
        await db
            .insertInto('userPublicKey')
            .values({ fingerprint, userId, publicKey: pubKey })
            .executeTakeFirstOrThrow()
    }
}

async function setupUsers() {
    const org = await db
        .selectFrom('org')
        .select(['id', 'settings', 'type'])
        .where('slug', '=', 'openstax')
        .executeTakeFirstOrThrow()

    // Update publicKey in settings for enclave org
    if (org.type === 'enclave') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settings = org.settings as any
        if (!settings.publicKey || settings.publicKey.length < 1000) {
            await db
                .updateTable('org')
                .set({ settings: { ...settings, publicKey: pubKeyStr } })
                .where('id', '=', org.id)
                .execute()
        }

        const existingImages = await db.selectFrom('orgBaseImage').where('orgId', '=', org.id).execute()
        if (existingImages.length === 0) {
            // NOTE: these public ECR base images are not pulled during CI runs:
            // GitHub Actions sets SIMULATE_IMAGE_BUILD='t', so approveStudyProposalAction
            // skips triggerBuildImageForJob and orgBaseImage.url is only used outside CI.
            await db
                .insertInto('orgBaseImage')
                .values([
                    {
                        orgId: org.id,
                        name: 'R Base Image',
                        language: 'R',
                        url: 'public.ecr.aws/docker/library/r-base:latest',
                        cmdLine: 'Rscript main.r',
                        starterCodePath: 'main.r',
                        isTesting: false,
                    },
                    {
                        orgId: org.id,
                        name: 'Python Base Image',
                        language: 'PYTHON',
                        url: 'public.ecr.aws/docker/library/python:latest',
                        cmdLine: 'python main.py',
                        starterCodePath: 'main.py',
                        isTesting: false,
                    },
                ])
                .execute()
            console.log(`Created base images for org ${org.id}`) // eslint-disable-line no-console
        }

        // Ensure a dedicated single-language R-only enclave exists for e2e tests
        let singleLangOrg = await db
            .selectFrom('org')
            .selectAll('org')
            .where('slug', '=', 'single-lang-r-enclave')
            .executeTakeFirst()

        if (!singleLangOrg) {
            singleLangOrg = await db
                .insertInto('org')
                .values({
                    slug: 'single-lang-r-enclave',
                    name: 'Single-Lang R Enclave',
                    type: 'enclave',
                    email: 'single-lang-r-enclave@example.com',
                    description: 'Test-only enclave with R as the single supported language',
                    settings: { publicKey: pubKeyStr },
                })
                .returningAll()
                .executeTakeFirstOrThrow()
        }

        const existingSingleLangImages = await db
            .selectFrom('orgBaseImage')
            .where('orgId', '=', singleLangOrg.id)
            .execute()

        if (existingSingleLangImages.length === 0) {
            await db
                .insertInto('orgBaseImage')
                .values({
                    orgId: singleLangOrg.id,
                    name: 'R Base Image (Single-Lang)',
                    language: 'R',
                    url: 'public.ecr.aws/docker/library/r-base:latest',
                    cmdLine: 'Rscript main.r',
                    starterCodePath: 'main.r',
                    isTesting: false,
                })
                .execute()
            console.log(`Created single-language R base image for org ${singleLangOrg.id}`) // eslint-disable-line no-console
        }
    }

    for (const clerkId of CLERK_ADMIN_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Admin User',
            lastName: 'Test Admin User',
        })
        await ensurePublicKey(userId)
        // Admins should be in both enclave and lab orgs
        await findOrCreateOrgMembership({
            userId,
            slug: 'openstax',
            isAdmin: true,
        })
        await findOrCreateOrgMembership({
            userId,
            slug: 'openstax-lab',
            isAdmin: true,
        })
        console.log(`setup admin user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }

    for (const clerkId of CLERK_RESEARCHER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Researcher User',
            lastName: 'Test Researcher User',
        })
        // Researchers go to lab org
        await findOrCreateOrgMembership({ userId, slug: 'openstax-lab', isAdmin: false })
        console.log(`setup researcher user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }

    for (const clerkId of CLERK_REVIEWER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, { firstName: 'Test Org User' })

        await ensurePublicKey(userId)

        // Reviewers go to enclave org
        await findOrCreateOrgMembership({ userId, slug: 'openstax', isAdmin: false })
        console.log(`setup reviewer user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }
}

await setupUsers()
