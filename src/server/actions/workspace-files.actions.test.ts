import { mockSessionWithTestData, actionResult, insertTestStudyJobData, db } from '@/tests/unit.helpers'
import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

describe('workspace-files delete opens a code-draft round (OTTER-636)', () => {
    const TEST_CODER_FILES = '/tmp/wsfiles-test-suite-' + Math.random().toString(36).slice(2)
    const originalCoderFiles = process.env.CODER_FILES

    const jobCount = (studyId: string) =>
        db
            .selectFrom('studyJob')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('studyId', '=', studyId)
            .executeTakeFirstOrThrow()
            .then((r) => Number(r.n))

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
        process.env.CODER_FILES = TEST_CODER_FILES
    })

    afterEach(async () => {
        try {
            await fs.rm(TEST_CODER_FILES, { recursive: true, force: true })
        } catch {
            // ignore
        }
        if (originalCoderFiles) process.env.CODER_FILES = originalCoderFiles
        else delete process.env.CODER_FILES
    })

    test('deleting a file after CODE-CHANGES-REQUESTED opens a fresh INITIATED round', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('studyJobFile')
            .values({ studyJobId: job.id, name: 'main.r', path: `p/${job.id}/main.r`, fileType: 'MAIN-CODE' })
            .execute()
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-CHANGES-REQUESTED' })
            .execute()

        const studyDir = path.join(TEST_CODER_FILES, study.id)
        await fs.mkdir(studyDir, { recursive: true })
        await fs.writeFile(path.join(studyDir, 'main.r'), 'print(1)')

        const { deleteWorkspaceFileAction } = await import('./workspace-files.actions')
        actionResult(await deleteWorkspaceFileAction({ studyId: study.id, fileName: 'main.r' }))

        // The delete is a real edit, so it opens the fresh code-draft round rather than revising the
        // reviewed one — the study now reads "Code draft".
        expect(await jobCount(study.id)).toBe(2)
    })

    test('deleting within an open INITIATED round reuses it (no extra round)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'INITIATED',
        })

        const studyDir = path.join(TEST_CODER_FILES, study.id)
        await fs.mkdir(studyDir, { recursive: true })
        await fs.writeFile(path.join(studyDir, 'main.r'), 'print(1)')

        const { deleteWorkspaceFileAction } = await import('./workspace-files.actions')
        actionResult(await deleteWorkspaceFileAction({ studyId: study.id, fileName: 'main.r' }))

        expect(await jobCount(study.id)).toBe(1)
    })
})
