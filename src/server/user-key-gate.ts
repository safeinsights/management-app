import { redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'

// On the server so a keyless account is sent to key setup before any app page renders (OTTER-743).
export async function requireUserKey(): Promise<void> {
    if (!actionResult(await userKeyExistsAction())) {
        redirect(Routes.accountKeys)
    }
}
