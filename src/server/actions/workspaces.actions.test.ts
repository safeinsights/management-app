import { mockSessionWithTestData, actionResult, insertTestStudyJobData } from '@/tests/unit.helpers'
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

        expect(result.files).toContain('main.py')
        expect(result.files).toContain('README.md')
        expect(result.files).toHaveLength(3) // main.py, README.md, data.csv
    })
})
