import dayjs from 'dayjs'
import { actionResult } from '@/lib/utils'
import { getUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { RegenerateKey } from './regenerate-key'

export default async function ManageKeysPage() {
    // The layout redirects to key generation when no key exists, so a key is always present here.
    const key = actionResult(await getUserPublicKeyAction())
    const generatedOn = dayjs(key?.updatedAt).format('MMM DD, YYYY')

    return <RegenerateKey generatedOn={generatedOn} />
}
