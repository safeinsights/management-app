'use client'

import { ReloadNotice, showOrReplaceNotification } from '@/components/errors'
import { isStaleDeploymentError } from '@/lib/errors'
import { OUTPUTS_DECISION_FAILURE } from '@/lib/outputs-review'

// Fixed, so a reviewer who presses Submit twice replaces the notice instead of stacking a second
// one that never closes. Shown through the replacing helper, because a retry that fails for a new
// reason has to change what the notice says (OTTER-726).
export const FAILURE_NOTIFICATION_ID = 'outputs-decision-failure'

const retryMessage = (isSaved: boolean) => (isSaved ? OUTPUTS_DECISION_FAILURE.saved : OUTPUTS_DECISION_FAILURE.unsaved)

// Reloading costs the security key and any feedback the editor has not taken yet, which is why the
// unsaved variant asks for a copy first.
const staleMessage = (isSaved: boolean) =>
    isSaved ? OUTPUTS_DECISION_FAILURE.staleSaved : OUTPUTS_DECISION_FAILURE.staleUnsaved

// One place decides what a failed submit says, so the copy cannot drift from the condition that
// earns it. `isSaved` must be false unless the feedback is provably with the editor service.
export function showOutputsDecisionFailure({ error, isSaved }: { error: unknown; isSaved: boolean }) {
    // No retry can resolve an action id this build does not hold, and the notice has to stay until
    // the reviewer acts on it.
    if (isStaleDeploymentError(error)) {
        showOrReplaceNotification({
            id: FAILURE_NOTIFICATION_ID,
            color: 'red',
            autoClose: false,
            title: OUTPUTS_DECISION_FAILURE.title,
            message: <ReloadNotice message={staleMessage(isSaved)} />,
        })
        return
    }

    showOrReplaceNotification({
        id: FAILURE_NOTIFICATION_ID,
        color: 'red',
        title: OUTPUTS_DECISION_FAILURE.title,
        message: retryMessage(isSaved),
    })
}
