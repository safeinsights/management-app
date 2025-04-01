'use server'

import { db } from '@/database'
import { z, userAction, getUserIdFromActionContext } from './wrappers'
import { getMemberUserPublicKey } from '@/server/db/queries'
import { ensureUserIsMemberOfOrg } from '../mutations'

export const getMemberUserFingerprintAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()

    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.fingerprint
})

export const getMemberUserPublicKeyAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()

    return await getMemberUserPublicKey(userId)
})

const setMemberUserPublicKeySchema = z.object({ publicKey: z.instanceof(ArrayBuffer), fingerprint: z.string() })

export const setMemberUserPublicKeyAction = userAction(async ({ publicKey, fingerprint }) => {
    const userId = await getUserIdFromActionContext()

    // during MVP, we have several users who were setup in clerk without invites
    // those accounts are not associated with any organization
    ensureUserIsMemberOfOrg()

    await db
        .insertInto('userPublicKey')
        .values({
            userId,
            publicKey: Buffer.from(publicKey),
            fingerprint,
        })
        .execute()
}, setMemberUserPublicKeySchema)
