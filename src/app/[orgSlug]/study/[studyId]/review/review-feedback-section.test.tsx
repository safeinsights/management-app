import {
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    simulateEditorSave,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import { fieldErrorId } from '@/components/form-field'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { overCharacterLimitError } from '@/lib/field-limits'
import { ReviewFeedbackProviderShare } from '@/lib/realtime/review-feedback-provider-context'
import { SAVED_LABEL } from '@/components/save-status'
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
    it('renders the editor placeholder text', async () => {
        renderWithProviders(<FeedbackTestWrapper />)

        await waitFor(
            () => {
                expect(screen.getByText(new RegExp(PLACEHOLDER_TEXT))).toBeInTheDocument()
            },
            { timeout: 5000 },
        )
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

// The two are competing claims about the same field, so they must never share the screen. Driving
// a real save first is what makes this worth running: with the save indicator stuck at idle the
// assertion below would hold no matter what the component did.
describe('ReviewFeedbackSection save label and error exclusivity', () => {
    it('replaces the save label with the empty-field error rather than showing both', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        await screen.findByLabelText('Initial request review feedback')
        await simulateEditorSave()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)

        await user.click(screen.getByTestId('simulate-blur'))

        await waitFor(() => {
            expect(document.getElementById(fieldErrorId('review-feedback'))).toHaveTextContent('Feedback is required.')
        })
        expect(screen.queryByTestId('autosave-status')).toBeNull()
    })
})
