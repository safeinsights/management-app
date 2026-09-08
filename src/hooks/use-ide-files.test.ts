import {
    act,
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createTestQueryWrapper,
    createWorkspaceDir,
    db,
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

// The study stays APPROVED while the resubmittable state lives on the job (OTTER-558).
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

// OTTER-558 regression: the footer's Cancel toggle must key on real session edits, not the
// mtime-based `filesChanged`, which is already true on load.
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

describe('useIDEFiles mainFile (OTTER-729)', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    const submitCodeFiles = (studyJobId: string, mainFileName: string, supplemental: string[]) =>
        db
            .insertInto('studyJobFile')
            .values([
                { studyJobId, name: mainFileName, path: `code/${mainFileName}`, fileType: 'MAIN-CODE' as const },
                ...supplemental.map((name) => ({
                    studyJobId,
                    name,
                    path: `code/${name}`,
                    fileType: 'SUPPLEMENTAL-CODE' as const,
                })),
            ])
            .execute()

    it("inherits the previous submission's main file instead of defaulting to main.r", async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-CHANGES-REQUESTED',
        })
        await submitCodeFiles(job.id, 'task_plot.r', ['main.r'])

        const root = await createWorkspaceDir('use-ide-files-inherit-main')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'task_plot.r': 'plot()', 'main.r': 'print(1)' })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.mainFile).toBe('task_plot.r'))
    })

    it('leaves the main file unset when multiple files exist and the previous submission recorded no main file', async () => {
        const study = await setupResubmittableStudy()
        const root = await createWorkspaceDir('use-ide-files-no-autostar')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'main.r': 'print(1)', 'helper.r': 'print(2)' })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.files).toHaveLength(2))
        expect(result.current.mainFile).toBe('')
        expect(result.current.canSubmit).toBe(false)
    })

    it('defaults to the only file when a single file is uploaded', async () => {
        const study = await setupResubmittableStudy()
        const root = await createWorkspaceDir('use-ide-files-single')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'analysis.r': 'print(1)' })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.mainFile).toBe('analysis.r'))
    })

    it('leaves the main file unset when the previous main file is no longer in the workspace', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-CHANGES-REQUESTED',
        })
        await submitCodeFiles(job.id, 'task_plot.r', ['helper.r'])

        const root = await createWorkspaceDir('use-ide-files-missing-previous-main')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'analysis.r': 'print(1)', 'main.r': 'print(2)' })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => {
            expect(result.current.files).toHaveLength(2)
            expect(result.current.filesChanged).toBe(true)
        })
        expect(result.current.mainFile).toBe('')
        expect(result.current.canSubmit).toBe(false)
    })

    it('lets an explicit star selection override an inherited main file', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-CHANGES-REQUESTED',
        })
        await submitCodeFiles(job.id, 'task_plot.r', ['main.r'])

        const root = await createWorkspaceDir('use-ide-files-override-inherited')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'task_plot.r': 'plot()', 'main.r': 'print(1)' })

        const { result } = renderIDEFiles(study.id)
        await waitFor(() => expect(result.current.mainFile).toBe('task_plot.r'))

        act(() => result.current.setMainFile('main.r'))
        expect(result.current.mainFile).toBe('main.r')
    })
})

// OTTER-516 regression: reading a png as utf-8 corrupts it beyond rendering, so the action hands
// back an ArrayBuffer as stored.
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
        // PNG magic header followed by bytes that are not valid utf-8.
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
