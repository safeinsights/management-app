import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { db, insertTestCodeEnv, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'

describe('initializeDevWorkspaceFiles', () => {
    const TEST_CODER_FILES = '/tmp/dev-test-suite-' + Math.random().toString(36).slice(2)
    const originalCoderFiles = process.env.CODER_FILES

    beforeEach(() => {
        vi.resetModules()
        process.env.CODER_FILES = TEST_CODER_FILES
        vi.doMock('@/server/config', async (importOriginal) => {
            const mod = await importOriginal<typeof import('@/server/config')>()
            return {
                ...mod,
                CODER_DISABLED: true,
                DEV_ENV: true,
                getConfigValue: vi.fn().mockImplementation((key) => process.env[key]),
            }
        })
        vi.doMock('@/server/storage', () => ({
            fetchFileContents: vi.fn().mockResolvedValue({
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
            }),
        }))
    })

    afterEach(async () => {
        try {
            await fs.rm(TEST_CODER_FILES, { recursive: true, force: true })
        } catch {
            // ignore
        }
        if (originalCoderFiles) process.env.CODER_FILES = originalCoderFiles
        else delete process.env.CODER_FILES

        vi.doUnmock('@/server/config')
        vi.doUnmock('@/server/storage')
    })

    // OTTER-547 regression: the previous implementation backdated starter files by a fixed
    // 60s from wall-clock. If Coder provisioning took longer than 60s, the starter files'
    // mtime ended up newer than the baseline studyJob.createdAt, which the UI reads as
    // "researcher has edited files" and enables Submit on a freshly-launched workspace.
    test('starter file mtimes are strictly older than the latest studyJob.createdAt, even after a long provisioning delay', async () => {
        const { org, user } = await mockSessionWithTestData()
        const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestCodeEnv({
            orgId: org.id,
            language: study.language,
            starterCodeFileNames: ['main.R'],
        })

        // Pretend Coder took ~2 minutes to come up. The pre-fix code would stamp files
        // at NOW-60s, which is ~60s NEWER than job.createdAt.
        const NOW = Date.now()
        vi.useFakeTimers()
        vi.setSystemTime(NOW + 120_000)

        try {
            const { initializeDevWorkspaceFiles } = await import('./dev')
            await initializeDevWorkspaceFiles(study.id)
        } finally {
            vi.useRealTimers()
        }

        const writtenFileStat = await fs.stat(`${TEST_CODER_FILES}/main.R`)
        const jobRow = await db
            .selectFrom('studyJob')
            .select('createdAt')
            .where('id', '=', job.id)
            .executeTakeFirstOrThrow()

        expect(writtenFileStat.mtime.getTime()).toBeLessThan(jobRow.createdAt.getTime())
    })

    const seedContext = async (name: 'SYSTEM' | 'PYTHON' | 'R', content: string) => {
        await db.deleteFrom('agentContext').where('name', '=', name).where('orgId', 'is', null).execute()
        await db.insertInto('agentContext').values({ name, content, orgId: null }).execute()
    }

    test('writes CLAUDE.md from agent context on launch', async () => {
        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, language: 'R' })
        await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: ['main.R'] })
        await seedContext('SYSTEM', 'system context')
        await seedContext('R', 'r context')

        const { initializeDevWorkspaceFiles } = await import('./dev')
        await initializeDevWorkspaceFiles(study.id)

        expect(await fs.readFile(`${TEST_CODER_FILES}/CLAUDE.md`, 'utf-8')).toBe(
            'system context\nr context\nNo data sources provided',
        )
    })

    test('refreshes CLAUDE.md on relaunch without recopying starter code', async () => {
        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, language: 'R' })
        await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: ['main.R'] })
        await seedContext('SYSTEM', 'system context')
        await seedContext('R', 'r context')

        const { initializeDevWorkspaceFiles } = await import('./dev')
        await initializeDevWorkspaceFiles(study.id)

        // User edits their starter code, then context is updated and the workspace is relaunched.
        await fs.writeFile(`${TEST_CODER_FILES}/main.R`, 'user edits', 'utf-8')
        await seedContext('SYSTEM', 'updated system context')
        await initializeDevWorkspaceFiles(study.id)

        expect(await fs.readFile(`${TEST_CODER_FILES}/main.R`, 'utf-8')).toBe('user edits')
        expect(await fs.readFile(`${TEST_CODER_FILES}/CLAUDE.md`, 'utf-8')).toBe(
            'updated system context\nr context\nNo data sources provided',
        )
    })

    test('preserves a manually edited CLAUDE.md on relaunch', async () => {
        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, language: 'R' })
        await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: ['main.R'] })
        await seedContext('SYSTEM', 'system context')
        await seedContext('R', 'r context')

        const { initializeDevWorkspaceFiles } = await import('./dev')
        await initializeDevWorkspaceFiles(study.id)

        await fs.writeFile(`${TEST_CODER_FILES}/CLAUDE.md`, 'my own context notes', 'utf-8')
        await seedContext('SYSTEM', 'updated system context')
        await initializeDevWorkspaceFiles(study.id)

        expect(await fs.readFile(`${TEST_CODER_FILES}/CLAUDE.md`, 'utf-8')).toBe('my own context notes')
    })
})
