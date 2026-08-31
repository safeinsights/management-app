import { useReviewDecision } from '@/hooks/use-review-decision'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
} from '@/tests/unit.helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { ReviewDecisionSection } from './review-decision-section'

// `withLeaveButton` is opt-in so the cases that only read the rendered options keep the DOM they
// have always had; a control present in every case would widen what any broad query here sees.
function Wrapper({
    study,
    labName = 'Rice University',
    withLeaveButton = false,
}: {
    study: Submitted<SelectedStudy>
    labName?: string
    withLeaveButton?: boolean
}) {
    const decision = useReviewDecision()
    return (
        <>
            <ReviewDecisionSection decision={decision} study={study} labName={labName} />
            <LeaveGroupButton isVisible={withLeaveButton} onLeave={decision.onBlur} />
        </>
    )
}

// Drives the error state through the component's own blur path rather than reaching into the form.
function LeaveGroupButton({ isVisible, onLeave }: { isVisible: boolean; onLeave: () => void }) {
    if (!isVisible) return null
    return (
        <button type="button" onClick={onLeave}>
            leave the group
        </button>
    )
}

describe('ReviewDecisionSection', () => {
    let study: Submitted<SelectedStudy>

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
        })
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
    })

    it('renders all three decision options with correct labels', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.getByRole('radio', { name: /Approve/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Request revision/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Decline and end study/ })).toBeInTheDocument()
    })

    it('renders descriptions for each option', () => {
        renderWithProviders(<Wrapper study={study} labName="Rice University" />)

        expect(screen.getByText('Approve the proposal to begin the code submission phase.')).toBeInTheDocument()
        expect(
            screen.getByText('Send the proposal back to Rice University for changes or additional information.'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Permanently close this study. Use only for major issues that cannot be resolved. This action cannot be undone.',
            ),
        ).toBeInTheDocument()
    })

    it('does not render the removed instructional paragraph or visible decision label', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.queryByText(/Select a decision for this initial request/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Initial request decision/)).not.toBeInTheDocument()
    })

    it('preserves the data-testid', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.getByTestId('review-decision-section')).toBeInTheDocument()
    })

    it('selecting one option deselects others', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Wrapper study={study} />)

        await user.click(screen.getByRole('radio', { name: /Approve/ }))
        expect(screen.getByRole('radio', { name: /Approve/ })).toBeChecked()
        expect(screen.getByRole('radio', { name: /Decline and end study/ })).not.toBeChecked()

        await user.click(screen.getByRole('radio', { name: /Decline and end study/ }))
        expect(screen.getByRole('radio', { name: /Decline and end study/ })).toBeChecked()
        expect(screen.getByRole('radio', { name: /Approve/ })).not.toBeChecked()
    })

    it('allows selecting request revision', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Wrapper study={study} />)

        const requestRevision = screen.getByRole('radio', { name: /Request revision/ })

        expect(requestRevision).not.toBeDisabled()

        await user.click(requestRevision)

        expect(requestRevision).toBeChecked()
    })

    it('returns null when study is APPROVED', () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const }
        renderWithProviders(<Wrapper study={approvedStudy} />)

        expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
    })

    it('returns null when study is REJECTED', () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const }
        renderWithProviders(<Wrapper study={rejectedStudy} />)

        expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
    })

    it('returns null when study is CHANGE-REQUESTED', () => {
        const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
        renderWithProviders(<Wrapper study={clarificationStudy} />)

        expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
    })

    // Radio.Group's context does not carry `error` to its children, so the message turned red
    // while the circles stayed grey and the invalid options were unmarked (OTTER-647).
    it('marks the radio circles invalid, not just the message', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Wrapper study={study} withLeaveButton />)

        expect(screen.getByRole('radio', { name: /Approve/ })).not.toHaveAttribute('data-error')

        await user.click(screen.getByRole('button', { name: 'leave the group' }))

        expect(await screen.findByText('Select a decision to continue.')).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Approve/ })).toHaveAttribute('data-error', 'true')
        expect(screen.getByRole('radio', { name: /Decline and end study/ })).toHaveAttribute('data-error', 'true')
    })

    it('clears the circles once a decision is picked', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Wrapper study={study} withLeaveButton />)

        await user.click(screen.getByRole('button', { name: 'leave the group' }))
        await screen.findByText('Select a decision to continue.')

        await user.click(screen.getByRole('radio', { name: /Approve/ }))

        expect(screen.getByRole('radio', { name: /Approve/ })).not.toHaveAttribute('data-error')
    })

    // An aria-label on Radio.Group lands on the roleless outer wrapper, leaving the
    // role="radiogroup" element unnamed. A rendered (visually hidden) label is what names it.
    it('gives the decision radiogroup an accessible name', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.getByRole('radiogroup', { name: 'Decision' })).toBeInTheDocument()
    })
})
