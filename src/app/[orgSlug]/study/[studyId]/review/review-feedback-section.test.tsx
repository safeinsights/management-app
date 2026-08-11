import { describe, expect, it, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import { fieldErrorId } from '@/components/form-field'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { ReviewFeedbackProviderShare } from '@/lib/realtime/review-feedback-provider-context'
import { ReviewFeedbackSection } from './review-feedback-section'

vi.mock('@/server/actions/editor.actions', () => ({
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

const PLACEHOLDER_TEXT = 'This study is feasible with our current data.'

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

    it('displays the word counter and updates it as the feedback changes', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        expect(screen.getByText('0/500')).toBeInTheDocument()

        await user.click(screen.getByTestId('simulate-input'))

        await waitFor(() => {
            expect(screen.getByText('5/500')).toBeInTheDocument()
        })
    })

    it('renders the empty-field error in the same footer row as the word counter (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderWithProviders(<FeedbackTestWrapper />)

        expect(document.getElementById(fieldErrorId('review-feedback'))).toBeNull()

        await user.click(screen.getByTestId('simulate-blur'))

        const errorBox = await waitFor(() => {
            const box = document.getElementById(fieldErrorId('review-feedback'))
            expect(box).toHaveTextContent('Feedback is required.')
            return box
        })
        expect(errorBox?.parentElement).toContainElement(screen.getByText('0/500'))
    })
})
