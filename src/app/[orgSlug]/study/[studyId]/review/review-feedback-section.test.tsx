import { describe, expect, it, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/word-count'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { ReviewFeedbackSection } from './review-feedback-section'

const PLACEHOLDER_TEXT = 'This study is feasible with our current data.'

function FeedbackTestWrapper() {
    const feedback = useReviewFeedback()

    return (
        <>
            <button
                type="button"
                data-testid="simulate-input"
                onClick={() => feedback.onChange(lexicalJson('one two three four five'))}
            >
                simulate input
            </button>
            <ReviewFeedbackSection feedback={feedback} submittingLabName="Test Lab" studyId="test-study-id" />
        </>
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
})
