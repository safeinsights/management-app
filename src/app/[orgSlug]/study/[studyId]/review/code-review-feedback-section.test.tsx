import { describe, expect, it, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { fieldErrorId } from '@/components/form-field'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'

vi.mock('@/server/actions/editor.actions', () => ({
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

function CodeFeedbackTestWrapper() {
    const feedback = useReviewFeedback()

    return (
        <CodeReviewFeedbackProviderShare>
            <button type="button" data-testid="simulate-blur" onClick={() => feedback.onBlur()}>
                simulate blur
            </button>
            <CodeReviewFeedbackSection
                feedback={feedback}
                studyId="test-study-id"
                jobId="test-job-id"
                decisionValue={null}
                onDecisionChange={vi.fn()}
                onDecisionBlur={vi.fn()}
                decisionError={null}
                labName="Test Lab"
            />
        </CodeReviewFeedbackProviderShare>
    )
}

describe('CodeReviewFeedbackSection', () => {
    it('displays the word counter and no error box while the field is clean', async () => {
        renderWithProviders(<CodeFeedbackTestWrapper />)

        // findByText: the collaborative editor is a lazy chunk, so the footer is not in the first render.
        expect(await screen.findByText('0/500', {}, { timeout: 5000 })).toBeInTheDocument()
        expect(document.getElementById(fieldErrorId('code-review-feedback'))).toBeNull()
    })

    it('renders the empty-field error in the same footer row as the word counter (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderWithProviders(<CodeFeedbackTestWrapper />)

        await user.click(screen.getByTestId('simulate-blur'))

        const errorBox = await waitFor(() => {
            const box = document.getElementById(fieldErrorId('code-review-feedback'))
            expect(box).toHaveTextContent('Feedback is required.')
            return box
        })
        expect(errorBox?.parentElement).toContainElement(screen.getByText('0/500'))
    })
})
