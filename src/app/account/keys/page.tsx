import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const publicKey = await getReviewerPublicKeyAction()

    return <GenerateKeys isRegenerating={!!publicKey} />
}
