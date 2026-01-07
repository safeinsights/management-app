import { mockSessionWithTestData, actionResult, insertTestStudyJobData } from '@/tests/unit.helpers'
import { describe, expect, test, afterEach } from 'vitest'
import { listWorkspaceFilesAction } from './workspaces.actions'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

describe('Workspace Actions', () => {
    // Setup a temp directory for this test suite
    const TEST_CODER_FILES = '/tmp/coder-test-suite-' + Math.random().toString(36).slice(2)

    // Save original env var to restore later
    const originalCoderFiles = process.env.CODER_FILES

    // Ensure clean state before start
    try {
        fs.rm(TEST_CODER_FILES, { recursive: true, force: true })
    } catch {
        // ignore
    }

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

        const result = actionResult(await listWorkspaceFilesAction({ studyId: study.id }))

        expect(result.files).toContain('main.py')
        expect(result.files).toContain('README.md')
        expect(result.files).toHaveLength(3) // main.py, README.md, data.csv
    })
})
