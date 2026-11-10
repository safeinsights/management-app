import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { processEnv } from './config.ts'
import { NOTEBOOK_ROOT, SUBMISSION_ROOT } from './semgrep.ts'
import type { Workspace } from './workspace.ts'

export type CommandInvocation = { file: string; args: string[]; env?: Record<string, string> }
export type CommandResult = { code: number | null; stdout: string; stderr: string; aborted: boolean }
export type SemgrepCommand = (
    invocation: CommandInvocation,
    options: { cwd: string; signal: AbortSignal },
) => Promise<CommandResult>

export const SEMGREP_BIN = '/opt/semgrep/bin/semgrep'
export const SEMGREP_PYTHON = '/opt/semgrep/bin/python'
export const SEMGREP_TEST_SHIM = path.join(path.dirname(fileURLToPath(import.meta.url)), 'semgrep-test-shim.py')

const COMMON_FLAGS = ['--metrics=off', '--disable-version-check']

export const SCAN_FLAGS = [
    ...COMMON_FLAGS,
    // A submission must not hide code from review: no `nosemgrep`, no .gitignore or .semgrepignore, no
    // default ignore list (tests/, build/, node_modules/). The 1 MB default would skip a padded file; a
    // file too large to finish is still reported, as a timeout.
    '--disable-nosem',
    '--no-git-ignore',
    '--x-ignore-semgrepignore-files',
    '--max-target-bytes',
    '0',
]

// Test mode runs two Semgrep processes at once, and a warm Lambda keeps /tmp between invocations. Each
// process gets its own settings and log inside the workspace, so they neither race nor outlive the run.
function runEnv(work: Workspace, name: string): Record<string, string> {
    return {
        TMPDIR: work.tmp,
        SEMGREP_SETTINGS_FILE: path.join(work.tmp, name, 'settings.yml'),
        SEMGREP_LOG_FILE: path.join(work.tmp, name, 'semgrep.log'),
    }
}

// Rules are always the local folder the runner wrote, never a registry config.
export function scanInvocation(work: Workspace): CommandInvocation {
    return {
        file: SEMGREP_BIN,
        env: runEnv(work, 'scan'),
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
        env: runEnv(work, 'test'),
        args: [SEMGREP_TEST_SHIM, '--test', '--json', ...COMMON_FLAGS, '--config', work.rules, SUBMISSION_ROOT],
    }
}

const MAX_STDERR_CHARS = 64 * 1024

// The Lambda Node image puts /var/lang/lib, Node's own OpenSSL build, first on LD_LIBRARY_PATH. The system
// Python that runs Semgrep cannot load its ssl module against that build.
const NODE_LIBRARY_DIR = '/var/lang/lib'

export function semgrepEnv<T extends Record<string, string | undefined>>(env: T): T {
    if (env.LD_LIBRARY_PATH === undefined) return env
    const dirs = env.LD_LIBRARY_PATH.split(':').filter((dir) => dir !== NODE_LIBRARY_DIR)
    return { ...env, LD_LIBRARY_PATH: dirs.join(':') }
}

/**
 * Runs the command in its own process group. Semgrep starts semgrep-core as a child, which survives a
 * kill of its parent and keeps the output pipes open, so the whole group is killed on abort and as
 * soon as the main process exits.
 */
export function spawnCommand(
    { file, args, env }: CommandInvocation,
    { cwd, signal }: { cwd: string; signal: AbortSignal },
): Promise<CommandResult> {
    if (signal.aborted) return Promise.resolve({ code: null, stdout: '', stderr: '', aborted: true })

    return new Promise((resolve) => {
        const child = spawn(file, args, {
            cwd,
            env: { ...semgrepEnv(processEnv()), ...env },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
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
