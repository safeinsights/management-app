import { vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, render, screen, staleActionError, waitFor } from '@/tests/unit.helpers'
import { showOutputsDecisionFailure } from '@/components/study/outputs-decision-failure-notice'
import { OUTPUTS_DECISION_FAILURE } from '@/lib/outputs-review'
import { RELOAD_BUTTON_LABEL, showOrReplaceNotification } from './errors'

// The shared setup swaps this module for spies, and a spy cannot tell an added notification from one
// the store discarded. Only a rendered store can, which is how the dropped notice went unseen in
// review (OTTER-726).
vi.unmock('@mantine/notifications')

const mountNotifications = () =>
    render(
        <MantineProvider>
            <Notifications />
        </MantineProvider>,
    )

describe('showOrReplaceNotification', () => {
    beforeEach(() => {
        notifications.clean()
    })

    it('replaces the text of a notification already on screen under the same id', async () => {
        mountNotifications()

        showOrReplaceNotification({ id: 'shared', message: 'First message' })
        await waitFor(() => expect(screen.getByText('First message')).toBeDefined())

        showOrReplaceNotification({ id: 'shared', message: 'Second message' })

        await waitFor(() => expect(screen.getByText('Second message')).toBeDefined())
        expect(screen.queryByText('First message')).toBeNull()
    })

    it('adds a notification when none is on screen under that id', async () => {
        mountNotifications()

        showOrReplaceNotification({ id: 'fresh', message: 'Only message' })

        await waitFor(() => expect(screen.getByText('Only message')).toBeDefined())
    })
})

describe('a decision that fails twice for different reasons', () => {
    beforeEach(() => {
        notifications.clean()
    })

    it('swaps the retry advice for the reload control when the retry meets a new build', async () => {
        mountNotifications()

        showOutputsDecisionFailure({ error: new TypeError('Failed to fetch'), isSaved: true })
        await waitFor(() => expect(screen.getByText(OUTPUTS_DECISION_FAILURE.saved)).toBeDefined())

        showOutputsDecisionFailure({ error: staleActionError(), isSaved: true })

        await waitFor(() => expect(screen.getByRole('button', { name: RELOAD_BUTTON_LABEL })).toBeDefined())
        expect(screen.getByText(OUTPUTS_DECISION_FAILURE.staleSaved)).toBeDefined()
        expect(screen.queryByText(OUTPUTS_DECISION_FAILURE.saved)).toBeNull()
    })
})
