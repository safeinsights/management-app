import { mockSessionWithTestData, actionResult, insertTestStudyJobData } from '@/tests/unit.helpers'
import { describe, expect, test } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Mock dependencies moved to doMock in beforeEach

describe('Workspace Actions', () => {
    // Setup a temp directory for this test suite
    const TEST_CODER_FILES = '/tmp/coder-test-suite-' + Math.random().toString(36).slice(2)

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
