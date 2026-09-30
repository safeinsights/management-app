import { describe, expect, it, renderWithProviders, screen, userEvent, vi, within } from '@/tests/unit.helpers'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { YourFilesTable } from './your-files-table'

const sampleFiles: WorkspaceFileInfo[] = [
    { name: 'main.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
    { name: 'helper.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
]

const baseProps = {
    files: sampleFiles,
    mainFile: '',
    templateFileNames: [],
    dataPartnerName: 'Test Data Partner',
    canEditInIde: true,
    ideOwnerName: null,
    onSelectMain: vi.fn(),
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
}

describe('YourFilesTable', () => {
    it('renders each file row', () => {
        renderWithProviders(<YourFilesTable {...baseProps} />)
        expect(screen.getByText('main.R')).toBeInTheDocument()
        expect(screen.getByText('helper.R')).toBeInTheDocument()
    })

    it('calls onSelectMain when a star is clicked', async () => {
        const user = userEvent.setup()
        const onSelectMain = vi.fn()
        renderWithProviders(<YourFilesTable {...baseProps} onSelectMain={onSelectMain} />)
        await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))
        expect(onSelectMain).toHaveBeenCalledWith('main.R')
    })

    it('confirms before removing a file', async () => {
        const user = userEvent.setup()
        const onDelete = vi.fn()
        renderWithProviders(<YourFilesTable {...baseProps} onDelete={onDelete} />)

        await user.click(screen.getByRole('button', { name: /delete main\.R/i }))
        expect(onDelete).not.toHaveBeenCalled()

        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Delete file' }))
        expect(onDelete).toHaveBeenCalledWith('main.R')
    })

    // The main file is the one the enclave runs, so it cannot be deleted out from under a submission.
    it('disables delete on the main file', () => {
        renderWithProviders(<YourFilesTable {...baseProps} mainFile="main.R" />)
        expect(screen.getByRole('button', { name: /delete main\.R/i })).toBeDisabled()
        expect(screen.getByRole('button', { name: /delete helper\.R/i })).toBeEnabled()
    })
})
