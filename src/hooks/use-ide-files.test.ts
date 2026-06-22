import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createTestQueryWrapper, renderHook, waitFor } from '@/tests/unit.helpers'
import { useIDEFiles } from './use-ide-files'
import { useWorkspaceFiles } from './use-workspace-files'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { deleteWorkspaceFileAction, uploadWorkspaceFileAction } from '@/server/actions/workspace-files.actions'
import { getLastSubmissionInfoAction } from '@/server/actions/workspaces.actions'

// IO-only dependencies are mocked: useIDEFiles itself is the unit under test. The workspace
// hooks poll the coder filesystem and the actions hit S3/the workspace dir — both are the
// kind of external side effect the test guidance says to stub.
vi.mock('./use-workspace-files', () => ({ useWorkspaceFiles: vi.fn() }))
vi.mock('./use-workspace-launcher', () => ({ useWorkspaceLauncher: vi.fn() }))
vi.mock('@/server/actions/workspace-files.actions', () => ({
    uploadWorkspaceFileAction: vi.fn().mockResolvedValue({}),
    deleteWorkspaceFileAction: vi.fn().mockResolvedValue({}),
    readWorkspaceFileAction: vi.fn().mockResolvedValue({ fileName: '', contents: '' }),
}))
vi.mock('@/server/actions/study-request', () => ({ submitStudyCodeAction: vi.fn().mockResolvedValue({}) }))
vi.mock('@/server/actions/workspaces.actions', () => ({
    getLastSubmissionInfoAction: vi.fn().mockResolvedValue(null),
    getStarterCodeInfoAction: vi.fn().mockResolvedValue({ starterFiles: [] }),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const renderIDEFiles = () => renderHook(() => useIDEFiles({ studyId: STUDY_ID }), { wrapper: createTestQueryWrapper() })

beforeEach(() => {
    ;(useWorkspaceLauncher as Mock).mockReturnValue({
        launchWorkspace: vi.fn(),
        isLaunching: false,
        isCreatingWorkspace: false,
        error: null,
    })
    ;(useWorkspaceFiles as Mock).mockReturnValue({
        files: [{ name: 'main.R', size: 10, mtime: new Date().toISOString() }],
        suggestedMain: 'main.R',
        lastModified: null,
        isLoading: false,
        refetch: vi.fn(),
    })
})

// OTTER-558 regression: the resubmit footer's Cancel-vs-Save-and-exit toggle must key on real
// session edits, not the mtime-based `filesChanged` (true on load). `userEditedFiles` starts false
// and only flips once the user uploads, deletes, or picks a main file.
describe('useIDEFiles userEditedFiles (OTTER-558)', () => {
    it('is false on initial render', async () => {
        const { result } = renderIDEFiles()
        await waitFor(() => expect(result.current.isLoadingFiles).toBe(false))
        expect(result.current.userEditedFiles).toBe(false)
    })

    it('flips to true after the user picks a main file', async () => {
        const { result } = renderIDEFiles()
        await waitFor(() => expect(result.current.userEditedFiles).toBe(false))
        act(() => result.current.setMainFile('main.R'))
        expect(result.current.userEditedFiles).toBe(true)
    })

    it('flips to true after the user uploads files', async () => {
        const { result } = renderIDEFiles()
        await waitFor(() => expect(result.current.userEditedFiles).toBe(false))
        act(() => result.current.uploadFiles([new File(['x'], 'extra.R')]))
        expect(result.current.userEditedFiles).toBe(true)
        await waitFor(() => expect(uploadWorkspaceFileAction).toHaveBeenCalled())
    })

    it('flips to true after the user removes a file', async () => {
        const { result } = renderIDEFiles()
        await waitFor(() => expect(result.current.userEditedFiles).toBe(false))
        act(() => result.current.removeFile('main.R'))
        expect(result.current.userEditedFiles).toBe(true)
        await waitFor(() => expect(deleteWorkspaceFileAction).toHaveBeenCalled())
    })
})

// Guards that the regression fix did not disturb the separate mtime-based `filesChanged` signal
// the initial /code page relies on for submit-enable.
describe('useIDEFiles filesChanged baseline (no last job)', () => {
    it('reports filesChanged=false when there is no prior submission to compare against', async () => {
        ;(getLastSubmissionInfoAction as Mock).mockResolvedValueOnce(null)
        const { result } = renderIDEFiles()
        await waitFor(() => expect(result.current.isLoadingFiles).toBe(false))
        expect(result.current.filesChanged).toBe(false)
    })
})
