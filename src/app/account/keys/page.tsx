import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { getFirstKeyRedirectAction, userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const hasKey = actionResult(await userKeyExistsAction())
    // A reset always returns to "My dashboard"; a first key gets the account's resolved landing,
    // which is an org dashboard only when that org is unambiguous.
    const firstKeyRedirect = hasKey ? Routes.dashboard : actionResult(await getFirstKeyRedirectAction())

    return <GenerateKeys isRegenerating={hasKey} firstKeyRedirect={firstKeyRedirect} />
}
