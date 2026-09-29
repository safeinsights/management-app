'use server'

import { onUserViewedSubmitCodeFaq } from '@/server/events'
import { Action } from '@/server/actions/action'

/**
 * OTTER-693: records that this researcher has now been shown the Submit code page's FAQ, so their
 * next visit gets it collapsed.
 *
 * No userId param — the row is always the caller's own, so nobody can mark somebody else as having
 * seen it. Repeat calls simply add another audit row; the read only asks whether any exists, and an
 * append-only log is what the audit table is for.
 */
export const markSubmitCodeFaqSeenAction = new Action('markSubmitCodeFaqSeenAction', { performsMutations: true })
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, db }) => {
        await onUserViewedSubmitCodeFaq({ db, userId: session.user.id })
    })
