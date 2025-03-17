import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import { db } from '@/database'
import { readTestSupportFile } from './e2e.helpers'

import { findOrCreateSiUserId } from '@/server/actions/user-actions'

import { CLERK_MEMBER_TEST_IDS } from '@/server/config'

setup('global setup', async ({}) => {
    await clerkSetup()

    for (const role of ['RESEARCHER']) {
        for (const part of ['EMAIL', 'PASSWORD']) {
            const env = `E2E_CLERK_${role}_${part}`
            if (!process.env[env]) {
                throw new Error(`Please provide ${env} environment variables.`)
            }
        }
    }

    const pubKey = await readTestSupportFile('public_key.pem')
    const fingerprint = await readTestSupportFile('public_key.sig')

    for (const clerkId of CLERK_MEMBER_TEST_IDS) {
        const userId = await findOrCreateSiUserId(clerkId, 'Test Researcher User')

        const pkey = await db.selectFrom('memberUserPublicKey').where('userId', '=', userId).executeTakeFirst()

        if (!pkey) {
            //  const { publicKeyString, privateKeyString, fingerprint } = await generateKeyPair()
            await db
                .insertInto('memberUserPublicKey')
                .values({ fingerprint, userId, value: pubKey })
                .executeTakeFirstOrThrow()
        }
    }
})
