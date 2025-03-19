'use server'

import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getMemberUserPublicKey } from '@/app/account/keys/user-key-actions'

export default async function Keys() {
    const { userId: clerkId } = await auth()
    if (!clerkId) return null

    const publicKey = await getMemberUserPublicKey(clerkId)
    if (publicKey) {
        // If they already have a public key, don't let them come here to regenerate keys (MVP only)
        redirect('/')
    }
    return <GenerateKeys />
}
