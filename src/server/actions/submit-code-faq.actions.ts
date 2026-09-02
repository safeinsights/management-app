'use server'

import { Action } from '@/server/actions/action'

/**
 * OTTER-693: the Submit code page's FAQ opens expanded the first time a researcher lands on it and
 * collapsed on every visit after, so the marker is per user rather than per study.
 *
 * Write-once: the `is null` guard keeps a second visit from moving the timestamp, which is what
 * makes "when did they first see it" answerable later. No userId param — the row is always the
 * caller's own, so a caller cannot mark somebody else as having seen it.
 */
export const markSubmitCodeFaqSeenAction = new Action('markSubmitCodeFaqSeenAction', { performsMutations: true })
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, db }) => {
        await db
            .updateTable('user')
            .set({ submitCodeFaqSeenAt: new Date() })
            .where('id', '=', session.user.id)
            .where('submitCodeFaqSeenAt', 'is', null)
            .execute()
    })
