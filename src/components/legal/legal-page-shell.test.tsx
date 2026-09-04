import { describe, expect, it } from 'vitest'
import { pageHeaderEyebrow, renderWithProviders, screen } from '@/tests/unit.helpers'
import { LegalPageShell } from './legal-page-shell'

describe('LegalPageShell', () => {
    it('heads the page with the eyebrow above the page title, once', () => {
        renderWithProviders(<LegalPageShell eyebrow="Genius" title="Legal center" tabs={null} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Legal center' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('Genius')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    it('leaves the eyebrow empty when the page belongs to no org', () => {
        renderWithProviders(<LegalPageShell title="Legal" tabs={null} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Legal' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('')
    })
})
