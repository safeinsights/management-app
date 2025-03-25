import 'dotenv/config'
import { readTestSupportFile } from './e2e.helpers'
import { db } from '@/database'
import { PROD_ENV } from '@/server/config'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'

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
        .select('id')
        .where('identifier', '=', 'openstax')
        .executeTakeFirstOrThrow()

    for (const clerkId of CLERK_RESEARCHER_TEST_IDS) {
        await findOrCreateSiUserId(clerkId, {
            firstName: 'Test Researcher User',
            lastName: 'Test Researcher User',
            isResearcher: true,
        })
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
        const exists = await db
            .selectFrom('memberUser')
            .select('id')
            .where('userId', '=', userId)
            .where('memberId', '=', member.id)
            .executeTakeFirst()

        if (exists) {
            db.updateTable('memberUser').set({ isReviewer: true }).where('id', '=', exists.id).execute()
        } else {
            await db
                .insertInto('memberUser')
                .values({ userId, memberId: member.id, isReviewer: true, isAdmin: false })
                .execute()
        }
    }
}

await setupUsers()
