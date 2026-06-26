import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { db, createWorkspaceDir, cleanupWorkspaceDirs, mockSessionWithTestData } from '@/tests/unit.helpers'
import { writeAgentContext } from './context-writer'

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex')

const seedContext = async (name: 'SYSTEM' | 'PYTHON', content: string) => {
    await db.deleteFrom('agentContext').where('name', '=', name).where('orgId', 'is', null).execute()
    await db.insertInto('agentContext').values({ name, content, orgId: null }).execute()
}

describe('writeAgentContext', () => {
    const dirs: string[] = []
    const pastDate = new Date('2024-01-01T00:00:00.000Z')
    let orgId: string

    beforeEach(async () => {
        const { org } = await mockSessionWithTestData()
        orgId = org.id
        await db.deleteFrom('agentContext').execute()
        await seedContext('SYSTEM', 'system context')
        await seedContext('PYTHON', 'python context')
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(dirs)
    })

    const write = (dir: string) => writeAgentContext({ targetDir: dir, language: 'PYTHON', orgId, pastDate })
    const readContext = (dir: string) => fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf-8')
    // No data sources are seeded for the test org, so the data-sources section is the empty marker.
    const expectedContent = 'system context\npython context\nNo data sources provided'

    test('writes CLAUDE.md and a hash sentinel when none exists, backdating the mtime', async () => {
        const dir = await createWorkspaceDir('context-writer')
        dirs.push(dir)

        await write(dir)

        expect(await readContext(dir)).toBe(expectedContent)

        const sentinel = await fs.readFile(path.join(dir, '.claude-context-hash'), 'utf-8')
        expect(sentinel.trim()).toBe(sha256(expectedContent))

        const stat = await fs.stat(path.join(dir, 'CLAUDE.md'))
        expect(stat.mtime.getTime()).toBe(pastDate.getTime())
    })

    test('refreshes an untouched CLAUDE.md when DB context changes', async () => {
        const dir = await createWorkspaceDir('context-writer')
        dirs.push(dir)

        await write(dir)

        await seedContext('SYSTEM', 'updated system context')
        await write(dir)

        const refreshed = 'updated system context\npython context\nNo data sources provided'
        expect(await readContext(dir)).toBe(refreshed)
        const sentinel = await fs.readFile(path.join(dir, '.claude-context-hash'), 'utf-8')
        expect(sentinel.trim()).toBe(sha256(refreshed))
    })

    test('preserves a CLAUDE.md the user manually edited', async () => {
        const dir = await createWorkspaceDir('context-writer')
        dirs.push(dir)

        await write(dir)

        const userEdited = 'my own notes'
        await fs.writeFile(path.join(dir, 'CLAUDE.md'), userEdited, 'utf-8')

        await seedContext('SYSTEM', 'updated system context')
        await write(dir)

        expect(await readContext(dir)).toBe(userEdited)
    })

    test('preserves a pre-existing CLAUDE.md that has no sentinel', async () => {
        const dir = await createWorkspaceDir('context-writer')
        dirs.push(dir)

        const preExisting = 'legacy context from before the sentinel existed'
        await fs.writeFile(path.join(dir, 'CLAUDE.md'), preExisting, 'utf-8')

        await write(dir)

        expect(await readContext(dir)).toBe(preExisting)
        await expect(fs.access(path.join(dir, '.claude-context-hash'))).rejects.toThrow()
    })

    test('does not rewrite when content is unchanged', async () => {
        const dir = await createWorkspaceDir('context-writer')
        dirs.push(dir)

        await write(dir)
        const firstMtime = (await fs.stat(path.join(dir, 'CLAUDE.md'))).mtimeMs

        await writeAgentContext({
            targetDir: dir,
            language: 'PYTHON',
            orgId,
            pastDate: new Date('2024-02-02T00:00:00.000Z'),
        })
        const secondMtime = (await fs.stat(path.join(dir, 'CLAUDE.md'))).mtimeMs

        expect(secondMtime).toBe(firstMtime)
    })
})
