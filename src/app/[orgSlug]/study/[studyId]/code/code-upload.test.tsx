import { vi } from 'vitest'
import {
    describe,
    it,
    expect,
    beforeEach,
    screen,
    waitFor,
    renderWithProviders,
    faker,
    userEvent,
} from '@/tests/unit.helpers'
import { CodeUploadPage } from './code-upload'
import { StudyRequestProvider } from '@/contexts/study-request'
import type { Route } from 'next'
import { type Mock } from 'vitest'

vi.mock('@/server/actions/workspaces.actions', () => ({
    createUserAndWorkspaceAction: vi.fn(),
    getWorkspaceUrlAction: vi.fn(),
    listWorkspaceFilesAction: vi.fn(),
}))

const mockWindowOpen = vi.fn(() => ({ closed: false }))
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true })

import {
    createUserAndWorkspaceAction,
    getWorkspaceUrlAction,
    listWorkspaceFilesAction,
} from '@/server/actions/workspaces.actions'

const studyId = faker.string.uuid()

const renderPage = (orgSlug = 'openstax') => {
    return renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={orgSlug}>
            <CodeUploadPage studyId={studyId} orgSlug={orgSlug} language="R" previousHref={'/test' as Route} />
        </StudyRequestProvider>,
    )
}

const launchIDE = async () => {
    ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
        workspace: { id: 'ws-1' },
    })
    ;(getWorkspaceUrlAction as Mock).mockResolvedValue('https://workspace.example.com')
    ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
        files: ['main.r', 'helper.r'],
        suggestedMain: 'main.r',
        lastModified: '2026-01-15T10:00:00Z',
    })
    mockWindowOpen.mockReturnValue({ closed: false })

    const user = userEvent.setup()
    renderPage()

    // Find and click the Launch IDE button (it's an UnstyledButton with "Launch IDE" text)
    const launchButton = await screen.findByText('Launch IDE')
    await user.click(launchButton)

    // Wait for transition to ide-review mode
    await waitFor(() => {
        expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
    })

    return user
}

describe('CodeUploadPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: [],
            suggestedMain: null,
            lastModified: null,
        })
    })

    it('transitions from upload view to inline IDE review after clicking Launch IDE', async () => {
        ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
            workspace: { id: 'ws-1' },
        })
        ;(getWorkspaceUrlAction as Mock).mockResolvedValue('https://workspace.example.com')
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.r', 'helper.r'],
            suggestedMain: 'main.r',
            lastModified: '2026-01-15T10:00:00Z',
        })
        mockWindowOpen.mockReturnValue({ closed: false })

        const user = userEvent.setup()
        renderPage()

        // Upload chrome visible before launch
        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        expect(screen.getByText('Study code')).toBeInTheDocument()

        // Click Launch IDE
        const launchButton = await screen.findByText('Launch IDE')
        await user.click(launchButton)

        // IDE review shows Step 4 chrome and file list
        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
            expect(screen.getByText('main.r')).toBeInTheDocument()
        })
    })

    it('returns from inline IDE review to upload view when "Back to upload" is clicked', async () => {
        const user = await launchIDE()

        const backButton = screen.getByRole('button', { name: /back to upload/i })
        await user.click(backButton)

        // Upload UI should reappear
        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
        })

        expect(screen.queryByText('Review files from IDE')).not.toBeInTheDocument()
    })

    it('hides non-OpenStax Launch IDE button for non-OpenStax orgs', async () => {
        renderPage('some-other-org')

        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        expect(screen.queryByText('Launch IDE')).not.toBeInTheDocument()
    })
})
