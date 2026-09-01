import { describe, expect, it, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { fieldErrorId } from '@/components/form-field'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { overCharacterLimitError } from '@/lib/field-limits'
import { lexicalJson } from '@/lib/lexical'
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
            <button
                type="button"
                data-testid="simulate-over-limit"
                onClick={() => feedback.onChange(lexicalJson('x'.repeat(REVIEW_FEEDBACK_MAX_CHARACTERS + 1)))}
            >
                simulate over limit
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
    it('displays the character counter and an empty error box while the field is clean', async () => {
        renderWithProviders(<CodeFeedbackTestWrapper />)

        // The collaborative editor is a lazy chunk, so the footer is not in the first render.
        expect(
            await screen.findByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`, {}, { timeout: 5000 }),
        ).toBeInTheDocument()
        expect(document.getElementById(fieldErrorId('code-review-feedback'))).toBeEmptyDOMElement()
    })

    it('renders the empty-field error in the same footer row as the character counter (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderWithProviders(<CodeFeedbackTestWrapper />)

        await user.click(screen.getByTestId('simulate-blur'))

        const errorBox = await waitFor(() => {
            const box = document.getElementById(fieldErrorId('code-review-feedback'))
            expect(box).toHaveTextContent('Feedback is required.')
            return box
        })
        expect(errorBox?.parentElement).toContainElement(screen.getByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`))
    })
})

// OTTER-737: a separate instance of the same rule, so it gets its own boundary coverage.
describe('CodeReviewFeedbackSection character limit', () => {
    const OVER_LIMIT_ERROR = overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS)

    it('names the counter in the editor aria-describedby', async () => {
        renderWithProviders(<CodeFeedbackTestWrapper />)

        const editor = await screen.findByLabelText('Code review feedback')
        const counter = screen.getByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`)
        expect(editor.getAttribute('aria-describedby')).toContain(counter.id)
    })

    it('shows the over-limit message without a blur, and announces it politely', async () => {
        const user = userEvent.setup()
        renderWithProviders(<CodeFeedbackTestWrapper />)

        await user.click(screen.getByTestId('simulate-over-limit'))

        const message = await screen.findByText(OVER_LIMIT_ERROR)
        expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    })
})
