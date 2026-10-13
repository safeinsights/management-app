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
})
