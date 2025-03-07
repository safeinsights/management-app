'use server'

import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { auth } from '@clerk/nextjs/server'
import { getMemberUserPublicKey, testQuery } from '@/app/account/keys/user-key-actions'
import { getUserIdByClerkId } from '@/server/actions/user-actions'

export default async function Keys() {
    const { userId: clerkId } = await auth()
    if (!clerkId) return null
    const memberUserPublicKeys = await testQuery()
    const userId = await getUserIdByClerkId(clerkId)
    console.log('clerk id: ', clerkId)
    console.log('Keys: ', memberUserPublicKeys)
    const publicKey = await getMemberUserPublicKey(clerkId)
    if (publicKey) {
        // TODO dont let them come back here, redirect to dashboard?
    }
    console.log(publicKey)
    return <GenerateKeys clerkId={clerkId} />
}
