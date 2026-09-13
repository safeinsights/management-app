'use client'

import { FC } from 'react'
import { Button, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { isStaleDeploymentError } from '@/lib/errors'
import { OUTPUTS_DECISION_FAILURE } from '@/lib/outputs-review'

// Fixed, so a reviewer who presses Submit twice replaces the notice instead of stacking a second
// one that never closes (OTTER-726).
export const FAILURE_NOTIFICATION_ID = 'outputs-decision-failure'

export const RELOAD_BUTTON_LABEL = 'Reload'

// A control rather than an automatic reload: reloading costs the security key and any feedback the
// editor has not taken yet, so the reviewer chooses the moment.
const ReloadNotice: FC<{ isSaved: boolean }> = ({ isSaved }) => (
    <Stack gap="xs" align="flex-start">
        <Text size="sm">{isSaved ? OUTPUTS_DECISION_FAILURE.staleSaved : OUTPUTS_DECISION_FAILURE.staleUnsaved}</Text>
        <Button size="compact-sm" onClick={() => window.location.reload()}>
            {RELOAD_BUTTON_LABEL}
        </Button>
    </Stack>
)

const retryMessage = (isSaved: boolean) => (isSaved ? OUTPUTS_DECISION_FAILURE.saved : OUTPUTS_DECISION_FAILURE.unsaved)

// One place decides what a failed submit says, so the copy cannot drift from the condition that
// earns it. `isSaved` must be false unless the feedback is provably with the editor service.
export function showOutputsDecisionFailure({ error, isSaved }: { error: unknown; isSaved: boolean }) {
    // No retry can resolve an action id this build does not hold, and the notice has to stay until
    // the reviewer acts on it.
    if (isStaleDeploymentError(error)) {
        notifications.show({
            id: FAILURE_NOTIFICATION_ID,
            color: 'red',
            autoClose: false,
            title: OUTPUTS_DECISION_FAILURE.title,
            message: <ReloadNotice isSaved={isSaved} />,
        })
        return
    }

    notifications.show({
        id: FAILURE_NOTIFICATION_ID,
        color: 'red',
        title: OUTPUTS_DECISION_FAILURE.title,
        message: retryMessage(isSaved),
    })
}
