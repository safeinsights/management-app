import { renderWithProviders } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { LegalMarkdownContent } from './markdown-content'

const LONG_URL_DOCUMENT = `# Privacy Notice\n\nhttps://example.com/${'a'.repeat(200)}`

describe('LegalMarkdownContent', () => {
    it('scrolls only vertically, with the scrollbar kept clear of the text', () => {
        const { container } = renderWithProviders(
            <LegalMarkdownContent content={LONG_URL_DOCUMENT} label="Privacy Notice" />,
        )

        const viewport = container.querySelector('.mantine-ScrollArea-viewport')
        expect(viewport).toHaveAttribute('data-scrollbars', 'y')
        expect(viewport).toHaveAttribute('data-offset-scrollbars', 'present')
    })

    it('lets long words wrap inside the box', () => {
        const { container } = renderWithProviders(
            <LegalMarkdownContent content={LONG_URL_DOCUMENT} label="Privacy Notice" />,
        )

        const typography = container.querySelector<HTMLElement>('.mantine-Typography-root')
        expect(typography?.getAttribute('style')).toContain('overflow-wrap: anywhere')
    })

    it('renders the full-page reader without a scroll area', () => {
        const { container } = renderWithProviders(<LegalMarkdownContent content={LONG_URL_DOCUMENT} unbounded />)

        expect(container.querySelector('.mantine-ScrollArea-root')).toBeNull()
    })
})
