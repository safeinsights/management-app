import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import type { Mock } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'

vi.mock(import('@/components/spy-mode-context'), async (importOriginal) => ({
    ...(await importOriginal()),
    useSpyMode: vi.fn(),
}))

vi.mock('@/hooks/session', () => ({
    useSession: vi.fn(),
}))

import { useSpyMode } from '@/components/spy-mode-context'
import { useSession } from '@/hooks/session'
import { FilePreviewModal } from './study-code-panel'

const mockUseSpyMode = useSpyMode as Mock
const mockUseSession = useSession as Mock

const file = { name: 'main.py', contents: 'print(1)' }

describe('FilePreviewModal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('does not render the Download link when the feature flag is off', () => {
        mockUseSpyMode.mockReturnValue({ isSpyMode: false })
        mockUseSession.mockReturnValue({
            isLoaded: true,
            session: { orgs: { 'openstax-lab': { slug: 'openstax-lab' } } },
        })

        renderWithProviders(<FilePreviewModal file={file} onClose={() => {}} />)

        expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
    })

    it('renders the Download link with the correct download attribute when the feature flag is on', () => {
        mockUseSpyMode.mockReturnValue({ isSpyMode: true })
        mockUseSession.mockReturnValue({
            isLoaded: true,
            session: { orgs: { 'openstax-lab': { slug: 'openstax-lab' } } },
        })

        renderWithProviders(<FilePreviewModal file={file} onClose={() => {}} />)

        const link = screen.getByRole('link', { name: /download/i })
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('download', 'main.py')
    })

    it('does not render the Download link for a non-OpenStax org even with spy mode on', () => {
        mockUseSpyMode.mockReturnValue({ isSpyMode: true })
        mockUseSession.mockReturnValue({
            isLoaded: true,
            session: { orgs: { 'other-org': { slug: 'other-org' } } },
        })

        renderWithProviders(<FilePreviewModal file={file} onClose={() => {}} />)

        expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
    })
})
