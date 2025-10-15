import { actionResult } from '@/lib/utils'
import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const hasKey = actionResult(await reviewerKeyExistsAction())

    return <GenerateKeys isRegenerating={hasKey} />
}
