import { describe, expect, it, renderWithProviders, screen, userEvent, vi, within } from '@/tests/unit.helpers'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { StudyCodePanel } from './study-code-panel'

const sampleFiles = [
    { name: 'main.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
    { name: 'helper.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
]

function createMockIde(overrides: Partial<StudyCodeIDE> = {}): StudyCodeIDE {
    return {
        launchWorkspace: vi.fn(),
        abandonLaunch: vi.fn(),
        isLaunching: false,
        launchError: null,
        launchErrorEventId: null,
        clearLaunchError: vi.fn(),
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
        downloadFile: vi.fn(),
        canEditInIde: true,
        isIdeClaimed: false,
        ideOwnerName: null,
        templateFileNames: [],
        editFileInIde: vi.fn(),
        viewingFile: null,
        closeFileViewer: vi.fn(),
        uploadFiles: vi.fn(),
        pendingDuplicate: null,
        resolveDuplicate: vi.fn(),
        isUploading: false,
        saveStatus: 'idle' as const,
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

// Sole consumer since OTTER-693 moved the Submit code page onto ProposalStepHeader: the /resubmit
// editor. These are also the only guard on the files body and action buttons the two screens share.
describe('StudyCodePanel', () => {
    // uploadFiles parks a colliding name in state and waits for this modal; /resubmit renders the
    // previous round's files, so a same-name upload is the common case rather than an edge one.
    it('prompts to replace or keep both when an upload collides with an existing name', () => {
        const ide = createMockIde({
            pendingDuplicate: new File(['print(1)'], 'main.R', { type: 'text/plain' }),
        })
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Replace existing file?')
        expect(within(dialog).getByRole('button', { name: 'Replace' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Keep both' })).toBeInTheDocument()
    })

    it('never renders a study title line', () => {
        const ide = createMockIde()
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Untitled draft/)).not.toBeInTheDocument()
    })

    // One label since OTTER-693 folded launch-ide-button into launch-ide-control: this screen used
    // to say "Edit files in IDE", and the variant now carries that meaning instead.
    it('renders IDE and upload buttons in review state', () => {
        const ide = createMockIde()
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
    })

    it('calls launchWorkspace when Launch IDE is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        const ide = createMockIde({ launchWorkspace })
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        await user.click(screen.getByRole('button', { name: /launch ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })

    it('hides IDE button when showLaunchIde is false', () => {
        const ide = createMockIde()
        renderWithProviders(
            <StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} showLaunchIde={false} />,
        )
        expect(screen.queryByRole('button', { name: /edit files in ide/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
    })

    it('does not render header buttons in empty state', () => {
        const ide = createMockIde({ showEmptyState: true, files: [], fileDetails: [] })
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        expect(screen.queryByRole('button', { name: /edit files in ide/i })).not.toBeInTheDocument()
    })

    it('shows an image preview when viewing a png file (OTTER-516)', () => {
        const contents = new TextEncoder().encode('fake-png-bytes').buffer
        const ide = createMockIde({ viewingFile: { name: 'plot.png', contents } })
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        expect(screen.getByAltText('plot.png')).toBeInTheDocument()
    })

    it('shows a text preview when viewing a code file', () => {
        const contents = new TextEncoder().encode('print(1)').buffer
        const ide = createMockIde({ viewingFile: { name: 'main.R', contents } })
        renderWithProviders(<StudyCodePanel ide={ide} dataPartnerName="Test Data Partner" footer={null} />)
        expect(screen.getByText(/print/)).toBeInTheDocument()
    })
})
