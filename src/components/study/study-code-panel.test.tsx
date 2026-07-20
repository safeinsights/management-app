import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import type { StudyCodeIDE } from './study-code-panel'
import { StudyCodePanel } from './study-code-panel'

const sampleFiles = [
    { name: 'main.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
    { name: 'helper.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
]

function createMockIde(overrides: Partial<StudyCodeIDE> = {}): StudyCodeIDE {
    return {
        launchWorkspace: vi.fn(),
        isLaunching: false,
        launchError: null,
        launchStatus: undefined,
        launchLastUpdatedAt: null,
        launchBuildLog: '',
        launchAgentLog: '',
        isLoadingFiles: false,
        showEmptyState: false,
        lastModified: null,
        files: ['main.R', 'helper.R'],
        fileDetails: sampleFiles,
        jobCreatedAt: null,
        mainFile: '',
        setMainFile: vi.fn(),
        removeFile: vi.fn(),
        viewFile: vi.fn(),
        viewingFile: null,
        closeFileViewer: vi.fn(),
        uploadFiles: vi.fn(),
        isUploading: false,
        isDeleting: false,
        canSubmit: false,
        submitDisabledReason: null,
        submitDirectly: vi.fn(),
        isDirectSubmitting: false,
        filesChanged: false,
        userEditedFiles: false,
        starterFiles: [],
        ...overrides,
    }
}

describe('StudyCodePanel', () => {
    it('renders IDE and upload buttons in review state', () => {
        const ide = createMockIde()
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} />)
        expect(screen.getByRole('button', { name: /edit files in ide/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
    })

    it('calls launchWorkspace when Edit files in IDE is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        const ide = createMockIde({ launchWorkspace })
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} />)
        await user.click(screen.getByRole('button', { name: /edit files in ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })

    it('hides IDE button when showLaunchIde is false', () => {
        const ide = createMockIde()
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} showLaunchIde={false} />)
        expect(screen.queryByRole('button', { name: /edit files in ide/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
    })

    it('does not render header buttons in empty state', () => {
        const ide = createMockIde({ showEmptyState: true, files: [], fileDetails: [] })
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} />)
        expect(screen.queryByRole('button', { name: /edit files in ide/i })).not.toBeInTheDocument()
    })

    it('shows an image preview when viewing a png file (OTTER-516)', () => {
        const contents = new TextEncoder().encode('fake-png-bytes').buffer
        const ide = createMockIde({ viewingFile: { name: 'plot.png', contents } })
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} />)
        expect(screen.getByAltText('plot.png')).toBeInTheDocument()
    })

    it('shows a text preview when viewing a code file', () => {
        const contents = new TextEncoder().encode('print(1)').buffer
        const ide = createMockIde({ viewingFile: { name: 'main.R', contents } })
        renderWithProviders(<StudyCodePanel ide={ide} studyTitle="My Study" footer={null} />)
        expect(screen.getByText(/print/)).toBeInTheDocument()
    })
})
