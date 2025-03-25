'use server'

import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getMemberUserPublicKeyAction } from '@/server/actions/user-keys.actions'

export default async function KeysPage() {
    const { userId: clerkId } = await auth()
    if (!clerkId) return null

    const publicKey = await getMemberUserPublicKeyAction()
    if (publicKey) {
        // If they already have a public key, don't let them come here to regenerate keys (MVP only)
        redirect('/')
    }
    return <GenerateKeys />
}
