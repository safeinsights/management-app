import { GenerateKeys } from './generate-keys'
import { redirect } from 'next/navigation'
import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const publicKey = await getReviewerPublicKeyAction()
    // If they already have a public key,
    // don't let them come here to regenerate keys (MVP only)
    if (publicKey) {
        redirect('/')
    }

    return <GenerateKeys />
}
