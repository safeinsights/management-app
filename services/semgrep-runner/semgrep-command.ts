import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOTEBOOK_ROOT, SUBMISSION_ROOT } from './semgrep.ts'
import type { Workspace } from './workspace.ts'

export type CommandInvocation = { file: string; args: string[] }
export type CommandResult = { code: number | null; stdout: string; stderr: string; aborted: boolean }
export type SemgrepCommand = (
    invocation: CommandInvocation,
    options: { cwd: string; signal: AbortSignal },
) => Promise<CommandResult>

export const SEMGREP_PYTHON = '/opt/semgrep/bin/python'
export const SEMGREP_TEST_SHIM = path.join(path.dirname(fileURLToPath(import.meta.url)), 'semgrep-test-shim.py')

const COMMON_FLAGS = ['--metrics=off', '--disable-version-check']

export const SCAN_FLAGS = [
    ...COMMON_FLAGS,
    // The submission must not be able to hide code from review. These turn off `nosemgrep`
    // comments, .gitignore and .semgrepignore files, and Semgrep's default ignore list (which
    // skips tests/, build/, and node_modules/). The default 1 MB size limit would skip a file
    // padded past it; a file too large to finish is still reported, as a timeout.
    '--disable-nosem',
    '--no-git-ignore',
    '--x-ignore-semgrepignore-files',
    '--max-target-bytes',
    '0',
]

// Rules are always the local folder the runner wrote, never a registry config.
export function scanInvocation(work: Workspace): CommandInvocation {
    return {
        file: 'semgrep',
        args: [
            'scan',
            '--config',
            work.rules,
            '--json',
            '--output',
            work.report,
            ...SCAN_FLAGS,
            SUBMISSION_ROOT,
            NOTEBOOK_ROOT,
        ],
    }
}

// Same flags as the iac CI fixture test, which has no --disable-nosem.
export function testInvocation(work: Workspace): CommandInvocation {
    return {
        file: SEMGREP_PYTHON,
        args: [SEMGREP_TEST_SHIM, '--test', '--json', ...COMMON_FLAGS, '--config', work.rules, SUBMISSION_ROOT],
    }
}

const MAX_STDERR_CHARS = 64 * 1024

/**
 * Runs the command in its own process group. Semgrep starts semgrep-core as a child, which survives a
 * kill of its parent and keeps the output pipes open, so the whole group is killed on abort and as
 * soon as the main process exits.
 */
export function spawnCommand(
    { file, args }: CommandInvocation,
    { cwd, signal }: { cwd: string; signal: AbortSignal },
): Promise<CommandResult> {
    if (signal.aborted) return Promise.resolve({ code: null, stdout: '', stderr: '', aborted: true })

    return new Promise((resolve) => {
        const child = spawn(file, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        let aborted = false

        const killGroup = () => {
            if (child.pid === undefined) return
            try {
                process.kill(-child.pid, 'SIGKILL')
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
            }
        }
        const onAbort = () => {
            aborted = true
            killGroup()
        }
        const settle = (code: number | null) => {
            signal.removeEventListener('abort', onAbort)
            resolve({ code, stdout, stderr, aborted })
        }

        signal.addEventListener('abort', onAbort, { once: true })
        child.stdout.setEncoding('utf-8').on('data', (chunk: string) => (stdout += chunk))
        child.stderr.setEncoding('utf-8').on('data', (chunk: string) => {
            if (stderr.length < MAX_STDERR_CHARS) stderr = (stderr + chunk).slice(0, MAX_STDERR_CHARS)
        })
        child.on('exit', killGroup)
        child.on('error', () => settle(null))
        child.on('close', settle)
    })
}
