import {
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    staleActionError,
    userEvent,
    vi,
    type Mock,
} from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { ActionFailure } from '@/lib/errors'
import { OUTPUTS_DECISION_FAILURE } from '@/lib/outputs-review'
import { RELOAD_BUTTON_LABEL } from '@/components/errors'
import { FAILURE_NOTIFICATION_ID, showOutputsDecisionFailure } from './outputs-decision-failure-notice'

const lastNotification = () => (notifications.show as Mock).mock.calls.at(-1)?.[0]

describe('showOutputsDecisionFailure', () => {
    it('promises nothing it cannot back when the feedback is only on screen', () => {
        showOutputsDecisionFailure({ error: new ActionFailure({ study: 'is unavailable' }), isSaved: false })

        expect(lastNotification()).toMatchObject({
            title: OUTPUTS_DECISION_FAILURE.title,
            message: OUTPUTS_DECISION_FAILURE.unsaved,
        })
    })

    it('tells the reviewer their work is safe once the editor holds it', () => {
        showOutputsDecisionFailure({ error: new ActionFailure({ study: 'is unavailable' }), isSaved: true })

        expect(lastNotification()).toMatchObject({
            title: OUTPUTS_DECISION_FAILURE.title,
            message: OUTPUTS_DECISION_FAILURE.saved,
        })
    })

    it('keeps one notice however many times the submit is retried', () => {
        showOutputsDecisionFailure({ error: new Error('offline'), isSaved: true })
        showOutputsDecisionFailure({ error: new Error('offline'), isSaved: true })

        const ids = (notifications.show as Mock).mock.calls.map(([arg]) => arg.id)
        expect(ids).toEqual([FAILURE_NOTIFICATION_ID, FAILURE_NOTIFICATION_ID])
    })

    describe('when the page predates the running build', () => {
        it('holds the notice open, because no retry can resolve the action id', () => {
            showOutputsDecisionFailure({ error: staleActionError(), isSaved: true })

            expect(lastNotification()).toMatchObject({
                id: FAILURE_NOTIFICATION_ID,
                title: OUTPUTS_DECISION_FAILURE.title,
                autoClose: false,
            })
        })

        it('asks for a reload and warns that the security key is needed again', () => {
            showOutputsDecisionFailure({ error: staleActionError(), isSaved: true })
            renderWithProviders(<>{lastNotification().message}</>)

            expect(screen.getByText(OUTPUTS_DECISION_FAILURE.staleSaved)).toBeDefined()
        })

        it('tells a reviewer with unsaved feedback to copy it before reloading', () => {
            showOutputsDecisionFailure({ error: staleActionError(), isSaved: false })
            renderWithProviders(<>{lastNotification().message}</>)

            expect(screen.getByText(OUTPUTS_DECISION_FAILURE.staleUnsaved)).toBeDefined()
        })

        it('reloads the page when the reviewer presses the control', async () => {
            const reload = vi.fn()
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: { ...window.location, reload },
            })
            showOutputsDecisionFailure({ error: staleActionError(), isSaved: true })
            renderWithProviders(<>{lastNotification().message}</>)

            await userEvent.click(screen.getByRole('button', { name: RELOAD_BUTTON_LABEL }))
            expect(reload).toHaveBeenCalled()
        })
    })
})
