import { renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { useCodeReviewFeedback } from '@/hooks/use-code-review-feedback'
import { lexicalJson } from '@/lib/lexical'
import { describe, expect, it, vi } from 'vitest'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'

vi.mock('@/server/actions/editor.actions', () => ({
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

function Harness({ labName, words }: { labName: string; words?: string }) {
    const feedback = useCodeReviewFeedback()
    return (
        <>
            <button
                type="button"
                data-testid="simulate-input"
                onClick={() => feedback.onChange(lexicalJson(words ?? ''))}
            >
                simulate input
            </button>
            <CodeReviewFeedbackSection feedback={feedback} labName={labName} studyId="test-study-id" />
        </>
    )
}

describe('CodeReviewFeedbackSection', () => {
    it('renders the "Code review" section title', () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        expect(screen.getByText('Code review')).toBeInTheDocument()
    })

    it('renders the lab name inline in the description', () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        expect(screen.getByText(/Share your feedback on this code submission with Bayes Lab/)).toBeInTheDocument()
    })

    it('starts with a 0/300 word counter', async () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        // The CollaborativeEditor is dynamically imported (ssr:false); wait for it to mount
        // before asserting on its footer-rendered word counter.
        await waitFor(
            () => {
                expect(screen.getByText('0/300')).toBeInTheDocument()
            },
            { timeout: 5000 },
        )
    })

    it('updates the word counter when feedback content changes', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness labName="Bayes Lab" words="one two three four five" />)
        await user.click(screen.getByTestId('simulate-input'))
        await waitFor(
            () => {
                expect(screen.getByText('5/300')).toBeInTheDocument()
            },
            { timeout: 5000 },
        )
    })

    it('flips the word counter into the over-limit state when content exceeds 300 words', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness labName="Bayes Lab" words={'word '.repeat(301).trim()} />)
        await user.click(screen.getByTestId('simulate-input'))
        await waitFor(
            () => {
                expect(screen.getByText('301/300')).toBeInTheDocument()
            },
            { timeout: 5000 },
        )
    })
})
