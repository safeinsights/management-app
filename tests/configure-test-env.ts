import 'dotenv/config'
import { readTestSupportFile } from './e2e.helpers'
import { db } from '@/database'
import { PROD_ENV } from '@/server/config'
import { findOrCreateSiUserId } from '@/server/actions/user-actions'

const CLERK_MEMBER_TEST_IDS: Set<string> = new Set(PROD_ENV ? [] : ['user_2srdGHaPWEGccVS6hzftdroHADi'])

export const CLERK_RESEARCHER_TEST_IDS: Set<string> = new Set(
    PROD_ENV ? [] : ['user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ', 'user_2oiQ37cyMUZuHnEwxjLmFJJY5kR'],
)

async function setupUsers() {
    const pubKey = await readTestSupportFile('public_key.pem')
    const fingerprint = await readTestSupportFile('public_key.sig')

    for (const clerkId of CLERK_MEMBER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, 'Test Researcher User')

        const pkey = await db.selectFrom('memberUserPublicKey').where('userId', '=', userId).executeTakeFirst()

        if (!pkey) {
            await db
                .insertInto('memberUserPublicKey')
                .values({ fingerprint, userId, value: pubKey })
                .executeTakeFirstOrThrow()
        }
    }
}

setupUsers()
