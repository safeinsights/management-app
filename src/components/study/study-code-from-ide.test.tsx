import { vi } from 'vitest'
import { describe, it, expect, beforeEach, screen, waitFor, renderWithProviders, faker } from '@/tests/unit.helpers'
import { StudyCodeFromIDE } from './study-code-from-ide'
import { StudyRequestProvider } from '@/contexts/study-request'
import { type Mock } from 'vitest'
import type { Route } from 'next'

vi.mock('@/server/actions/workspaces.actions', () => ({
    createUserAndWorkspaceAction: vi.fn(),
    getWorkspaceUrlAction: vi.fn(),
    listWorkspaceFilesAction: vi.fn(),
}))

const mockWindowOpen = vi.fn()
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true })

import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

const studyId = faker.string.uuid()
const previousHref = `/test-org/study/${studyId}/agreements` as Route

const renderIDE = (studyOrgSlug = 'openstax-lab') => {
    return renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={studyOrgSlug}>
            <StudyCodeFromIDE studyId={studyId} studyOrgSlug={studyOrgSlug} previousHref={previousHref} />
        </StudyRequestProvider>,
    )
}

describe('StudyCodeFromIDE', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: [],
            suggestedMain: null,
            lastModified: null,
        })
    })

    it('renders "Review files from IDE" heading', async () => {
        renderIDE()

        await waitFor(() => {
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
        })
    })

    it('renders "Back to upload" and "Submit code" buttons', async () => {
        renderIDE()

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /back to upload/i })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeInTheDocument()
        })
    })

    it('disables Submit code when no files', async () => {
        renderIDE()

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })
    })

    it('shows Launch IDE button for OpenStax orgs', async () => {
        renderIDE('openstax')

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('hides Launch IDE button for non-OpenStax orgs', async () => {
        renderIDE('some-other-org')

        await waitFor(() => {
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
        })

        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
    })

    it('shows empty state when workspace has no files', async () => {
        renderIDE()

        await waitFor(() => {
            expect(screen.getByText('No files found in workspace.')).toBeInTheDocument()
        })
    })

    it('renders Step 4 chrome', async () => {
        renderIDE()

        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
        })
    })

    it('renders Previous button linking to agreements', async () => {
        renderIDE()

        await waitFor(() => {
            const previousLink = screen.getByRole('link', { name: /previous/i })
            expect(previousLink).toBeInTheDocument()
            expect(previousLink).toHaveAttribute('href', previousHref)
        })
    })

    it('renders file review table with headers and main-file radio when workspace has files', async () => {
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.r', 'helper.r'],
            suggestedMain: 'main.r',
            lastModified: '2026-01-15T10:00:00Z',
        })

        renderIDE()

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        // Table headers from FileReviewTable
        expect(screen.getByText('Main file')).toBeInTheDocument()
        expect(screen.getByText('File name')).toBeInTheDocument()

        // Radio controls for main file selection — suggestedMain='main.r' should be checked
        const radios = screen.getAllByRole('radio')
        expect(radios).toHaveLength(2)
        expect(radios[0]).toBeChecked()
        expect(radios[1]).not.toBeChecked()

        // Submit should be enabled when files exist
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })
})
