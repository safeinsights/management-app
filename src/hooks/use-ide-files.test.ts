import {
    act,
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createTestQueryWrapper,
    createWorkspaceDir,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderHook,
    waitFor,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { useIDEFiles } from './use-ide-files'

const workspaceRoots: string[] = []

const renderIDEFiles = (studyId: string) =>
    renderHook(() => useIDEFiles({ studyId }), { wrapper: createTestQueryWrapper() })

// An APPROVED study whose code change was requested is the real state a researcher edits in: the
// study stays APPROVED while the resubmittable state lives on the job (OTTER-558).
const setupResubmittableStudy = async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'APPROVED',
        jobStatus: 'CODE-CHANGES-REQUESTED',
    })
    return study
}

// OTTER-558 regression: the resubmit footer's Cancel-vs-Save-and-exit toggle must key on real
// session edits, not the mtime-based `filesChanged` (true on load). `userEditedFiles` starts false
// and only flips once the user uploads, deletes, or picks a main file.
describe('useIDEFiles userEditedFiles (OTTER-558)', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('is false on initial render', async () => {
        const study = await setupResubmittableStudy()
        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.isLoadingFiles).toBe(false))
        expect(result.current.userEditedFiles).toBe(false)
    })

    it('flips to true after the user picks a main file', async () => {
        const study = await setupResubmittableStudy()
        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.userEditedFiles).toBe(false))
        act(() => result.current.setMainFile('main.R'))
        await waitFor(() => expect(result.current.userEditedFiles).toBe(true))
    })

    it('flips to true after the user uploads files', async () => {
        const study = await setupResubmittableStudy()
        const root = await createWorkspaceDir('use-ide-files-upload')
        workspaceRoots.push(root)
        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.userEditedFiles).toBe(false))
        act(() => result.current.uploadFiles([new File(['print(1)'], 'extra.R')]))
        await waitFor(() => expect(result.current.userEditedFiles).toBe(true))
    })

    it('flips to true after the user removes a file', async () => {
        const study = await setupResubmittableStudy()
        const root = await createWorkspaceDir('use-ide-files-remove')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'main.R': 'print(1)' })
        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.files).toContain('main.R'))
        act(() => result.current.removeFile('main.R'))
        await waitFor(() => expect(result.current.userEditedFiles).toBe(true))
    })
})
