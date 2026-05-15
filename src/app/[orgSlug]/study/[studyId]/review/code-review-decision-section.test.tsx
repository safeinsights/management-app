import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useCodeReviewDecision } from '@/hooks/use-code-review-decision'
import type { CodeDecision } from '@/lib/code-review'
import { describe, expect, it } from 'vitest'
import { CodeReviewDecisionSection } from './code-review-decision-section'

function Harness({ labName, onChange }: { labName: string; onChange?: (value: CodeDecision | null) => void }) {
    const decision = useCodeReviewDecision()
    return (
        <CodeReviewDecisionSection
            decision={{
                selected: decision.selected,
                onSelect: (next) => {
                    const value = typeof next === 'function' ? next(decision.selected) : next
                    decision.onSelect(value)
                    onChange?.(value)
                },
            }}
            labName={labName}
        />
    )
}

describe('CodeReviewDecisionSection', () => {
    it('renders the three decision radios with the spec-defined labels', () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        expect(screen.getByRole('radio', { name: /Approve and run code/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Request revision/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Reject and end study/i })).toBeInTheDocument()
    })

    it('splices the lab name into each description', () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        // Lab name appears in the section intro plus in the approve + request-revision + reject descriptions.
        expect(screen.getAllByText('Bayes Lab').length).toBeGreaterThanOrEqual(3)
    })

    it('renders the reject warning text', () => {
        renderWithProviders(<Harness labName="Bayes Lab" />)
        expect(screen.getByText(/This terminates the study and cannot be undone/i)).toBeInTheDocument()
    })

    it('selects a single radio at a time and reports the value', async () => {
        const user = userEvent.setup()
        const selections: (CodeDecision | null)[] = []
        renderWithProviders(<Harness labName="Bayes Lab" onChange={(v) => selections.push(v)} />)

        await user.click(screen.getByRole('radio', { name: /Approve and run code/i }))
        expect(screen.getByRole('radio', { name: /Approve and run code/i })).toBeChecked()
        expect(screen.getByRole('radio', { name: /Request revision/i })).not.toBeChecked()

        await user.click(screen.getByRole('radio', { name: /Reject and end study/i }))
        expect(screen.getByRole('radio', { name: /Reject and end study/i })).toBeChecked()
        expect(screen.getByRole('radio', { name: /Approve and run code/i })).not.toBeChecked()

        expect(selections).toEqual(['approve', 'reject'])
    })
})
