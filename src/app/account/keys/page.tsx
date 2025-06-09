import { GenerateKeys } from './generate-keys'
import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { RegenerateKeys } from './regenerate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const publicKey = await getReviewerPublicKeyAction()

    if (publicKey) {
        return <RegenerateKeys />
    } else {
        return <GenerateKeys />
    }
}
