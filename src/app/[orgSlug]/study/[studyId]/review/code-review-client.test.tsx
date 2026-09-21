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
    within,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import type { StepNav } from '@/lib/study-screen'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { CodeReviewClient } from './code-review-client'
import { useCodeReviewMutation } from '@/hooks/use-code-review-mutation'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'

vi.mock('@/hooks/use-code-review-mutation', () => ({
    useCodeReviewMutation: vi.fn(),
}))

vi.mock('@/hooks/use-review-feedback', () => ({
    useReviewFeedback: vi.fn(),
}))

const mockUseCodeReviewMutation = vi.mocked(useCodeReviewMutation)
const mockUseReviewFeedback = vi.mocked(useReviewFeedback)
const submitReview = vi.fn()

async function setupValidReviewableJob(
    labName = 'Rice University',
    studyStatus: SelectedStudy['status'] = 'PENDING-REVIEW',
) {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus,
        jobStatus: 'CODE-SUBMITTED',
        title: 'Effect of Reading Comprehension Tools',
    })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(study.id)
    const studyWithLab: SelectedStudy = { ...study, submittingLabName: labName }
    const previousHref = Routes.studyReviewProposal({ orgSlug: org.slug, studyId: study.id })
    const nav: StepNav = {
        back: { label: 'Previous step', href: previousHref, variant: 'subtle', testId: 'cta-previous-step' },
    }
    return { study: studyWithLab, job, orgSlug: org.slug, previousHref, nav }
}

async function fillAllCriteria(user: ReturnType<typeof userEvent.setup>) {
    const evaluation = screen.getByTestId('code-evaluation-section')
    const yesRadios = evaluation.querySelectorAll('input[type="radio"][value="yes"]')
    for (const radio of Array.from(yesRadios)) {
        await user.click(radio as HTMLElement)
    }
}

const firstRadioIn = (testId: string) => within(screen.getByTestId(testId)).getAllByRole('radio')[0]

// Blur a radio group without selecting: focus it, then click outside. A click on another control
// in the group would answer it.
async function visitAndLeave(user: ReturnType<typeof userEvent.setup>, testId: string) {
    firstRadioIn(testId).focus()
    await user.click(screen.getByTestId('code-evaluation-attention'))
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
            onBlur: vi.fn(),
            error: null,
            characterCount: 100,
            maxCharacters: REVIEW_FEEDBACK_MAX_CHARACTERS,
            isValid: true,
        })
    })

    it('renders both decision options with their titles and descriptions', async () => {
        const { study, job, orgSlug, nav } = await setupValidReviewableJob('Rice University')
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        expect(screen.getByTestId('code-review-decision-approve')).toBeInTheDocument()
        expect(screen.getByTestId('code-review-decision-needs-clarification')).toBeInTheDocument()
        expect(screen.queryByTestId('code-review-decision-reject')).not.toBeInTheDocument()

        expect(screen.getByText('Approve and run code')).toBeInTheDocument()
        expect(screen.getByText('Request revision')).toBeInTheDocument()
        expect(screen.queryByText('Reject and end study')).not.toBeInTheDocument()

        expect(
            screen.getByText(
                'The code will run in your secure enclave and your feedback will be shared with Rice University.',
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByText('Send the code back to Rice University for changes or additional information.'),
        ).toBeInTheDocument()
    })

    it('renders the editable review form (not "Code review is closed") for an APPROVED study with a reviewable job', async () => {
        // OTTER-552: a resubmission leaves the study APPROVED while the latest job is
        // CODE-SUBMITTED, and editability is job-driven.
        const { study, job, orgSlug, nav } = await setupValidReviewableJob('Rice University', 'APPROVED')
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        expect(screen.queryByTestId('code-review-closed-alert')).not.toBeInTheDocument()
        expect(screen.getByTestId('code-review-submit')).toBeInTheDocument()
    })

    it('renders "Code review is closed" once the job has a decision (CODE-CHANGES-REQUESTED)', async () => {
        const { study, job, orgSlug, nav } = await setupValidReviewableJob('Rice University', 'APPROVED')
        renderWithProviders(
            <CodeReviewClient
                orgSlug={orgSlug}
                study={study}
                job={job}
                latestJobStatus="CODE-CHANGES-REQUESTED"
                nav={nav}
            />,
        )

        expect(screen.getByTestId('code-review-closed-alert')).toBeInTheDocument()
        expect(screen.queryByTestId('code-review-submit')).not.toBeInTheDocument()
    })

    it('keeps Submit decision enabled regardless of field state', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        expect(screen.getByTestId('code-review-submit')).toBeEnabled()

        await fillAllCriteria(user)
        expect(screen.getByTestId('code-review-submit')).toBeEnabled()
    })

    it('shows decision error on submit click when no decision is selected', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-submit'))

        const feedbackSection = screen.getByTestId('code-review-section')
        await waitFor(() => {
            expect(within(feedbackSection).getByText('Select an option before submitting.')).toBeInTheDocument()
        })
        const approve = screen.getByTestId('code-review-decision-approve')
        expect(approve).toHaveAttribute('aria-invalid', 'true')
        expect(approve.getAttribute('aria-describedby')).toContain('code-review-decision-group-error')
        const errorBox = document.getElementById('code-review-decision-group-error')
        expect(errorBox).toHaveAttribute('aria-live', 'polite')
        expect(errorBox!.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows criteria errors on submit click when no criteria are selected', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await user.click(screen.getByTestId('code-review-submit'))

        const evaluationSection = screen.getByTestId('code-evaluation-section')
        await waitFor(() => {
            expect(within(evaluationSection).getByText('Select an answer for each criterion.')).toBeInTheDocument()
        })
        const firstCriterionRadio = firstRadioIn('criteria-row-proposalAlignment')
        expect(firstCriterionRadio).toHaveAttribute('aria-invalid', 'true')
        expect(firstCriterionRadio.getAttribute('aria-describedby')).toContain('code-evaluation-criteria-error')
        const errorBox = document.getElementById('code-evaluation-criteria-error')
        expect(errorBox).toHaveAttribute('aria-live', 'polite')
        expect(errorBox!.compareDocumentPosition(firstCriterionRadio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('flags the empty feedback field with the lab name on submit click', async () => {
        const user = userEvent.setup()
        const { useReviewFeedback: realUseReviewFeedback } =
            await vi.importActual<typeof import('@/hooks/use-review-feedback')>('@/hooks/use-review-feedback')
        mockUseReviewFeedback.mockImplementation(realUseReviewFeedback)
        const { study, job, orgSlug, nav } = await setupValidReviewableJob('Rice University')
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )
        await screen.findByRole('textbox', { name: 'Code review feedback' }, { timeout: 5000 })

        await user.click(screen.getByTestId('code-review-submit'))

        await waitFor(() => {
            expect(screen.getByText('Enter your feedback for Rice University')).toBeInTheDocument()
        })
    })

    it('does not flag a field on blur before the first submit click', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await visitAndLeave(user, 'criteria-row-proposalAlignment')
        await visitAndLeave(user, 'code-review-section')

        expect(screen.queryByText('Select an answer for each criterion.')).not.toBeInTheDocument()
        expect(screen.queryByText('Select an option before submitting.')).not.toBeInTheDocument()

        await user.click(screen.getByTestId('code-review-submit'))
        await waitFor(() => {
            expect(screen.getByText('Select an answer for each criterion.')).toBeInTheDocument()
            expect(screen.getByText('Select an option before submitting.')).toBeInTheDocument()
        })
    })

    it('scrolls to and focuses the first flagged field, reading top to bottom', async () => {
        const user = userEvent.setup()
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await user.click(screen.getByTestId('code-review-submit'))

        await waitFor(() => expect(document.activeElement).toBe(firstRadioIn('criteria-row-proposalAlignment')))
        expect(scrollIntoView).toHaveBeenCalled()
    })

    it('skips answered fields and focuses the decision group when only it is flagged', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-submit'))

        await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('code-review-decision-approve')))
    })

    it('opens the non-destructive confirmation modal when submitting with needs-clarification', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-needs-clarification'))
        await user.click(screen.getByTestId('code-review-submit'))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent('Request revision?')
        expect(dialog).toHaveTextContent(
            'Your feedback will be sent to Rice University so they can update and resubmit their code.',
        )
        expect(within(dialog).getByRole('button', { name: 'Request revision' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'outline')
    })

    it('opens the approve confirmation modal when submitting with approve', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-approve'))
        await user.click(screen.getByTestId('code-review-submit'))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent('Approve code?')
        expect(dialog).toHaveTextContent('Your approval and feedback will be sent to Rice University')
        expect(within(dialog).getByRole('button', { name: 'Approve code' })).toHaveAttribute('data-variant', 'filled')
    })

    it('calls submitReview with decision=needs-clarification on confirm', async () => {
        const user = userEvent.setup()
        const { study, job, orgSlug, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        await fillAllCriteria(user)
        await user.click(screen.getByTestId('code-review-decision-needs-clarification'))
        await user.click(screen.getByTestId('code-review-submit'))

        const confirmButton = await screen.findByRole('button', { name: 'Request revision' })
        await user.click(confirmButton)

        await waitFor(() => {
            expect(submitReview).toHaveBeenCalledWith({
                decision: 'needs-clarification',
                feedback: 'sample feedback body',
                criteria: {
                    proposalAlignment: 'yes',
                    agreementCompliance: 'yes',
                    privacyProtection: 'yes',
                },
            })
        })
    })

    it('renders "Previous step" as a subtle link to the decided proposal and "Submit decision" as the action', async () => {
        const { study, job, orgSlug, previousHref, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-SUBMITTED" nav={nav} />,
        )

        const previous = screen.getByRole('link', { name: /previous step/i })
        expect(previous).toHaveAttribute('href', previousHref)
        expect(previous).toHaveAttribute('data-variant', 'subtle')
        expect(screen.getByTestId('code-review-submit')).toHaveTextContent('Submit decision')
        expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument()
    })

    it('keeps "Previous step" when the review is closed', async () => {
        const { study, job, orgSlug, previousHref, nav } = await setupValidReviewableJob()
        renderWithProviders(
            <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus="CODE-APPROVED" nav={nav} />,
        )

        expect(screen.getByTestId('code-review-closed-alert')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute('href', previousHref)
        expect(screen.queryByTestId('code-review-submit')).not.toBeInTheDocument()
    })
})
