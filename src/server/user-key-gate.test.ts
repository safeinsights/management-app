import { db } from '@/database'
import { Routes } from '@/lib/routes'
import { describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { redirect } from 'next/navigation'
import { requireUserKey } from './user-key-gate'

describe('requireUserKey', () => {
    it('redirects a keyless account to key setup', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        await requireUserKey()

        expect(redirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('lets an account that holds a key through', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        await requireUserKey()

        expect(redirect).not.toHaveBeenCalled()
    })
})
