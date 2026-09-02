import dayjs from 'dayjs'
import { redirect } from 'next/navigation'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { getUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { RegenerateKey } from './regenerate-key'

export default async function ManageKeysPage() {
    // Guarded here too, so a missing key never silently formats today's date as generated-on.
    const key = actionResult(await getUserPublicKeyAction())
    if (!key) redirect(Routes.accountKeys)

    const generatedOn = dayjs(key.updatedAt).format('MMM DD, YYYY')

    return <RegenerateKey generatedOn={generatedOn} />
}
