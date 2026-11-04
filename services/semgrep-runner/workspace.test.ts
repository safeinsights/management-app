import * as fs from 'node:fs'
import { describe, expect, it } from '../../tests/unit.helpers'
import { createWorkspace, removeWorkspace, RunnerFailure, safeJoin, writeFiles } from './workspace.ts'

describe('safeJoin', () => {
    it('joins nested relative paths under the root', () => {
        expect(safeJoin('/tmp/work/src', 'a/b/c.R')).toBe('/tmp/work/src/a/b/c.R')
    })

    it.each(['/etc/passwd', '../x.R', 'a/../../x.R', 'a//b.R', '', 'a\0b', 'a\\b'])('rejects %j', (relative) => {
        expect(() => safeJoin('/tmp/work/src', relative)).toThrow(RunnerFailure)
    })
})

describe('writeFiles', () => {
    it('writes nested files and refuses a file that is already there', async () => {
        const work = await createWorkspace()
        try {
            await writeFiles(work.src, [{ path: 'a/b.R', content: 'x <- 1' }])
            expect(fs.readFileSync(`${work.src}/a/b.R`, 'utf-8')).toBe('x <- 1')
            await expect(writeFiles(work.src, [{ path: 'a/b.R', content: '' }])).rejects.toMatchObject({
                code: 'workspace-failed',
            })
        } finally {
            await removeWorkspace(work)
        }
        expect(fs.existsSync(work.root)).toBe(false)
    })
})
