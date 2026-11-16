import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    globalAcknowledgementDestination,
    globalAcknowledgementUrl,
    isLegalPath,
} from '@/lib/global-acknowledgement-redirect'
import { isActionError } from '@/lib/errors'
import { REQUEST_PATH_HEADER } from '@/lib/request-path'
import { fetchPendingGlobalAcknowledgementsAction } from '@/server/actions/legal-acknowledgement.actions'

// Runs when an app layout renders, so a user owing the ToS/PN agrees on a page of its own before any
// app page shows (SHRMP-443). ROPA/DOPA keep their modal in AppShell.
export async function requireGlobalAcknowledgement(): Promise<void> {
    const requested = (await headers()).get(REQUEST_PATH_HEADER)
    if (requested && isLegalPath(requested)) return

    // An unreadable document leaves the gate open, as the modal did: the ack row is the compliance
    // artifact rather than the blocking, and the action has already reported the failure.
    const pending = await fetchPendingGlobalAcknowledgementsAction()
    if (isActionError(pending) || !pending.length) return

    redirect(globalAcknowledgementUrl(globalAcknowledgementDestination(requested)))
}
