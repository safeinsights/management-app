import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { FilePreviewModal } from './study-code-panel'

describe('FilePreviewModal', () => {
    it('renders the Download link with the correct download attribute once contents are loaded', () => {
        renderWithProviders(<FilePreviewModal file={{ name: 'main.py', contents: 'print(1)' }} onClose={() => {}} />)

        const link = screen.getByRole('link', { name: /download/i })
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('download', 'main.py')
    })

    it('hides the Download link while contents are loading', () => {
        renderWithProviders(<FilePreviewModal file={{ name: 'main.py', contents: null }} onClose={() => {}} />)

        expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
        expect(screen.getByTestId('file-preview-loading')).toBeInTheDocument()
    })

    it('renders nothing when file is null', () => {
        const { container } = renderWithProviders(<FilePreviewModal file={null} onClose={() => {}} />)

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(container.querySelector('[data-testid="file-preview-loading"]')).toBeNull()
    })
})
