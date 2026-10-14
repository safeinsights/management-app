import { redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'

// Runs when an app layout renders, so a keyless account reaches key setup before the page shows
// (OTTER-743). Pages and actions do not check for a key themselves.
export async function requireUserKey(): Promise<void> {
    if (!actionResult(await userKeyExistsAction())) {
        redirect(Routes.accountKeys)
    }
}
