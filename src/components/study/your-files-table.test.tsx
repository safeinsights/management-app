import { describe, expect, it, renderWithProviders, screen, userEvent, vi, within } from '@/tests/unit.helpers'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { YourFilesTable } from './your-files-table'
import classes from './your-files-table.module.css'

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

    it('disables every star on a view-only table', () => {
        renderWithProviders(<YourFilesTable {...baseProps} isEditable={false} />)
        for (const star of screen.getAllByRole('radio')) {
            expect(star).toBeDisabled()
            expect(star).toHaveClass(classes.star)
        }
    })

    it('calls onView when a file name is clicked', async () => {
        const user = userEvent.setup()
        const onView = vi.fn()
        renderWithProviders(<YourFilesTable {...baseProps} onView={onView} />)
        const fileName = screen.getByRole('button', { name: 'View main.R' })
        expect(fileName).toHaveClass(classes.fileName)
        await user.click(fileName)
        expect(onView).toHaveBeenCalledWith('main.R')
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

    it('paints enabled pencil, download, and trash in icon/light-default', () => {
        renderWithProviders(<YourFilesTable {...baseProps} mainFile="helper.R" />)

        for (const name of ['Edit main.R in IDE', 'Download main.R', 'Delete main.R']) {
            const button = screen.getByRole('button', { name })
            expect(button).toHaveAttribute('data-variant', 'transparent')
            expect(button.querySelector('svg')).toHaveAttribute('fill', 'var(--si-color-icon-light)')
        }
    })

    // A shaded color such as grey.9 makes Mantine cap the light variant's text at shade 6 (4.21:1);
    // the bare ramp reads the theme's text/Sub-labels on surface/page pair instead.
    it('paints the Template badge from the grey light variant pair', () => {
        renderWithProviders(<YourFilesTable {...baseProps} templateFileNames={['main.R']} />)

        const badges = screen.getAllByText('Template')
        expect(badges).toHaveLength(1)
        // text/Sub-labels on surface/page, 9.32:1
        expect(badges[0].closest('.mantine-Badge-root')).toHaveStyle({
            '--badge-bg': '#f1f3f5',
            '--badge-color': '#404040',
        })
    })

    it('shows no Template badge when no file is an untouched template', () => {
        renderWithProviders(<YourFilesTable {...baseProps} />)
        expect(screen.queryByText('Template')).not.toBeInTheDocument()
    })

    // The main file is the one the enclave runs, so it cannot be deleted out from under a submission.
    it('disables delete on the main file', () => {
        renderWithProviders(<YourFilesTable {...baseProps} mainFile="main.R" />)
        const deleteMain = screen.getByRole('button', { name: /delete main\.R/i })
        expect(deleteMain).toBeDisabled()
        expect(deleteMain).toHaveStyle({
            '--mantine-color-disabled': 'transparent',
            '--mantine-color-disabled-color': '#dadee1',
        })
        expect(deleteMain.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
        expect(screen.getByRole('button', { name: /delete helper\.R/i })).toBeEnabled()
    })
})
