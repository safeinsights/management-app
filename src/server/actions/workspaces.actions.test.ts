import {
    mockSessionWithTestData,
    actionResult,
    insertTestBaselineJob,
    insertTestStudyJobData,
    db,
} from '@/tests/unit.helpers'
import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

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
})
