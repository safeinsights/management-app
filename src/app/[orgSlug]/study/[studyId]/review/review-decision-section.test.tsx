import { useReviewDecision } from '@/hooks/use-review-decision'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
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

function Wrapper({ study, labName = 'Rice University' }: { study: SelectedStudy; labName?: string }) {
    const decision = useReviewDecision()
    return <ReviewDecisionSection decision={decision} study={study} labName={labName} />
}

describe('ReviewDecisionSection', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    })

    it('renders all three decision options with correct labels', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.getByRole('radio', { name: /Approve/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Needs clarification/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Reject/ })).toBeInTheDocument()
    })

    it('renders descriptions for each option', () => {
        renderWithProviders(<Wrapper study={study} />)

        expect(screen.getByText('Approve this initial request and share your feedback.')).toBeInTheDocument()
        expect(screen.getByText(/Request clarifications or specific revisions/)).toBeInTheDocument()
        expect(screen.getByText(/Reject this initial request and share your reasoning/)).toBeInTheDocument()
    })

    it('renders the reject warning text with semi-bold styling', () => {
        renderWithProviders(<Wrapper study={study} />)

        const warning = screen.getByText(
            'This is intended as a last resort due to major, unresolvable issues and will end this study. This action cannot be undone.',
        )
        expect(warning).toBeInTheDocument()
        expect(warning).toHaveStyle({ fontWeight: 600 })
    })

    it('renders the lab name in the instructional text', () => {
        renderWithProviders(<Wrapper study={study} labName="Rice University" />)

        expect(screen.getByText('Rice University')).toBeInTheDocument()
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
        expect(screen.getByRole('radio', { name: /Reject/ })).not.toBeChecked()

        await user.click(screen.getByRole('radio', { name: /Reject/ }))
        expect(screen.getByRole('radio', { name: /Reject/ })).toBeChecked()
        expect(screen.getByRole('radio', { name: /Approve/ })).not.toBeChecked()
    })

    it('allows selecting needs clarification', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Wrapper study={study} />)

        const needsClarification = screen.getByRole('radio', { name: /Needs clarification/ })

        expect(needsClarification).not.toBeDisabled()

        await user.click(needsClarification)

        expect(needsClarification).toBeChecked()
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
})
