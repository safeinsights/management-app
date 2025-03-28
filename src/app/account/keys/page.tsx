'use server'

import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { redirect } from 'next/navigation'
import { getMemberUserPublicKeyAction } from '@/server/actions/user-keys.actions'

export default async function KeysPage() {
    const publicKey = await getMemberUserPublicKeyAction()
    // If they already have a public key,
    // don't let them come here to regenerate keys (MVP only)
    if (publicKey) {
        redirect('/')
    }

    return <GenerateKeys />
}
