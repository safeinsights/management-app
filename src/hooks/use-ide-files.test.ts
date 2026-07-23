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

// OTTER-516 regression: viewFile must round-trip the file's exact bytes. Reading a png as
// utf-8 corrupts it beyond rendering, so the action hands back an ArrayBuffer as stored.
describe('useIDEFiles viewFile (OTTER-516)', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('returns binary files as their exact bytes', async () => {
        const study = await setupResubmittableStudy()
        const root = await createWorkspaceDir('use-ide-files-view')
        workspaceRoots.push(root)
        // PNG magic header followed by bytes that are not valid utf-8
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xc3, 0x28])
        await writeWorkspaceFiles(root, study.id, { 'plot.png': pngBytes })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.files).toContain('plot.png'))

        await act(async () => {
            await result.current.viewFile('plot.png')
        })

        expect(result.current.viewingFile?.name).toBe('plot.png')
        expect(new Uint8Array(result.current.viewingFile!.contents)).toEqual(pngBytes)
    })
})
