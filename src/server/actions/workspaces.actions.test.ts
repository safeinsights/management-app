import {
    mockSessionWithTestData,
    actionResult,
    createTestProposalDraft,
    insertTestBaselineJob,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestCodeEnv,
    insertTestStudyOnly,
    insertTestUser,
    mockClerkSession,
    db,
} from '@/tests/unit.helpers'
import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pathForStarterCode } from '@/lib/paths'
import { MAX_UPLOAD_FILE_BYTES } from '@/lib/types'
import type { StudyJobStatus } from '@/database/types'

// Echo the key back so a test can assert which S3 key gets signed.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async (key: string) => `https://signed.example/${key}`),
    }
})

describe('Workspace Actions', () => {
    const TEST_CODER_FILES = '/tmp/coder-test-suite-' + Math.random().toString(36).slice(2)

    const originalCoderFiles = process.env.CODER_FILES

    fs.rm(TEST_CODER_FILES, { recursive: true, force: true })

    beforeEach(() => {
        vi.resetModules()

        vi.doMock('@/server/config', async (importOriginal) => {
            const mod = await importOriginal<typeof import('@/server/config')>()
            return {
                ...mod,
                CODER_DISABLED: false,
                getConfigValue: vi.fn().mockImplementation((key) => process.env[key]),
            }
        })
    })

    afterEach(async () => {
        try {
            await fs.rm(TEST_CODER_FILES, { recursive: true, force: true })
        } catch {
            // best-effort cleanup; a failure here must not fail the test
        }

        if (originalCoderFiles) {
            process.env.CODER_FILES = originalCoderFiles
        } else {
            delete process.env.CODER_FILES
        }
    })

    test('listWorkspaceFilesAction gracefully handles missing workspace directory', async () => {
        process.env.CODER_FILES = TEST_CODER_FILES

        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const { listWorkspaceFilesAction } = await import('./workspaces.actions')

        const result = actionResult(await listWorkspaceFilesAction({ studyId: study.id }))

        expect(result).toMatchObject({
            files: [],
        })
    })

    test('listWorkspaceFilesAction lists files from workspace directory', async () => {
        process.env.CODER_FILES = TEST_CODER_FILES

        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const studyDir = path.join(TEST_CODER_FILES, study.id)

        await fs.mkdir(studyDir, { recursive: true })
        await fs.writeFile(path.join(studyDir, 'main.py'), 'print("hello")')
        await fs.writeFile(path.join(studyDir, 'README.md'), '# readme')
        await fs.writeFile(path.join(studyDir, 'data.csv'), '1,2,3')
        await fs.mkdir(path.join(studyDir, 'subdir'))

        const { listWorkspaceFilesAction } = await import('./workspaces.actions')

        const result = actionResult(await listWorkspaceFilesAction({ studyId: study.id }))

        const fileNames = result.files.map((f: { name: string }) => f.name)
        expect(fileNames).toContain('main.py')
        expect(fileNames).toContain('README.md')
        expect(result.files).toHaveLength(3)
        expect(result.files[0]).toHaveProperty('size')
        expect(result.files[0]).toHaveProperty('mtime')
    })

    describe('listWorkspaceFileActivityAction (OTTER-778)', () => {
        const recordActivity = (
            studyId: string,
            userId: string,
            action: 'UPLOADED' | 'EDITED_IN_IDE',
            createdAt: Date,
        ) =>
            db
                .insertInto('workspaceFileActivity')
                .values({ studyId, fileName: 'main.py', action, userId, createdAt })
                .execute()

        test('returns the activity from before the submission, not edits made since', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await recordActivity(study.id, user.id, 'UPLOADED', new Date(Date.now() - 86_400_000))
            await recordActivity(study.id, user.id, 'EDITED_IN_IDE', new Date(Date.now() + 86_400_000))

            const { listWorkspaceFileActivityAction } = await import('./workspaces.actions')
            const result = actionResult(await listWorkspaceFileActivityAction({ studyId: study.id, jobId: job.id }))

            expect(result).toEqual({ 'main.py': expect.objectContaining({ action: 'UPLOADED' }) })
        })

        test('returns nothing for a job from another study', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
            const { job: otherJob } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await recordActivity(study.id, user.id, 'UPLOADED', new Date(Date.now() - 86_400_000))

            const { listWorkspaceFileActivityAction } = await import('./workspaces.actions')
            const result = actionResult(
                await listWorkspaceFileActivityAction({ studyId: study.id, jobId: otherJob.id }),
            )

            expect(result).toEqual({})
        })
    })

    describe('getStarterCodeInfoAction', () => {
        test('signs the full starter-code key, not the bare file name', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id, language: 'R' })
            const codeEnv = await insertTestCodeEnv({
                orgId: org.id,
                language: 'R',
                starterCodeFileNames: ['main.R'],
            })

            const { getStarterCodeInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getStarterCodeInfoAction({ studyId: study.id }))

            const expectedKey = pathForStarterCode({ orgSlug: org.slug, codeEnvId: codeEnv.id, fileName: 'main.R' })
            expect(result.starterFiles).toHaveLength(1)
            expect(result.starterFiles[0].name).toBe('main.R')
            expect(result.starterFiles[0].url).toContain(expectedKey)
            // the original bug signed the bare name as the key, which resolves to the bucket root
            expect(result.starterFiles[0].url).not.toBe('https://signed.example/main.R')
        })

        test('returns no starter files when the code env has none', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id, language: 'R' })
            await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: [] })

            const { getStarterCodeInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getStarterCodeInfoAction({ studyId: study.id }))

            expect(result.starterFiles).toEqual([])
        })
    })

    // OTTER-601: the submit-enable baseline is the last *submission* time, not the round job's
    // createdAt, or relaunching an already-submitted study re-enables Submit with no edits.
    describe('getLastSubmissionInfoAction', () => {
        test('with no submission, falls back to the round job createdAt and no files', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'INITIATED',
            })

            const { getLastSubmissionInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getLastSubmissionInfoAction({ studyId: study.id }))

            const jobRow = await db
                .selectFrom('studyJob')
                .select('createdAt')
                .where('id', '=', job.id)
                .executeTakeFirstOrThrow()
            expect(result?.createdAt).toBe(jobRow.createdAt.toISOString())
            expect(result?.fileNames).toEqual([])
            expect(result?.mainFileName).toBeNull()
        })

        test('anchors on the CODE-SUBMITTED time and returns the submitted files', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'INITIATED',
            })
            await db
                .insertInto('studyJobFile')
                .values([
                    { studyJobId: job.id, name: 'main.r', path: `p/${job.id}/main.r`, fileType: 'MAIN-CODE' },
                    {
                        studyJobId: job.id,
                        name: 'helper.r',
                        path: `p/${job.id}/helper.r`,
                        fileType: 'SUPPLEMENTAL-CODE',
                    },
                ])
                .execute()
            const submittedAt = new Date('2026-01-01T00:00:00.000Z')
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: job.id, status: 'CODE-SUBMITTED', createdAt: submittedAt })
                .execute()

            const { getLastSubmissionInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getLastSubmissionInfoAction({ studyId: study.id }))

            expect(result?.createdAt).toBe(submittedAt.toISOString())
            expect(result?.mainFileName).toBe('main.r')
            expect(result?.fileNames.sort()).toEqual(['helper.r', 'main.r'])
        })

        test('ignores a newer INITIATED round job and keeps the prior submission as the baseline', async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'INITIATED',
            })
            const submittedAt = new Date('2026-01-01T00:00:00.000Z')
            await db
                .insertInto('studyJobFile')
                .values({ studyJobId: job.id, name: 'main.r', path: `p/${job.id}/main.r`, fileType: 'MAIN-CODE' })
                .execute()
            await db
                .insertInto('jobStatusChange')
                .values([
                    { studyJobId: job.id, status: 'CODE-SUBMITTED', createdAt: submittedAt },
                    { studyJobId: job.id, status: 'CODE-CHANGES-REQUESTED', createdAt: submittedAt },
                ])
                .execute()

            await insertTestBaselineJob(study.id)

            const { getLastSubmissionInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getLastSubmissionInfoAction({ studyId: study.id }))

            expect(result?.createdAt).toBe(submittedAt.toISOString())
            expect(result?.fileNames).toEqual(['main.r'])
        })
    })

    // OTTER-602: the OTTER-601 re-anchor is correct only on an empty round; with files present it
    // marks them all stale.
    describe('ensureWorkspaceAction submit-enable baseline (OTTER-602)', () => {
        const mockCoder = () =>
            // Spread the real module: a bare factory drops exports the actions import (e.g. the
            // starter-code copy) and the mock then leaks into every later test in this file.
            vi.doMock('@/server/coder', async (importOriginal) => ({
                ...(await importOriginal<typeof import('@/server/coder')>()),
                createUserAndWorkspace: vi.fn(async () => ({ success: true, workspace: { id: 'ws-test' } })),
            }))

        const jobCreatedAt = async (jobId: string) =>
            (await db.selectFrom('studyJob').select('createdAt').where('id', '=', jobId).executeTakeFirstOrThrow())
                .createdAt

        test('does not advance the round job createdAt when files were already uploaded', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()

            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'INITIATED',
            })

            const backdated = new Date(Date.now() - 60_000)
            await db.updateTable('studyJob').set({ createdAt: backdated }).where('id', '=', job.id).execute()

            const studyDir = path.join(TEST_CODER_FILES, study.id)
            await fs.mkdir(studyDir, { recursive: true })
            await fs.writeFile(path.join(studyDir, 'main.py'), 'print("hi")')

            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            actionResult(await ensureWorkspaceAction({ studyId: study.id }))

            expect((await jobCreatedAt(job.id)).getTime()).toBe(backdated.getTime())
        })

        test('still re-anchors createdAt when the round has no files yet', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()

            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'INITIATED',
            })

            const backdated = new Date(Date.now() - 60_000)
            await db.updateTable('studyJob').set({ createdAt: backdated }).where('id', '=', job.id).execute()

            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            actionResult(await ensureWorkspaceAction({ studyId: study.id }))

            expect((await jobCreatedAt(job.id)).getTime()).toBeGreaterThan(backdated.getTime())
        })
    })

    // OTTER-719: the `load IDE` grant used to be unconditioned, so any lab member could read or
    // overwrite another lab's in-progress code. These exercise the RPC endpoints themselves.
    describe('server-owned file rules (OTTER-693)', () => {
        const mockCoder = () =>
            // Spread the real module: a bare factory drops exports the actions import (e.g. the
            // starter-code copy) and the mock then leaks into every later test in this file.
            vi.doMock('@/server/coder', async (importOriginal) => ({
                ...(await importOriginal<typeof import('@/server/coder')>()),
                createUserAndWorkspace: vi.fn(async () => ({ success: true, workspace: { id: 'ws-test' } })),
            }))

        const approvedStudy = async () => {
            const { org, user } = await mockSessionWithTestData()
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'INITIATED',
            })
            return { study, user, org }
        }

        // The dropzone filters these client-side, so without the action's own schema a caller
        // reaching past the UI could write anything under next.config's body cap.
        test('refuses an upload over the size limit', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { study } = await approvedStudy()

            const { uploadWorkspaceFileAction } = await import('./workspace-files.actions')
            const tooBig = new File(['x'.repeat(MAX_UPLOAD_FILE_BYTES + 1)], 'big.r', { type: 'text/plain' })

            expect('error' in (await uploadWorkspaceFileAction({ studyId: study.id, file: tooBig }))).toBe(true)
        })

        test('refuses an upload with an unaccepted extension', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { study } = await approvedStudy()

            const { uploadWorkspaceFileAction } = await import('./workspace-files.actions')
            const wrongType = new File(['whatever'], 'notes.exe', { type: 'application/octet-stream' })

            expect('error' in (await uploadWorkspaceFileAction({ studyId: study.id, file: wrongType }))).toBe(true)
        })

        // /code disables the button but /resubmit's table does not, so the rule has to live here or
        // the column ends up naming a file that no longer exists.
        test('refuses to delete the study main file, and deletes any other', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { study } = await approvedStudy()

            const studyDir = path.join(TEST_CODER_FILES, study.id)
            await fs.mkdir(studyDir, { recursive: true })
            await fs.writeFile(path.join(studyDir, 'main.r'), 'print(1)')
            await fs.writeFile(path.join(studyDir, 'helper.r'), 'print(2)')

            const { setMainCodeFileAction } = await import('./workspace-files.actions')
            await setMainCodeFileAction({ studyId: study.id, fileName: 'main.r' })

            const { deleteWorkspaceFileAction } = await import('./workspace-files.actions')
            expect('error' in (await deleteWorkspaceFileAction({ studyId: study.id, fileName: 'main.r' }))).toBe(true)
            await expect(fs.readFile(path.join(studyDir, 'main.r'), 'utf8')).resolves.toBe('print(1)')

            actionResult(await deleteWorkspaceFileAction({ studyId: study.id, fileName: 'helper.r' }))
            await expect(fs.readFile(path.join(studyDir, 'helper.r'), 'utf8')).rejects.toThrow()
        })

        // The card says IDE access cannot be shared or transferred, and 'load IDE' is granted to
        // the whole lab, so the claim has to be enforced where it is made.
        test('refuses a launch when another researcher in the same lab holds the IDE', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()

            const { study, org } = await approvedStudy()
            const { user: teammate } = await insertTestUser({ org })

            await db.updateTable('study').set({ ideOwnerId: teammate.id }).where('id', '=', study.id).execute()

            const { ensureWorkspaceAction } = await import('./workspaces.actions')

            expect('error' in (await ensureWorkspaceAction({ studyId: study.id }))).toBe(true)
        })

        test('allows the holder to launch again', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()

            const { study, user } = await approvedStudy()
            await db.updateTable('study').set({ ideOwnerId: user.id }).where('id', '=', study.id).execute()

            const { ensureWorkspaceAction } = await import('./workspaces.actions')

            expect('error' in (await ensureWorkspaceAction({ studyId: study.id }))).toBe(false)
        })
    })

    // OTTER-693: 'load IDE' is org-scoped and says nothing about where the study is in its
    // lifecycle, so a submitted round was mutable through every one of these endpoints.
    describe('code round lifecycle gate (OTTER-693)', () => {
        // Same spread-the-real-module reason as the sibling describe above: a bare factory drops
        // exports the actions import and leaks into every later test in this file.
        const mockCoder = () =>
            vi.doMock('@/server/coder', async (importOriginal) => ({
                ...(await importOriginal<typeof import('@/server/coder')>()),
                createUserAndWorkspace: vi.fn(async () => ({ success: true, workspace: { id: 'ws-test' } })),
                getCoderWorkspaceUrl: vi.fn(async () => 'https://coder.example/ws-test'),
            }))

        const studyAtJobStatus = async (statuses: StudyJobStatus[]) => {
            const { org, user } = await mockSessionWithTestData()
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: statuses[0],
            })
            for (const status of statuses.slice(1)) {
                await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status }).execute()
            }

            const studyDir = path.join(TEST_CODER_FILES, study.id)
            await fs.mkdir(studyDir, { recursive: true })
            await fs.writeFile(path.join(studyDir, 'main.r'), 'print(1)')
            await fs.writeFile(path.join(studyDir, 'helper.r'), 'print(2)')

            return { study, user, org, studyDir }
        }

        const mutations = async (studyId: string) => {
            const {
                uploadWorkspaceFileAction,
                setMainCodeFileAction,
                deleteWorkspaceFileAction,
                recordWorkspaceFileEditAction,
            } = await import('./workspace-files.actions')
            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            return {
                upload: () =>
                    uploadWorkspaceFileAction({
                        studyId,
                        file: new File(['print(3)'], 'added.r', { type: 'text/plain' }),
                    }),
                // main.r, so the later delete of helper.r is not refused by the main-file rule.
                setMain: () => setMainCodeFileAction({ studyId, fileName: 'main.r' }),
                remove: () => deleteWorkspaceFileAction({ studyId, fileName: 'helper.r' }),
                recordEdit: () => recordWorkspaceFileEditAction({ studyId, fileName: 'helper.r' }),
                launch: () => ensureWorkspaceAction({ studyId }),
            }
        }

        const mainFileName = (studyId: string) =>
            db
                .selectFrom('study')
                .select('mainCodeFileName')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
                .then((r) => r.mainCodeFileName)

        test('refuses every file mutation once the round is submitted', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()
            const { study, studyDir } = await studyAtJobStatus(['CODE-SUBMITTED'])

            const m = await mutations(study.id)
            for (const call of [m.upload, m.setMain, m.remove, m.recordEdit, m.launch]) {
                expect((await call()) ?? {}).toHaveProperty('error')
            }

            // The refusals have to leave the workspace exactly as the reviewer sees it.
            expect(await mainFileName(study.id)).toBeNull()
            await expect(fs.readFile(path.join(studyDir, 'helper.r'), 'utf8')).resolves.toBe('print(2)')
            await expect(fs.readFile(path.join(studyDir, 'added.r'), 'utf8')).rejects.toThrow()
        })

        test('leaves the IDE unclaimed when a launch is refused', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()
            const { study } = await studyAtJobStatus(['CODE-SUBMITTED'])

            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            expect('error' in (await ensureWorkspaceAction({ studyId: study.id }))).toBe(true)

            const owner = await db
                .selectFrom('study')
                .select('ideOwnerId')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(owner.ideOwnerId).toBeNull()
        })

        test('refuses every file mutation once the code is approved', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()
            const { study } = await studyAtJobStatus(['CODE-SUBMITTED', 'CODE-APPROVED'])

            const m = await mutations(study.id)
            for (const call of [m.upload, m.setMain, m.remove, m.recordEdit, m.launch]) {
                expect((await call()) ?? {}).toHaveProperty('error')
            }
        })

        // The regression that would break /resubmit: it writes through these same actions.
        test('still allows every file mutation after a change request', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            mockCoder()
            const { study } = await studyAtJobStatus(['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])

            const m = await mutations(study.id)
            for (const call of [m.upload, m.setMain, m.recordEdit, m.launch, m.remove]) {
                // recordWorkspaceFileEditAction resolves void on success, so a missing result is
                // itself a pass; only an `error` key means the gate refused.
                expect((await call()) ?? {}).not.toHaveProperty('error')
            }

            expect(await mainFileName(study.id)).toBe('main.r')
        })

        test('preload does nothing and opens no round job once the round is submitted', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { study } = await studyAtJobStatus(['CODE-SUBMITTED'])
            const jobsBefore = await db.selectFrom('studyJob').select('id').where('studyId', '=', study.id).execute()

            const { ensureStarterCodePreloadAction } = await import('./workspaces.actions')
            expect(actionResult(await ensureStarterCodePreloadAction({ studyId: study.id }))).toEqual({
                preloaded: false,
            })

            const jobsAfter = await db.selectFrom('studyJob').select('id').where('studyId', '=', study.id).execute()
            expect(jobsAfter).toHaveLength(jobsBefore.length)
        })
    })

    describe('cross-lab workspace access', () => {
        const setupOtherLabStudy = async () => {
            const { studyId } = await createTestProposalDraft({ enclaveSlug: 'otter719-enclave' })

            // orgType defaults to 'enclave' and the rule under test applies to lab members only.
            const otherLab = await insertTestOrg({ slug: 'otter719-other-lab', type: 'lab' })
            const { user: intruder } = await insertTestUser({ org: otherLab })
            mockClerkSession({
                clerkUserId: intruder.clerkId,
                orgSlug: otherLab.slug,
                userId: intruder.id,
                orgId: otherLab.id,
                orgType: 'lab',
            })

            // vi.resetModules() in beforeEach means the dynamically-imported action binds a fresh
            // logger a spy would not cover; the denial messages in stderr are deliberate.
            return { studyId }
        }

        const expectDenied = (result: unknown) =>
            expect(result).toMatchObject({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })

        test('a lab member cannot list another lab study workspace files', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { studyId } = await setupOtherLabStudy()

            const { listWorkspaceFilesAction } = await import('./workspaces.actions')

            expectDenied(await listWorkspaceFilesAction({ studyId }))
        })

        test('a lab member cannot read or delete another lab study workspace files', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { studyId } = await setupOtherLabStudy()

            const studyDir = path.join(TEST_CODER_FILES, studyId)
            await fs.mkdir(studyDir, { recursive: true })
            await fs.writeFile(path.join(studyDir, 'main.r'), 'print("secret")')

            const { readWorkspaceFileAction, deleteWorkspaceFileAction } = await import('./workspace-files.actions')

            expectDenied(await readWorkspaceFileAction({ studyId, fileName: 'main.r' }))
            expectDenied(await deleteWorkspaceFileAction({ studyId, fileName: 'main.r' }))

            await expect(fs.readFile(path.join(studyDir, 'main.r'), 'utf8')).resolves.toBe('print("secret")')
        })

        test('a lab member cannot launch a workspace for another lab study', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            const { studyId } = await setupOtherLabStudy()

            const { ensureWorkspaceAction, getLastSubmissionInfoAction } = await import('./workspaces.actions')

            expectDenied(await ensureWorkspaceAction({ studyId }))
            expectDenied(await getLastSubmissionInfoAction({ studyId }))
        })

        test('the submitting lab still reaches its own study workspace', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES

            const { studyId } = await createTestProposalDraft({ enclaveSlug: 'otter719-owner-enclave' })

            const { listWorkspaceFilesAction } = await import('./workspaces.actions')

            expect(actionResult(await listWorkspaceFilesAction({ studyId }))).toMatchObject({ files: [] })
        })
    })

    /**
     * OTTER-817: the Coder account is keyed on the IDE owner, not the proposal submitter. Unlike the
     * describes above this must NOT mock @/server/coder — the whole point is to run the real
     * resolution against the real db, so global.fetch is stubbed at the Coder API boundary instead.
     */
    describe('IDE owner provisioning (OTTER-817)', () => {
        const SUBMITTER_EMAIL = 'otter817-submitter@test.com'

        // The describes above doMock @/server/coder, and a doMock outlives resetModules — without
        // this the action imports a stubbed createUserAndWorkspace and never reaches the API.
        beforeEach(() => {
            vi.doUnmock('@/server/coder')
        })

        const stubCoderApi = () => {
            const calls: string[] = []
            const ok = (json: unknown) => ({ ok: true, json: async () => json })

            global.fetch = vi.fn(async (url: string, init?: { body?: string }) => {
                calls.push(url)
                if (url.includes('/api/v2/users?')) return ok({ users: [] })
                // Echo the posted username back, as Coder does — that is what the workspace path is
                // then built from, so the assertions below are testing the real chain.
                if (url.endsWith('/api/v2/users')) return ok(JSON.parse(init?.body ?? '{}'))
                if (url.includes('/api/v2/organizations') && url.includes('/workspaces')) return ok({ id: 'ws-new' })
                if (url.includes('/api/v2/organizations')) return ok([{ id: 'org1', name: 'coder' }])
                if (url.includes('/api/v2/templates')) return ok([{ id: 'tpl1', name: 'test-template' }])
                // The workspace read 404s, which is what routes the flow into workspace creation.
                return { ok: false, status: 404, text: async () => 'Not found' }
            }) as unknown as typeof global.fetch

            return calls
        }

        // The launcher reaches `load IDE` through the lab arm of the rule (permissions.ts), so the
        // session org has to be the lab that submitted the study.
        const studyLaunchedByTeammate = async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            process.env.CODER_API_ENDPOINT = 'https://coder.test'
            process.env.CODER_TOKEN = 'token'
            process.env.CODER_TEMPLATE = 'test-template'

            const { org: lab, user: launcher } = await mockSessionWithTestData({ orgType: 'lab' })
            const enclave = await insertTestOrg({ slug: `otter817-enclave-${Math.random().toString(36).slice(2, 8)}` })
            const { user: submitter } = await insertTestUser({ org: lab, email: SUBMITTER_EMAIL })
            const { study } = await insertTestStudyOnly({
                org: enclave,
                submittedByOrg: lab,
                researcherId: submitter.id,
            })
            await insertTestCodeEnv({ orgId: enclave.id, language: 'R' })

            return { study, launcher, submitter }
        }

        test('queries Coder for the launcher, not the proposal submitter', async () => {
            const { study, launcher } = await studyLaunchedByTeammate()
            const calls = stubCoderApi()

            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            actionResult(await ensureWorkspaceAction({ studyId: study.id }))

            const lookup = calls.find((u) => u.includes('/api/v2/users?'))
            expect(lookup).toContain(encodeURIComponent(launcher.email!))
            expect(calls.join(' ')).not.toContain(encodeURIComponent(SUBMITTER_EMAIL))
        })

        test("creates the workspace under the launcher's Coder account", async () => {
            const { study, launcher } = await studyLaunchedByTeammate()
            const calls = stubCoderApi()

            const { generateCoderUsername } = await import('@/server/coder')
            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            actionResult(await ensureWorkspaceAction({ studyId: study.id }))

            const create = calls.find((u) => u.includes('/workspaces'))
            expect(create).toContain(`/members/${generateCoderUsername(launcher.email!)}/workspaces`)
            expect(create).not.toContain(generateCoderUsername(SUBMITTER_EMAIL))
        })

        // The other direction: the fix must not break the case that always worked.
        test('still provisions under the submitter when the submitter launches', async () => {
            process.env.CODER_FILES = TEST_CODER_FILES
            process.env.CODER_API_ENDPOINT = 'https://coder.test'
            process.env.CODER_TOKEN = 'token'
            process.env.CODER_TEMPLATE = 'test-template'

            const { org: lab, user: submitter } = await mockSessionWithTestData({ orgType: 'lab' })
            const enclave = await insertTestOrg({ slug: `otter817-own-${Math.random().toString(36).slice(2, 8)}` })
            const { study } = await insertTestStudyOnly({
                org: enclave,
                submittedByOrg: lab,
                researcherId: submitter.id,
            })
            await insertTestCodeEnv({ orgId: enclave.id, language: 'R' })
            const calls = stubCoderApi()

            const { generateCoderUsername } = await import('@/server/coder')
            const { ensureWorkspaceAction } = await import('./workspaces.actions')
            actionResult(await ensureWorkspaceAction({ studyId: study.id }))

            expect(calls.find((u) => u.includes('/workspaces'))).toContain(
                `/members/${generateCoderUsername(submitter.email!)}/workspaces`,
            )
        })
    })
})
