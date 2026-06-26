import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const hasKey = actionResult(await userKeyExistsAction())

    return <GenerateKeys isRegenerating={hasKey} />
}
