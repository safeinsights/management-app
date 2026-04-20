import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { StudyCodeEmptyView } from './study-code-empty-view'

const baseProps = {
    launchWorkspace: vi.fn(),
    isLaunching: false,
    launchError: null,
    uploadFiles: vi.fn(),
    isUploading: false,
    starterFiles: [],
}

describe('StudyCodeEmptyView', () => {
    it('renders both cards with the OR divider and launch button', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} />)
        expect(screen.getByText(/write and test your code in ide/i)).toBeInTheDocument()
        expect(screen.getByText('OR')).toBeInTheDocument()
        expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
    })

    it('calls launchWorkspace when the Launch IDE button is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        renderWithProviders(<StudyCodeEmptyView {...baseProps} launchWorkspace={launchWorkspace} />)
        await user.click(screen.getByRole('button', { name: /launch ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })

    it('shows a starter code link when starterFiles is non-empty', () => {
        renderWithProviders(
            <StudyCodeEmptyView
                {...baseProps}
                starterFiles={[{ name: 'starter.R', url: 'https://example.com/starter.R' }]}
            />,
        )
        const link = screen.getByRole('link', { name: /starter code/i })
        expect(link).toHaveAttribute('href', 'https://example.com/starter.R')
    })

    it('omits the starter code link when starterFiles is empty', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} />)
        expect(screen.queryByRole('link', { name: /starter code/i })).not.toBeInTheDocument()
    })
})
