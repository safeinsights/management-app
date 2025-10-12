import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const result = await reviewerKeyExistsAction()
    // result is either boolean or ActionError
    // converts both false and action error to false for strict boolean prop type
    const hasKey = Boolean(result)
    return <GenerateKeys isRegenerating={hasKey} />
}
