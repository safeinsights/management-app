import { describe, expect, it, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import { fieldErrorId } from '@/components/form-field'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { overCharacterLimitError } from '@/lib/field-limits'
import { ReviewFeedbackProviderShare } from '@/lib/realtime/review-feedback-provider-context'
import { ReviewFeedbackSection } from './review-feedback-section'

vi.mock('@/server/actions/editor.actions', () => ({
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

const PLACEHOLDER_TEXT = 'This study is feasible with our current data.'
const OVER_LIMIT_ERROR = overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS)

function FeedbackTestWrapper() {
    const feedback = useReviewFeedback()

    return (
        <ReviewFeedbackProviderShare>
            <button
                type="button"
                data-testid="simulate-input"
                onClick={() => feedback.onChange(lexicalJson('one two three four five'))}
            >
                simulate input
            </button>
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
            <ReviewFeedbackSection
                feedback={feedback}
                submittingLabName="Test Lab"
                studyId="test-study-id"
                reviewVersion={1}
            />
        </ReviewFeedbackProviderShare>
    )
}

describe('ReviewFeedbackSection', () => {
    it('renders the static section title "Decision"', () => {
        renderWithProviders(<FeedbackTestWrapper />)

        expect(screen.getByText('Decision')).toBeInTheDocument()
    })

    it('renders the new secondary intro copy with the interpolated lab name', () => {
        renderWithProviders(<FeedbackTestWrapper />)

        expect(
            screen.getByText(
                'Share your decision and feedback on this proposal with Test Lab. Consider evaluating the proposal on these criteria:',
            ),
        ).toBeInTheDocument()
    })

    it('renders the three evaluation criteria with only the label bolded', () => {
        renderWithProviders(<FeedbackTestWrapper />)

        expect(screen.getByText('Feasibility:')).toHaveStyle({ fontWeight: 600 })
        expect(screen.getByText('Impact:')).toHaveStyle({ fontWeight: 600 })
        expect(screen.getByText('Researcher background:')).toHaveStyle({ fontWeight: 600 })

        expect(
            screen.getByText(/Can this study be supported with your available data and infrastructure\?/),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Could the results advance the understanding of teaching and learning\?/),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                /Does the researcher have relevant expertise, or appropriate faculty\/PI supervision if they are a student or post-doc\?/,
            ),
        ).toBeInTheDocument()
    })

    it('renders no placeholder text in the editor', async () => {
        renderWithProviders(<FeedbackTestWrapper />)

        await screen.findByRole('textbox')
        expect(screen.queryByText(new RegExp(PLACEHOLDER_TEXT))).not.toBeInTheDocument()
    })

    it('renders a vertical resize handle on the editor', async () => {
        renderWithProviders(<FeedbackTestWrapper />)

        await screen.findByRole('textbox')
        const surface = document.querySelector('.collaborative-editor-container') as HTMLElement
        expect(surface.style.resize).toBe('vertical')
    })

    it('displays the character counter and updates it as the feedback changes', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        expect(screen.getByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`)).toBeInTheDocument()

        await user.click(screen.getByTestId('simulate-input'))

        await waitFor(() => {
            expect(screen.getByText(`23/${REVIEW_FEEDBACK_MAX_CHARACTERS}`)).toBeInTheDocument()
        })
    })

    it('renders the empty-field error in the same footer row as the character counter (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        expect(document.getElementById(fieldErrorId('review-feedback'))).toBeEmptyDOMElement()

        await user.click(screen.getByTestId('simulate-blur'))

        const errorBox = await waitFor(() => {
            const box = document.getElementById(fieldErrorId('review-feedback'))
            expect(box).toHaveTextContent('Feedback is required.')
            return box
        })
        expect(errorBox?.parentElement).toContainElement(screen.getByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`))
    })
})

// OTTER-737: the counter has to be reachable from the editor, and the over-limit message has to
// appear on the keystroke that crosses the cap rather than waiting for a blur.
describe('ReviewFeedbackSection character limit', () => {
    it('names the counter in the editor aria-describedby', async () => {
        renderWithProviders(<FeedbackTestWrapper />)

        const editor = await screen.findByLabelText('Initial request review feedback')
        const counter = screen.getByText(`0/${REVIEW_FEEDBACK_MAX_CHARACTERS}`)
        expect(editor.getAttribute('aria-describedby')).toContain(counter.id)
    })

    it('shows the over-limit message without a blur, and announces it politely', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        await user.click(screen.getByTestId('simulate-over-limit'))

        const message = await screen.findByText(OVER_LIMIT_ERROR)
        expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    })

    it('clears the over-limit message as soon as the feedback is back within the cap', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        await user.click(screen.getByTestId('simulate-over-limit'))
        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()

        await user.click(screen.getByTestId('simulate-input'))

        await waitFor(() => expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument())
    })
})
