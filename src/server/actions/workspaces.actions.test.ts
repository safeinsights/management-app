import {
    mockSessionWithTestData,
    actionResult,
    createTestProposalDraft,
    insertTestBaselineJob,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestCodeEnv,
    insertTestUser,
    mockClerkSession,
    db,
} from '@/tests/unit.helpers'
import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pathForStarterCode } from '@/lib/paths'

// Echo the key back so a test can assert which S3 key gets signed.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async (key: string) => `https://signed.example/${key}`),
    }
})

// Mock dependencies moved to doMock in beforeEach

describe('Workspace Actions', () => {
    // Setup a temp directory for this test suite
    const TEST_CODER_FILES = '/tmp/coder-test-suite-' + Math.random().toString(36).slice(2)

    // Save original env var to restore later
    const originalCoderFiles = process.env.CODER_FILES

    fs.rm(TEST_CODER_FILES, { recursive: true, force: true })

    beforeEach(() => {
        vi.resetModules() // Ensure we get fresh modules with our mocks applied

        // Define the mock for this test run
        vi.doMock('@/server/config', async (importOriginal) => {
            const mod = await importOriginal<typeof import('@/server/config')>()
            return {
                ...mod,
                CODER_DISABLED: false, // Force false to test production path logic
                getConfigValue: vi.fn().mockImplementation((key) => process.env[key]),
            }
        })
    })

    afterEach(async () => {
        // Cleanup after each test
        try {
            await fs.rm(TEST_CODER_FILES, { recursive: true, force: true })
        } catch {
            // ignore
        }

        // Restore environment
        if (originalCoderFiles) {
            process.env.CODER_FILES = originalCoderFiles
        } else {
            delete process.env.CODER_FILES
        }
    })

    test('listWorkspaceFilesAction gracefully handles missing workspace directory', async () => {
        // Point to our temp location which currently does not exist
        process.env.CODER_FILES = TEST_CODER_FILES

        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        // Dynamic import to ensure it picks up the mock after resetModules
        const { listWorkspaceFilesAction } = await import('./workspaces.actions')

        const result = actionResult(await listWorkspaceFilesAction({ studyId: study.id }))

        // Should return empty list, not throw
        expect(result).toMatchObject({
            files: [],
            suggestedMain: undefined,
        })
    })

    test('listWorkspaceFilesAction lists files from workspace directory', async () => {
        process.env.CODER_FILES = TEST_CODER_FILES

        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const studyDir = path.join(TEST_CODER_FILES, study.id)

        // Create mock workspace with files
        await fs.mkdir(studyDir, { recursive: true })
        await fs.writeFile(path.join(studyDir, 'main.py'), 'print("hello")')
        await fs.writeFile(path.join(studyDir, 'README.md'), '# readme')
        await fs.writeFile(path.join(studyDir, 'data.csv'), '1,2,3') // File
        await fs.mkdir(path.join(studyDir, 'subdir')) // Directory (should be ignored based on logic)

        // Dynamic import to ensure it picks up the mock after resetModules
        const { listWorkspaceFilesAction } = await import('./workspaces.actions')

        const result = actionResult(await listWorkspaceFilesAction({ studyId: study.id }))

        const fileNames = result.files.map((f: { name: string }) => f.name)
        expect(fileNames).toContain('main.py')
        expect(fileNames).toContain('README.md')
        expect(result.files).toHaveLength(3) // main.py, README.md, data.csv
        expect(result.files[0]).toHaveProperty('size')
        expect(result.files[0]).toHaveProperty('mtime')
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

    // OTTER-601: the submit-enable baseline must be the last *submission* time, not the round job's
    // createdAt — otherwise relaunching an already-submitted study (which no longer mints a fresh
    // job) re-enables Submit with no edits.
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

            // A relaunch opens a fresh INITIATED round-2 job (newer) with no files.
            await insertTestBaselineJob(study.id)

            const { getLastSubmissionInfoAction } = await import('./workspaces.actions')
            const result = actionResult(await getLastSubmissionInfoAction({ studyId: study.id }))

            // Baseline stays the prior submission, not the empty round-2 job.
            expect(result?.createdAt).toBe(submittedAt.toISOString())
            expect(result?.fileNames).toEqual(['main.r'])
        })
    })

    // OTTER-602: launching the IDE must not reset submit-enable when files were already uploaded
    // manually. The re-anchor that fixed OTTER-601 (advance createdAt so post-launch edits enable
    // Submit) is correct only on an empty round — with files present it marks them all stale.
    describe('ensureWorkspaceAction submit-enable baseline (OTTER-602)', () => {
        const mockCoder = () =>
            vi.doMock('@/server/coder', () => ({
                createUserAndWorkspace: vi.fn(async () => ({ success: true, workspace: { id: 'ws-test' } })),
                getCoderWorkspaceUrl: vi.fn(async () => 'https://coder.example/ws-test'),
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

            // Backdate the round so a wrongful re-anchor would be unmistakable.
            const backdated = new Date(Date.now() - 60_000)
            await db.updateTable('studyJob').set({ createdAt: backdated }).where('id', '=', job.id).execute()

            // Simulate a manual upload: a real file on disk in the study workspace.
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

    // OTTER-719: the `load IDE` grant used to be unconditioned, so any member of any lab org could
    // read, overwrite, or delete another lab's in-progress code just by supplying its studyId. These
    // exercise the RPC endpoints themselves, not just the ability object.
    describe('cross-lab workspace access', () => {
        const setupOtherLabStudy = async () => {
            const { studyId } = await createTestProposalDraft({ enclaveSlug: 'otter719-enclave' })

            // Switch to a member of an unrelated lab. orgType defaults to 'enclave', and the rule
            // under test only applies to lab members, so 'lab' must be explicit here.
            const otherLab = await insertTestOrg({ slug: 'otter719-other-lab', type: 'lab' })
            const { user: intruder } = await insertTestUser({ org: otherLab })
            mockClerkSession({
                clerkUserId: intruder.clerkId,
                orgSlug: otherLab.slug,
                userId: intruder.id,
                orgId: otherLab.id,
                orgType: 'lab',
            })

            // No logger spy here: this suite's beforeEach calls vi.resetModules(), so the
            // dynamically-imported action binds a fresh logger instance a spy would not cover.
            // The denial messages in stderr are the expected, deliberate audit log.
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

            // The denial must actually protect the bytes on disk, not merely return an error.
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

            // Regression guard: the fix must not break the legitimate path.
            const { studyId } = await createTestProposalDraft({ enclaveSlug: 'otter719-owner-enclave' })

            const { listWorkspaceFilesAction } = await import('./workspaces.actions')

            expect(actionResult(await listWorkspaceFilesAction({ studyId }))).toMatchObject({ files: [] })
        })
    })
})
