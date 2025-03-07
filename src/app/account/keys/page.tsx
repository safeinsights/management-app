'use server'

import GenerateKeys from '@/app/account/keys/generate-keys'
import { auth } from '@clerk/nextjs/server'
import { getMemberUserPublicKey } from '@/server/actions/user-actions'

export default async function Keys() {
    const { userId } = await auth()
    if (!userId) return null
    const publicKey = await getMemberUserPublicKey(userId)
    if (publicKey) {
        // TODO dont let them come back here, redirect to dashboard?
    }
    console.log(publicKey)
    return <GenerateKeys />
}
