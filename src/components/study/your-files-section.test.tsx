import { describe, expect, it, renderWithProviders, screen, vi, within } from '@/tests/unit.helpers'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { showsLaunchIdeControl } from './study-code-files'
import { YourFilesSection } from './your-files-section'

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

const launchIde = () => screen.queryByRole('button', { name: /launch ide/i })

describe('YourFilesSection', () => {
    describe('as its own card (Submit code)', () => {
        it('renders the Launch IDE control in the section header', () => {
            renderWithProviders(<YourFilesSection ide={createMockIde()} dataPartnerName="Test Data Partner" />)

            const section = screen.getByTestId('your-files-section')
            expect(within(section).getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
            expect(within(section).getByTestId('your-files-divider')).toBeInTheDocument()
        })

        it('hides Launch IDE in view-only mode', () => {
            renderWithProviders(
                <YourFilesSection ide={createMockIde()} dataPartnerName="Test Data Partner" isEditable={false} />,
            )

            expect(launchIde()).not.toBeInTheDocument()
        })

        it('carries no description unless one is given', () => {
            renderWithProviders(<YourFilesSection ide={createMockIde()} dataPartnerName="Test Data Partner" />)

            expect(screen.getByTestId('your-files-section')).toHaveTextContent('Code files')
            expect(screen.queryByText(/View and manage your code files/)).not.toBeInTheDocument()
        })
    })

    // OTTER-778: /resubmit nests this inside the step header panel, which supplies the card and the
    // Launch IDE — a second one here would put two on screen.
    describe('nested in another panel (Edit code)', () => {
        it('renders no Launch IDE of its own', () => {
            renderWithProviders(<YourFilesSection ide={createMockIde()} dataPartnerName="Test Data Partner" isNested />)

            expect(launchIde()).not.toBeInTheDocument()
        })

        it('drops the card rule and shows the description under the title', () => {
            renderWithProviders(
                <YourFilesSection
                    ide={createMockIde()}
                    dataPartnerName="Test Data Partner"
                    description="View and manage your code files."
                    isNested
                />,
            )

            const section = screen.getByTestId('your-files-section')
            expect(section).toHaveTextContent('Code files')
            expect(section).toHaveTextContent('View and manage your code files.')
            expect(within(section).queryByTestId('your-files-divider')).not.toBeInTheDocument()
        })

        it('still renders the files table and the upload affordance', () => {
            renderWithProviders(<YourFilesSection ide={createMockIde()} dataPartnerName="Test Data Partner" isNested />)

            expect(screen.getByText('main.R')).toBeInTheDocument()
            expect(screen.getByTestId('already-have-code')).toBeInTheDocument()
        })
    })
})

describe('showsLaunchIdeControl', () => {
    it('shows only once the files have loaded', () => {
        expect(showsLaunchIdeControl({ ide: createMockIde() })).toBe(true)
        expect(showsLaunchIdeControl({ ide: createMockIde({ isLoadingFiles: true }) })).toBe(false)
        expect(showsLaunchIdeControl({ ide: createMockIde({ showEmptyState: true }) })).toBe(false)
    })

    it('is off for a view-only screen or a study with no code environment', () => {
        expect(showsLaunchIdeControl({ ide: createMockIde(), isEditable: false })).toBe(false)
        expect(showsLaunchIdeControl({ ide: createMockIde(), showLaunchIde: false })).toBe(false)
    })
})
