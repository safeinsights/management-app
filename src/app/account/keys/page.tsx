import type { Metadata } from 'next'
import { actionResult } from '@/lib/utils'
import { getKeyPageStateAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from './generate-keys'

export const metadata: Metadata = { title: 'Security key' }

export const dynamic = 'force-dynamic'

export default async function KeysPage() {
    const { hasKey, firstKeyRedirect } = actionResult(await getKeyPageStateAction())

    return <GenerateKeys isRegenerating={hasKey} firstKeyRedirect={firstKeyRedirect} />
}
