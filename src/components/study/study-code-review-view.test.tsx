import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { StudyCodeReviewView } from './study-code-review-view'

const sampleFiles: WorkspaceFileInfo[] = [
    { name: 'main.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
    { name: 'helper.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
]

const baseProps = {
    launchWorkspace: vi.fn(),
    isLaunching: false,
    launchError: null,
    uploadFiles: vi.fn(),
    isUploading: false,
    files: sampleFiles,
    mainFile: '',
    setMainFile: vi.fn(),
    removeFile: vi.fn(),
    viewFile: vi.fn(),
    jobCreatedAt: null,
}

describe('StudyCodeReviewView', () => {
    it('renders the header buttons and review-files instructions', () => {
        renderWithProviders(<StudyCodeReviewView {...baseProps} />)
        expect(screen.getByRole('button', { name: /edit files in ide/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
        expect(screen.getByText(/review files/i)).toBeInTheDocument()
        expect(screen.getByText(/select your main file/i)).toBeInTheDocument()
    })

    it('renders each file row', () => {
        renderWithProviders(<StudyCodeReviewView {...baseProps} />)
        expect(screen.getByText('main.R')).toBeInTheDocument()
        expect(screen.getByText('helper.R')).toBeInTheDocument()
    })

    it('calls setMainFile when a star is clicked', async () => {
        const user = userEvent.setup()
        const setMainFile = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} setMainFile={setMainFile} />)
        await user.click(screen.getByRole('button', { name: /set main\.R as main file/i }))
        expect(setMainFile).toHaveBeenCalledWith('main.R')
    })

    it('calls removeFile when the trash button is clicked', async () => {
        const user = userEvent.setup()
        const removeFile = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} removeFile={removeFile} />)
        await user.click(screen.getByRole('button', { name: /remove main\.R/i }))
        expect(removeFile).toHaveBeenCalledWith('main.R')
    })

    it('calls launchWorkspace when Edit files in IDE is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} launchWorkspace={launchWorkspace} />)
        await user.click(screen.getByRole('button', { name: /edit files in ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })
})
