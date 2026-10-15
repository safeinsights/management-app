import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { REQUEST_PATH_HEADER } from '@/lib/request-path'
import { Routes } from '@/lib/routes'
import { keyGenerationUrl } from '@/lib/user-key-redirect'
import { actionResult, safeRedirectUrl } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'

// Runs when an app layout renders, so a keyless account reaches key setup before the page shows
// (OTTER-743) and returns to the page it asked for once the key exists (OTTER-744). Pages and
// actions do not check for a key themselves.
export async function requireUserKey(): Promise<void> {
    if (actionResult(await userKeyExistsAction())) return

    const requested = (await headers()).get(REQUEST_PATH_HEADER)
    redirect(keyGenerationUrl(safeRedirectUrl(requested, Routes.dashboard)))
}
