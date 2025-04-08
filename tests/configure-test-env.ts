import 'dotenv/config'
import { readTestSupportFile } from './e2e.helpers'
import { db } from '@/database'
import { PROD_ENV } from '@/server/config'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'
import { findOrCreateOrgMembership } from '@/server/mutations'

const CLERK_MEMBER_TEST_IDS: Set<string> = new Set(PROD_ENV ? [] : ['user_2srdGHaPWEGccVS6hzftdroHADi'])

export const CLERK_RESEARCHER_TEST_IDS: Set<string> = new Set(
    PROD_ENV ? [] : ['user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ', 'user_2oiQ37cyMUZuHnEwxjLmFJJY5kR'],
)

async function setupUsers() {
    const pubKeyStr = await readTestSupportFile('public_key.pem')
    const pubKey = Buffer.from(pemToArrayBuffer(pubKeyStr)) // db exp;ects nodejs buffer
    const fingerprint = await readTestSupportFile('public_key.sig')

    const member = await db
        .selectFrom('member')
        .select(['id', 'publicKey'])
        .where('slug', '=', 'openstax')
        .executeTakeFirstOrThrow()

    if (member.publicKey.length < 1000) {
        await db.updateTable('member').set({ publicKey: pubKeyStr }).where('id', '=', member.id).execute()
    }

    for (const clerkId of CLERK_RESEARCHER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Researcher User',
            lastName: 'Test Researcher User',
            isResearcher: true,
        })
        findOrCreateOrgMembership({ userId, slug: 'openstax', isReviewer: false })
    }

    for (const clerkId of CLERK_MEMBER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, { firstName: 'Test Member User' })

        const pkey = await db.selectFrom('userPublicKey').where('userId', '=', userId).executeTakeFirst()

        if (!pkey) {
            await db
                .insertInto('userPublicKey')
                .values({ fingerprint, userId, publicKey: pubKey })
                .executeTakeFirstOrThrow()
        }
        findOrCreateOrgMembership({ userId, slug: 'openstax' })
    }
}

await setupUsers()
