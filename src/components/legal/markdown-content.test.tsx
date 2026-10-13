import { renderWithProviders } from '@/tests/unit.helpers'
import { Typography } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { LegalMarkdownContent } from './markdown-content'

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
