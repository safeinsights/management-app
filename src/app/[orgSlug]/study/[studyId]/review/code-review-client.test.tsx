import { vi } from 'vitest'
import {
    actionResult,
    beforeEach,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { CodeReviewClient } from './code-review-client'
import { useCodeReviewMutation } from '@/hooks/use-code-review-mutation'
import { useReviewFeedback } from '@/hooks/use-review-feedback'

vi.mock('@/components/openstax-feature-flag', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/openstax-feature-flag')>()
    return {
        ...actual,
        useCodeReviewCollaborationFeatureFlag: () => true,
    }
})

vi.mock('@/hooks/use-code-review-mutation', () => ({
    useCodeReviewMutation: vi.fn(),
}))

vi.mock('@/hooks/use-review-feedback', () => ({
    useReviewFeedback: vi.fn(),
}))

const mockUseCodeReviewMutation = vi.mocked(useCodeReviewMutation)
const mockUseReviewFeedback = vi.mocked(useReviewFeedback)
const submitReview = vi.fn()

async function setupValidReviewableJob(labName = 'Rice University') {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'PENDING-REVIEW',
        jobStatus: 'CODE-SUBMITTED',
        title: 'Effect of Reading Comprehension Tools',
    })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(study.id)
    const studyWithLab: SelectedStudy = { ...study, submittingLabName: labName }
    return { study: studyWithLab, job, orgSlug: org.slug }
}

async function fillAllCriteria(user: ReturnType<typeof userEvent.setup>) {
    const evaluation = screen.getByTestId('code-evaluation-section')
    const yesRadios = evaluation.querySelectorAll('input[type="radio"][value="yes"]')
    for (const radio of Array.from(yesRadios)) {
        await user.click(radio as HTMLElement)
    }
}

describe('CodeReviewClient decision selector', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        submitReview.mockReset()
        mockUseCodeReviewMutation.mockReturnValue({
            submitReview,
            isPending: false,
            isSuccess: false,
            pendingReview: undefined,
        })
        mockUseReviewFeedback.mockReturnValue({
            value: 'sample feedback body',
            onChange: vi.fn(),
            wordCount: 100,
            minWords: 50,
            maxWords: 500,
            isValid: true,
        })
    })

    it('renders all three decision options with their titles and descriptions', async () => {
        const { study, job, orgSlug } = await setupValidReviewableJob('Rice University')
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        expect(screen.getByTestId('code-review-decision-approve')).toBeInTheDocument()
        expect(screen.getByTestId('code-review-decision-needs-clarification')).toBeInTheDocument()
        expect(screen.getByTestId('code-review-decision-reject')).toBeInTheDocument()

        expect(screen.getByText('Approve and run code')).toBeInTheDocument()
        expect(screen.getByText('Request revision')).toBeInTheDocument()
        expect(screen.getByText('Reject and end study')).toBeInTheDocument()

        expect(
            screen.getByText(
                /The code will proceed to run in your secure enclave\. Rice University will be notified via email/,
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                /Return this code submission to Rice University for necessary updates, additional information, or specific changes\./,
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                /Permanently end this study due to major, unresolvable issues\. Share rationale with Rice University\./,
            ),
        ).toBeInTheDocument()
        expect(screen.getByText('Warning: This terminates the study and cannot be undone.')).toBeInTheDocument()
    })

    it('disables Submit when no decision is selected even with valid feedback and criteria', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        await fillAllCriteria(user)

        expect(screen.getByTestId('code-review-submit')).toBeDisabled()
    })

    it.each([
        ['code-review-decision-approve'],
        ['code-review-decision-needs-clarification'],
        ['code-review-decision-reject'],
    ])('enables Submit when %s is selected with valid feedback and criteria', async (decisionTestId) => {
        const user = userEvent.setup()
        const { study, job, orgSlug } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId(decisionTestId))

        expect(screen.getByTestId('code-review-submit')).toBeEnabled()
    })

    it('opens the non-destructive confirmation modal when submitting with needs-clarification', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-needs-clarification'))
        await user.click(screen.getByTestId('code-review-submit'))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent('Confirm review submission?')
        expect(dialog).toHaveTextContent(
            'Please confirm you are ready to submit this code review. Further edits are not permitted once submitted.',
        )
        expect(screen.getByRole('button', { name: 'Yes, submit review' })).toBeInTheDocument()
    })

    it('opens the destructive reject modal with the warning paragraph when submitting with reject', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-reject'))
        await user.click(screen.getByTestId('code-review-submit'))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent('Reject study code?')
        expect(dialog).toHaveTextContent(
            /Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study\. This action cannot be undone\./,
        )
        expect(screen.getByRole('button', { name: 'Reject study code' })).toBeInTheDocument()
    })

    it('calls submitReview with decision=needs-clarification on confirm', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-needs-clarification'))
        await user.click(screen.getByTestId('code-review-submit'))

        const confirmButton = await screen.findByRole('button', { name: 'Yes, submit review' })
        await user.click(confirmButton)

        await waitFor(() => {
            expect(submitReview).toHaveBeenCalledWith({
                decision: 'needs-clarification',
                feedback: 'sample feedback body',
                criteria: {
                    proposalAlignment: 'yes',
                    agreementCompliance: 'yes',
                    securityChecks: 'yes',
                    privacyProtection: 'yes',
                },
            })
        })
    })
})
