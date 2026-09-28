import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { StudyCodeEmptyView } from './study-code-empty-view'

const baseProps = {
    launchWorkspace: vi.fn(),
    isLaunching: false,
    uploadFiles: vi.fn(),
    isUploading: false,
    isIdeClaimed: false,
    canEditInIde: true,
    ideOwnerName: null,
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

    it('hides the IDE section when showLaunchIde is false', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} showLaunchIde={false} />)
        expect(screen.queryByText(/write and test your code in ide/i)).not.toBeInTheDocument()
        expect(screen.queryByText('OR')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
        expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
    })

    // OTTER-693: the empty view carries its own launch and upload affordances, so view-only has to
    // reach them here too and not only on the files card.
    it('drops the IDE section and deadens uploading when isEditable is false', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} isEditable={false} />)
        expect(screen.queryByText(/write and test your code in ide/i)).not.toBeInTheDocument()
        expect(screen.queryByText('OR')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeDisabled()
        // Mantine marks a disabled Dropzone on the root; react-dropzone drops the drop handler.
        expect(screen.getByTestId('file-drop-zone')).toHaveAttribute('data-disabled')
    })
})
