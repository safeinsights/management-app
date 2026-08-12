import { actionResult } from '@/lib/utils'
import { getKeyPageStateAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    // A reset always returns to "My dashboard"; a first key gets the account's resolved landing,
    // which is an org dashboard only when that org is unambiguous.
    const { hasKey, firstKeyRedirect } = actionResult(await getKeyPageStateAction())

    return <GenerateKeys isRegenerating={hasKey} firstKeyRedirect={firstKeyRedirect} />
}
