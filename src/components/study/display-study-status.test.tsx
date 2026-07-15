import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { REVIEWER_STATUS_LABELS, RESEARCHER_STATUS_LABELS } from '@/lib/status-labels'
import type { AllStatus } from '@/lib/types'

describe('DisplayStudyStatus', () => {
    describe('reviewer audience', () => {
        const cases: Array<[AllStatus, string]> = [
            ['PENDING-REVIEW', 'Proposal needs review'],
            ['APPROVED', 'Proposal approved'],
            ['REJECTED', 'Proposal rejected'],
            ['CHANGE-REQUESTED', 'Proposal change requested'],
            ['CODE-SUBMITTED', 'Code needs review'],
            ['CODE-APPROVED', 'Code approved'],
            ['CODE-REJECTED', 'Code rejected'],
            ['JOB-RUNNING', 'Code processing'],
            ['JOB-ERRORED', 'Code errored'],
            ['RUN-COMPLETE', 'Result needs review'],
            ['FILES-APPROVED', 'Result ready'],
            ['FILES-REJECTED', 'Result rejected'],
        ]

        it.each(cases)('renders %s as "%s"', (statusKey, expectedText) => {
            const status = REVIEWER_STATUS_LABELS[statusKey]!
            renderWithProviders(<DisplayStudyStatus status={status} />)
            const textEl = screen.getByText(expectedText)
            expect(textEl).toBeDefined()
            expect(textEl.parentElement?.textContent?.trim()).toBe(expectedText)
        })

        it('shows the escalation tooltip when hovering the JOB-RUNNING pill', async () => {
            const user = userEvent.setup()
            renderWithProviders(<DisplayStudyStatus status={REVIEWER_STATUS_LABELS['JOB-RUNNING']!} />)

            await user.hover(screen.getByText('Code processing'))

            await waitFor(() => {
                expect(
                    screen.getByText(
                        'The code is now running against the enclave. If it stays in this status for over 1h, contact your Org Admin.',
                    ),
                ).toBeDefined()
            })
        })
    })

    describe('researcher audience', () => {
        const cases: Array<[AllStatus, string]> = [
            ['DRAFT', 'Proposal draft'],
            ['PENDING-REVIEW', 'Proposal under review'],
            ['APPROVED', 'Proposal approved'],
            ['REJECTED', 'Proposal rejected'],
            ['CHANGE-REQUESTED', 'Proposal change requested'],
            ['INITIATED', 'Code draft'],
            ['CODE-SUBMITTED', 'Code under review'],
            ['CODE-APPROVED', 'Code approved'],
            ['CODE-REJECTED', 'Code rejected'],
            ['JOB-ERRORED', 'Code errored'],
            ['RUN-COMPLETE', 'Result under review'],
            ['FILES-APPROVED', 'Result ready'],
            ['FILES-REJECTED', 'Result rejected'],
        ]

        it.each(cases)('renders %s as "%s"', (statusKey, expectedText) => {
            const status = RESEARCHER_STATUS_LABELS[statusKey]!
            renderWithProviders(<DisplayStudyStatus status={status} />)
            const textEl = screen.getByText(expectedText)
            expect(textEl).toBeDefined()
            expect(textEl.parentElement?.textContent?.trim()).toBe(expectedText)
        })
    })
})
