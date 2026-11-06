import { LegalMarkdownContent } from '@/components/legal/markdown-content'
import { describe, expect, it, renderWithProviders } from '@/tests/unit.helpers'
import { Typography } from '@mantine/core'

describe('LegalMarkdownContent', () => {
    it('wraps long words in legal documents without changing other Typography', () => {
        const { container } = renderWithProviders(
            <>
                <LegalMarkdownContent content={`https://example.com/${'a'.repeat(200)}`} label="Privacy Notice" />
                <Typography>AI summary</Typography>
            </>,
        )

        const [legal, other] = container.querySelectorAll('.mantine-Typography-root')
        expect(legal).toHaveStyle({ overflowWrap: 'anywhere' })
        expect(other).not.toHaveStyle({ overflowWrap: 'anywhere' })
    })

    it('boxes a bounded document but lets an unbounded one flow into the page', () => {
        const bounded = renderWithProviders(<LegalMarkdownContent content="Terms" label="Terms" />)
        expect(bounded.container.querySelector('.mantine-Paper-root')).not.toBeNull()

        const unbounded = renderWithProviders(<LegalMarkdownContent content="Terms" unbounded />)
        expect(unbounded.container.querySelector('.mantine-Paper-root')).toBeNull()
        expect(unbounded.container).toHaveTextContent('Terms')
    })
})
