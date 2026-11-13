import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from '../../tests/unit.helpers'
import { createWorkspace, keyPath, removeWorkspace, RunnerFailure, safeJoin, writeFiles } from './workspace.ts'

describe('safeJoin', () => {
    it('joins nested relative paths under the root', () => {
        expect(safeJoin('/tmp/work/src', 'a/b/c.R')).toBe('/tmp/work/src/a/b/c.R')
    })

    it('keeps a backslash as part of the file name', () => {
        expect(safeJoin('/tmp/work/src', 'dir\\a.R')).toBe('/tmp/work/src/dir\\a.R')
    })

    it.each(['/etc/passwd', '../x.R', 'a/../../x.R', 'a//b.R', '', 'a\0b'])('rejects %j', (relative) => {
        expect(() => safeJoin('/tmp/work/src', relative)).toThrow(RunnerFailure)
    })
})

describe('keyPath', () => {
    it('drops empty and "." segments that the app keeps in uploaded names', () => {
        expect(keyPath('code/./main.R', 'code/')).toBe('main.R')
        expect(keyPath('code/a//b.R', 'code/')).toBe('a/b.R')
        expect(keyPath('code/dir\\a.R', 'code/')).toBe('dir\\a.R')
        expect(keyPath('code/../x.R', 'code/')).toBe('../x.R')
    })
})

describe('createWorkspace', () => {
    it("creates the work folders, with Semgrep's temp folder inside the workspace", async () => {
        const work = await createWorkspace()
        try {
            expect(path.dirname(work.tmp)).toBe(work.root)
            for (const dir of [work.src, work.notebooks, work.rules, work.tmp]) expect(fs.existsSync(dir)).toBe(true)
        } finally {
            await removeWorkspace(work)
        }
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
