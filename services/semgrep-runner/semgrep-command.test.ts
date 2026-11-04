import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from '../../tests/unit.helpers'
import { semgrepEnv, spawnCommand } from './semgrep-command.ts'

const node = (script: string) => ({ file: process.execPath, args: ['-e', script] })
const run = (script: string, signal = new AbortController().signal) =>
    spawnCommand(node(script), { cwd: os.tmpdir(), signal })

// A killed process whose parent already exited can stay a zombie when nothing reaps it (a container
// without an init); it no longer runs.
function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0)
    } catch {
        return false
    }
    try {
        return fs.readFileSync(`/proc/${pid}/stat`, 'utf-8').split(') ').pop()?.[0] !== 'Z'
    } catch {
        return true
    }
}

// Polls without a timeout of its own; the test timeout bounds it.
async function waitForFile(file: string): Promise<string> {
    while (!fs.existsSync(file) || !fs.readFileSync(file, 'utf-8')) {
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return fs.readFileSync(file, 'utf-8')
}

// A grandchild that shares the parent's stdout, as semgrep-core does, and writes its pid once it runs.
function withGrandchild(marker: string, parentTail: string) {
    const grandchild = `require('fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000)`
    return `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' }); ${parentTail}`
}

describe('spawnCommand', () => {
    it('returns the exit code and stdout', async () => {
        expect(await run("process.stdout.write('done')")).toEqual({
            code: 0,
            stdout: 'done',
            stderr: '',
            aborted: false,
        })
    })

    it('resolves on a non-zero exit', async () => {
        expect(await run("process.stderr.write('bad'); process.exit(3)")).toMatchObject({ code: 3, stderr: 'bad' })
    })

    it('resolves with no exit code when the executable is missing', async () => {
        const result = await spawnCommand(
            { file: '/nonexistent/semgrep', args: [] },
            { cwd: os.tmpdir(), signal: new AbortController().signal },
        )
        expect(result).toMatchObject({ code: null, aborted: false })
    })

    it('does not start a command when the signal has already fired', async () => {
        const controller = new AbortController()
        controller.abort()
        expect(await run('process.exit(0)', controller.signal)).toMatchObject({
            code: null,
            aborted: true,
        })
    })

    it('kills a grandchild that holds stdout once the main process exits', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-'))
        const marker = path.join(dir, 'pid')
        try {
            const result = await run(
                withGrandchild(
                    marker,
                    `const wait = () => require('fs').existsSync(${JSON.stringify(marker)}) ? process.exit(0) : setTimeout(wait, 10); wait()`,
                ),
            )

            expect(result).toMatchObject({ code: 0, aborted: false })
            const pid = Number(await waitForFile(marker))
            await expect.poll(() => isRunning(pid)).toBe(false)
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('kills the whole process group on abort', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-'))
        const marker = path.join(dir, 'pid')
        const controller = new AbortController()
        try {
            const pending = run(withGrandchild(marker, 'setInterval(() => {}, 1000)'), controller.signal)
            const pid = Number(await waitForFile(marker))
            controller.abort()

            expect(await pending).toMatchObject({ code: null, aborted: true })
            await expect.poll(() => isRunning(pid)).toBe(false)
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})

describe('semgrepEnv', () => {
    it("drops Node's library dir from the library path and keeps the rest", () => {
        expect(semgrepEnv({ HOME: '/tmp', LD_LIBRARY_PATH: '/var/lang/lib:/lib64:/usr/lib64' })).toEqual({
            HOME: '/tmp',
            LD_LIBRARY_PATH: '/lib64:/usr/lib64',
        })
        expect(semgrepEnv({ HOME: '/tmp' })).toEqual({ HOME: '/tmp' })
    })
})
