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

async function setupUsers() {
    const pubKeyStr = await readTestSupportFile('public_key.pem')
    const pubKey = Buffer.from(pemToArrayBuffer(pubKeyStr)) // db exp;ects nodejs buffer
    const fingerprint = await readTestSupportFile('public_key.sig')

    const org = await db
        .selectFrom('org')
        .select(['id', 'publicKey'])
        .where('slug', '=', 'openstax')
        .executeTakeFirstOrThrow()

    if (org.publicKey.length < 1000) {
        await db.updateTable('org').set({ publicKey: pubKeyStr }).where('id', '=', org.id).execute()
    }

    for (const clerkId of CLERK_ADMIN_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Admin User',
            lastName: 'Test Admin User',
        })
        await findOrCreateOrgMembership({
            userId,
            slug: 'openstax',
            isReviewer: false,
            isResearcher: true,
            isAdmin: true,
        })
        console.log(`setup admin user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }

    for (const clerkId of CLERK_RESEARCHER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Researcher User',
            lastName: 'Test Researcher User',
        })
        await findOrCreateOrgMembership({ userId, slug: 'openstax', isReviewer: false, isResearcher: true })
        console.log(`setup researcher user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }

    for (const clerkId of CLERK_REVIEWER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, { firstName: 'Test Org User' })

        const pkey = await db.selectFrom('userPublicKey').where('userId', '=', userId).executeTakeFirst()

        if (!pkey) {
            await db
                .insertInto('userPublicKey')
                .values({ fingerprint, userId, publicKey: pubKey })
                .executeTakeFirstOrThrow()
        }
        await findOrCreateOrgMembership({ userId, slug: 'openstax', isReviewer: true, isResearcher: false })
        console.log(`setup reviewer user ${userId} ${clerkId}`) // eslint-disable-line no-console
    }
}

await setupUsers()
